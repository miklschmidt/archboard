// Running one Git command without ever blocking Bun's process supervisor.
//
// A Git command is spawned as the leader of a detached process group, so that
// a hung or runaway Git can be killed as a group without taking anything else
// with it, and the orphan guard (git-guard.ts) ends that group if this process
// dies first. Everything here is about that discipline: bounded output, a
// timeout, cancellation, and noticing a descendant that outlives Git.

import type { Subprocess } from "bun";

import { GIT_MS } from "@archboard/timing";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	type ProcessGroupIdentity,
} from "#runtime/processes/group.ts";
import { stopAndKillOwnedGroup } from "#runtime/processes/git-group-termination.ts";
import { guardGitGroup, releaseGitGroup } from "#runtime/processes/git-guard.ts";
import { asError, errorMessage } from "@archboard/diagnostics/thrown-error";
import { GitCommandError } from "#runtime/processes/git-failure.ts";
import type { GitFailure } from "#runtime/processes/git-failure.ts";
import { decodeGitOutput, drainBounded } from "#runtime/processes/git-output.ts";
import type { BoundedDrain, DrainOutcome } from "#runtime/processes/git-output.ts";

/**
 * Poll until a process group is gone or the cleanup grace runs out.
 * @param pgid The group to watch.
 * @returns True when the group disappeared in time.
 */
async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + GIT_MS.groupCleanup;
	for (;;) {
		if (!processGroupExists(pgid)) {
			return true;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		// oxlint-disable-next-line no-await-in-loop -- polling one interval at a time
		await new Promise((resolve) => setTimeout(resolve, GIT_MS.groupPoll));
	}
}

type GitProcess = Subprocess<"ignore" | Blob, "pipe", "pipe">;

/**
 * Start Git as the leader of its own detached process group.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param options The executable to run, and the input it reads.
 * @returns The child.
 * @throws {GitCommandError} When Git could not start.
 */
function spawnGit(cwd: string, args: readonly string[], options: GitOptions): GitProcess {
	try {
		return Bun.spawn([options.executable ?? "git", ...args], {
			cwd,
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
			detached: true,
			stdin: options.input === undefined ? "ignore" : new Blob([Buffer.from(options.input)]),
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${errorMessage(error)}`);
	}
}

/**
 * Prove Git leads its own process group and put that group under the orphan
 * guard, killing Git when either fails so nothing is left running unsupervised.
 *
 * This runs in the tick of the spawn, so a Git that has exited can usually
 * still be read here. Bun on macOS can reap a Git that exits before Bun
 * watches it, and such a Git that left nothing in its group has no group.
 * @param child The spawned Git.
 * @returns The group and its leader's identity, or undefined when Git has
 * already finished and left nothing to own.
 */
function captureGitGroup(child: GitProcess): ProcessGroupIdentity | undefined {
	try {
		const group = captureDetachedProcessGroup(child.pid);
		if (group !== undefined) guardGitGroup(group.group);
		return group;
	} catch (cause) {
		child.kill("SIGKILL");
		throw new GitCommandError(
			"cleanup",
			`Could not capture Git process-group ownership: ${errorMessage(cause)}`,
		);
	}
}

interface Termination {
	readonly failure: GitFailure;
	readonly cause?: Error;
}

/** One Git command in flight: the first failure that ends it, and the group kill that follows. */
class GitRun {
	termination: Termination | undefined;
	groupSignalError: Error | undefined;
	groupTermination: Promise<void> = Promise.resolve();
	readonly terminationSignal: Promise<void>;
	private terminationStarted!: () => void;

	/**
	 * Track one command against its detached group.
	 * @param group Git's process group, or undefined when Git has already finished.
	 * @param child Git.
	 */
	constructor(
		private readonly group: ProcessGroupIdentity | undefined,
		private readonly child: GitProcess,
	) {
		this.terminationSignal = new Promise<void>((resolve) => {
			this.terminationStarted = resolve;
		});
	}

	/**
	 * Record the first failure and kill the whole group. Later calls are ignored,
	 * so the reason reported is the one that actually ended the command.
	 * @param failure Which stage failed.
	 * @param cause What went wrong, when there is something to say.
	 */
	terminate(failure: GitFailure, cause?: unknown): void {
		if (this.termination) {
			return;
		}
		this.termination = {
			failure,
			...(cause === undefined ? {} : { cause: asError(cause) }),
		};
		this.terminationStarted();
		if (this.group === undefined) return;
		this.groupTermination = stopAndKillOwnedGroup(this.group, this.child).catch(
			(error: unknown) => {
				this.groupSignalError = asError(error);
			},
		);
	}
}

type Settled = [number, DrainOutcome, DrainOutcome];

interface RunHandles {
	readonly exited: Promise<number>;
	readonly stdout: BoundedDrain;
	readonly stderr: BoundedDrain;
}

/**
 * Wait for Git, its group inspection and both output drains, giving a
 * terminated command only the cleanup grace to finish.
 * @param run The command's termination state.
 * @param handles The three things to wait for.
 * @returns Every outcome, in order.
 */
async function settleRun(run: GitRun, handles: RunHandles): Promise<Settled> {
	let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	try {
		const complete = Promise.all([handles.exited, handles.stdout.result, handles.stderr.result]);
		const cleanupExpired = run.terminationSignal.then(
			() =>
				new Promise<null>((resolve) => {
					cleanupTimer = setTimeout(() => resolve(null), GIT_MS.groupCleanup);
				}),
		);
		const raced = await Promise.race([complete, cleanupExpired]);
		if (raced !== null) {
			return raced;
		}
		const cancellation = new Error("Git process-group cleanup exceeded its grace.");
		run.termination ??= { failure: "cleanup", cause: cancellation };
		await Promise.all([handles.stdout.cancel(cancellation), handles.stderr.cancel(cancellation)]);
		return await complete;
	} finally {
		if (cleanupTimer !== undefined) {
			clearTimeout(cleanupTimer);
		}
	}
}

/**
 * Once Git has exited, end the command as unclean when anything is left in
 * its group.
 * @param run The command's termination state.
 * @param group Git's group, or undefined when Git finished before it was captured.
 */
function inspectExitedGroup(run: GitRun, group: ProcessGroupIdentity | undefined): void {
	if (run.termination || group === undefined) {
		return;
	}
	try {
		if (processGroupExists(group.group)) {
			run.terminate(
				"cleanup",
				new Error("Git exited while another process remained in its detached group."),
			);
		}
	} catch (cause) {
		run.terminate("cleanup", cause);
	}
}

/**
 * The error for a command whose detached group could not be accounted for.
 * @param run The command's termination state.
 * @param termination Why it was terminated.
 * @param exitCode Git's exit status, when known.
 * @returns The error to throw.
 */
function cleanupError(
	run: GitRun,
	termination: Termination,
	exitCode: number | undefined,
): GitCommandError {
	const detail = run.groupSignalError?.message ?? "the detached process group remained live";
	return new GitCommandError(
		"cleanup",
		`Git command cleanup failed after ${termination.failure}: ${detail}.`,
		exitCode,
	);
}

/**
 * Why the command was terminated, in whatever words exist for it.
 * @param termination Why it was terminated.
 * @returns The message.
 */
function terminationMessage(termination: Termination): string {
	return termination.cause?.message ?? `Git command ${termination.failure}.`;
}

/**
 * The error a terminated command ends in, once its group has been given the
 * cleanup grace to disappear.
 *
 * A group that outlived the grace outranks whatever the command was terminated
 * for: a process nobody can account for is the more serious fact.
 * @param run The command's termination state, which must be terminated.
 * @param termination Why it was terminated.
 * @param group Git's group, or undefined when Git finished before it was captured.
 * @param exitCode Git's exit status, when known.
 * @returns The error to throw.
 */
async function terminationError(
	run: GitRun,
	termination: Termination,
	group: ProcessGroupIdentity | undefined,
	exitCode: number | undefined,
): Promise<GitCommandError> {
	await run.groupTermination;
	const gone = group === undefined || (await processGroupDisappeared(group.group));
	if (run.groupSignalError || !gone) {
		return cleanupError(run, termination, exitCode);
	}
	if (termination.failure === "output") {
		return new GitCommandError("output", "Git command output exceeded 64 KiB.", exitCode);
	}
	return new GitCommandError(termination.failure, terminationMessage(termination), exitCode);
}

/**
 * Notice output that could not be read at all, which is a failure of this
 * process rather than of Git.
 * @param run The command's termination state.
 * @param out The stdout drain.
 * @param err The stderr drain.
 */
function noticeDrainFailure(run: GitRun, out: DrainOutcome, err: DrainOutcome): void {
	if (out.error || err.error) {
		run.terminate("cleanup", out.error ?? err.error);
	}
}

/**
 * Refuse a Git command that ended in anything but success.
 *
 * Git's own stderr is the message where it wrote one: it says what went wrong
 * in Git's words, which are better than any this could invent.
 * @param child Git, which has exited.
 * @param exitCode Its exit status.
 * @param err The kept stderr.
 * @throws {GitCommandError} When a signal ended Git, or its status is failing.
 */
function refuseExit(child: GitProcess, exitCode: number, err: DrainOutcome): void {
	if (child.signalCode !== null) {
		throw new GitCommandError("signal", `Git exited from ${child.signalCode}.`, exitCode);
	}
	if (exitCode !== 0) {
		const detail = new TextDecoder().decode(err.bytes).trim();
		throw new GitCommandError("exit", detail || `Git exited with status ${exitCode}.`, exitCode);
	}
}

interface GitOptions {
	input?: Uint8Array;
	trimOutput?: boolean;
	maxOutputBytes?: number;
	signal?: AbortSignal;
	timeoutMs?: number | null;
	executable?: string;
}

/** One Git command that has started, and everything it will settle on. */
interface RunningCommand {
	child: GitProcess;
	/** Git's group, or undefined when Git finished before it was captured. */
	group: ProcessGroupIdentity | undefined;
	run: GitRun;
	handles: RunHandles;
}

/**
 * Start Git, take its process group, and wire up every handle the command will
 * be settled on.
 *
 * All of it happens in the tick of the spawn, so nothing Git does can be
 * reported before somebody is watching for it.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param options Which executable to run.
 * @returns The running command.
 */
function startCommand(cwd: string, args: readonly string[], options: GitOptions): RunningCommand {
	const child = spawnGit(cwd, args, options);
	const group = captureGitGroup(child);
	const run = new GitRun(group, child);
	const stdout = drainBounded(
		child.stdout,
		() => run.terminate("output"),
		(error) => run.terminate("cleanup", error),
		options.maxOutputBytes,
	);
	const stderr = drainBounded(
		child.stderr,
		() => run.terminate("output"),
		(error) => run.terminate("cleanup", error),
	);
	const exited = child.exited.then((exitCode) => {
		inspectExitedGroup(run, group);
		return exitCode;
	});
	return { child, group, run, handles: { exited, stdout, stderr } };
}

/**
 * Wait for the command to settle, under a timeout and the caller's own
 * cancellation, taking both back down whichever way it ends.
 * @param command The running command.
 * @param options The timeout, and the caller's signal.
 * @returns Every outcome.
 */
async function settleWithLimits(command: RunningCommand, options: GitOptions): Promise<Settled> {
	const { run } = command;
	const timeout =
		options.timeoutMs === null
			? undefined
			: setTimeout(() => run.terminate("timeout"), options.timeoutMs ?? GIT_MS.command);
	/** End the command because the caller gave up on it. */
	const abort = (): void => {
		run.terminate("aborted");
	};
	options.signal?.addEventListener("abort", abort, { once: true });
	try {
		return await settleRun(run, command.handles);
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
	}
}

/**
 * Wait for a started command and turn how it ended into its output or its error.
 * @param command The running command.
 * @param options The limits, and the shape of the output.
 * @returns The requested output, or undefined when it was empty.
 * @throws {GitCommandError} When the command did not succeed.
 */
async function commandOutput(
	command: RunningCommand,
	options: GitOptions,
): Promise<string | undefined> {
	const [exitCode, out, err] = await settleWithLimits(command, options);
	noticeDrainFailure(command.run, out, err);
	if (command.run.termination) {
		throw await terminationError(command.run, command.run.termination, command.group, exitCode);
	}
	refuseExit(command.child, exitCode, err);
	const output = decodeGitOutput(out.bytes, exitCode);
	return (options.trimOutput === false ? output : output.trim()) || undefined;
}

/**
 * Run one bounded Git command without ever blocking Bun's process supervisor.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param options Cancellation, a timeout, and which executable to run.
 * @returns Trimmed stdout, or undefined when Git printed nothing.
 * @throws {GitCommandError} When Git could not run, did not succeed, or had to
 * be terminated.
 */
async function git(
	cwd: string,
	args: readonly string[],
	options: GitOptions = {},
): Promise<string | undefined> {
	if (options.signal?.aborted) {
		throw new GitCommandError("aborted", "Git command was cancelled.");
	}
	const command = startCommand(cwd, args, options);
	try {
		return await commandOutput(command, options);
	} finally {
		if (command.group !== undefined) releaseGitGroup(command.group.group);
	}
}

export { git };
