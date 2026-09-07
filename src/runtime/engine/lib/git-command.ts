// Running one Git command without ever blocking Bun's process supervisor.
//
// A Git command is spawned into a detached process group owned by a small
// child process (git-process-owner.ts), so that a hung or runaway Git can be
// killed as a group without taking anything else with it. Everything here is
// about that discipline: bounded output, a timeout, cancellation, and noticing
// the failures that only show once every handle has settled.

import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";
import { z } from "zod";

import {
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
} from "@/shared/timing/timing";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	processGroupHasOtherMember,
	signalOwnedProcessGroup,
	type ProcessGroupIdentity,
} from "@/runtime/engine/process-group";
import { asError, errorMessage } from "@/runtime/engine/lib/thrown-error";
import { GitCommandError } from "@/runtime/engine/lib/git-failure";
import type { GitFailure } from "@/runtime/engine/lib/git-failure";
import { drainBounded } from "@/runtime/engine/lib/git-output";
import type { BoundedDrain, DrainOutcome } from "@/runtime/engine/lib/git-output";

// The owner lives beside the module that used to run Git, one directory up
// from here.
const GIT_PROCESS_OWNER = fileURLToPath(new URL("../git-process-owner.ts", import.meta.url));

/**
 * Poll until a process group is gone or the cleanup grace runs out.
 * @param pgid The group to watch.
 * @returns True when the group disappeared in time.
 */
async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	for (;;) {
		if (!processGroupExists(pgid)) {
			return true;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		// oxlint-disable-next-line no-await-in-loop -- polling one interval at a time
		await new Promise((resolve) => setTimeout(resolve, GIT_PROCESS_GROUP_POLL_MS));
	}
}

const gitOwnerResult = z.object({
	kind: z.literal("result"),
	exitCode: z.number().int().optional(),
	signalCode: z.union([z.string(), z.number()]).optional(),
	spawnError: z.string().optional(),
});

type GitOwnerResult = z.infer<typeof gitOwnerResult>;

interface GitOwnerExit {
	readonly kind: "owner-exit";
	readonly exitCode: number;
}

type OwnerOutcome = GitOwnerResult | GitOwnerExit;

/**
 * The owner's result message, when an IPC message is one.
 * @param message Whatever arrived over IPC.
 * @returns The parsed result, or undefined for anything else.
 */
function gitOwnerMessage(message: unknown): GitOwnerResult | undefined {
	const parsed = gitOwnerResult.safeParse(message);
	return parsed.success ? parsed.data : undefined;
}

type OwnerProcess = Subprocess<"ignore", "pipe", "pipe">;

interface SpawnedOwner {
	readonly child: OwnerProcess;
	readonly ownerResult: Promise<OwnerOutcome>;
	readonly finishOwner: (outcome: OwnerOutcome) => void;
}

/**
 * Start the process owner that will run Git in a detached group of its own.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param executable The Git executable to run.
 * @returns The child and the promise of what the owner reports.
 */
function spawnGitOwner(cwd: string, args: readonly string[], executable: string): SpawnedOwner {
	let finishOwner!: (outcome: OwnerOutcome) => void;
	let ownerFinished = false;
	const ownerResult = new Promise<OwnerOutcome>((resolve) => {
		/**
		 * Resolve the owner's outcome once, whichever report arrives first.
		 * @param outcome The IPC result or the owner's own exit.
		 */
		finishOwner = (outcome) => {
			if (ownerFinished) {
				return;
			}
			ownerFinished = true;
			resolve(outcome);
		};
	});
	try {
		const child = Bun.spawn([process.execPath, GIT_PROCESS_OWNER, executable, ...args], {
			cwd,
			detached: true,
			/**
			 * Take the owner's result off the IPC channel.
			 * @param message Whatever the owner sent.
			 */
			ipc: (message) => {
				const parsed = gitOwnerMessage(message);
				if (parsed) {
					finishOwner(parsed);
				}
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		return { child, ownerResult, finishOwner };
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${errorMessage(error)}`);
	}
}

/**
 * Prove the owner leads its own process group, killing and draining it when
 * that cannot be proven so nothing is left running unsupervised.
 * @param child The spawned owner.
 * @returns The group and its leader's identity.
 */
async function captureOwnerGroup(child: OwnerProcess): Promise<ProcessGroupIdentity> {
	try {
		return captureDetachedProcessGroup(child.pid);
	} catch (cause) {
		try {
			child.kill("SIGKILL");
		} catch {
			// The owner may have failed before it received the start message.
		}
		await Promise.all([
			child.exited,
			new Response(child.stdout).arrayBuffer(),
			new Response(child.stderr).arrayBuffer(),
		]);
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
	readonly terminationSignal: Promise<void>;
	private terminationStarted!: () => void;

	/**
	 * Track one command against its detached group.
	 * @param group The owner's process group.
	 */
	constructor(private readonly group: ProcessGroupIdentity) {
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
		try {
			signalOwnedProcessGroup(this.group, "SIGKILL");
		} catch (error) {
			this.groupSignalError = asError(error);
		}
	}
}

type Settled = [number, OwnerOutcome, DrainOutcome, DrainOutcome];

interface RunHandles {
	readonly leaderExited: Promise<number>;
	readonly inspectedOwnerResult: Promise<OwnerOutcome>;
	readonly stdout: BoundedDrain;
	readonly stderr: BoundedDrain;
}

/**
 * Wait for the owner, its group inspection and both output drains, giving a
 * terminated command only the cleanup grace to finish.
 * @param run The command's termination state.
 * @param handles The four things to wait for.
 * @returns Every outcome, in order.
 */
async function settleRun(run: GitRun, handles: RunHandles): Promise<Settled> {
	let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	try {
		const complete = Promise.all([
			handles.leaderExited,
			handles.inspectedOwnerResult,
			handles.stdout.result,
			handles.stderr.result,
		]);
		const cleanupExpired = run.terminationSignal.then(
			() =>
				new Promise<null>((resolve) => {
					cleanupTimer = setTimeout(() => resolve(null), GIT_PROCESS_GROUP_CLEANUP_MS);
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
 * Once the owner reports, either release it or, when something else is still
 * in its group, end the command as unclean.
 * @param run The command's termination state.
 * @param child The owner.
 * @param group The owner's group.
 * @param outcome What the owner reported, or its unexpected exit.
 * @returns The same outcome, for the settlement.
 */
function inspectOwnerOutcome(
	run: GitRun,
	child: OwnerProcess,
	group: ProcessGroupIdentity,
	outcome: OwnerOutcome,
): OwnerOutcome {
	if (outcome.kind === "owner-exit") {
		if (!run.termination) {
			run.terminate("cleanup", new Error("Git process owner exited before reporting a result."));
		}
		return outcome;
	}
	if (run.termination) {
		return outcome;
	}
	try {
		if (processGroupHasOtherMember(group)) {
			run.terminate(
				"cleanup",
				new Error("Git exited while another process remained in its detached group."),
			);
		} else {
			child.send({ kind: "release" });
		}
	} catch (cause) {
		run.terminate("cleanup", cause);
	}
	return outcome;
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
 * @param group The owner's group.
 * @param exitCode Git's exit status, when known.
 * @returns The error to throw.
 */
async function terminationError(
	run: GitRun,
	termination: Termination,
	group: ProcessGroupIdentity,
	exitCode: number | undefined,
): Promise<GitCommandError> {
	const gone = await processGroupDisappeared(group.group);
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
 * Whether the owner itself ended badly, which means nothing it reported can be
 * trusted.
 * @param child The owner.
 * @param ownerExitCode Its exit status.
 * @returns True when it did not exit cleanly.
 */
function ownerExitedBadly(child: OwnerProcess, ownerExitCode: number): boolean {
	return ownerExitCode !== 0 || child.signalCode !== null;
}

/**
 * Notice an owner that did not exit cleanly, or a group that outlived it.
 * @param run The command's termination state.
 * @param child The owner.
 * @param group The owner's group.
 * @param ownerExitCode The owner's exit status.
 */
function noticeOwnerFailure(
	run: GitRun,
	child: OwnerProcess,
	group: ProcessGroupIdentity,
	ownerExitCode: number,
): void {
	if (!run.termination && ownerExitedBadly(child, ownerExitCode)) {
		run.terminate("cleanup", new Error("Git process owner did not exit normally."));
	}
	if (!run.termination && processGroupExists(group.group)) {
		run.terminate(
			"cleanup",
			new Error("Git exited while its detached process group remained live."),
		);
	}
}

/**
 * Notice, after settlement, the failures that only show once everything has
 * finished: a failed drain, an owner that did not exit cleanly, a group that
 * outlived its leader.
 * @param run The command's termination state.
 * @param child The owner.
 * @param group The owner's group.
 * @param settled Every outcome.
 */
function noticeLateFailures(
	run: GitRun,
	child: OwnerProcess,
	group: ProcessGroupIdentity,
	settled: Settled,
): void {
	const [ownerExitCode, , out, err] = settled;
	noticeDrainFailure(run, out, err);
	noticeOwnerFailure(run, child, group, ownerExitCode);
}

/**
 * Refuse a command the owner could not even start, or that a signal ended.
 * @param result What the owner reported.
 * @throws {GitCommandError} When Git never ran, or was signalled.
 */
function refuseOwnerReport(result: GitOwnerResult): void {
	if (result.spawnError) {
		throw new GitCommandError("spawn", `Could not start Git: ${result.spawnError}`);
	}
	if (result.signalCode !== undefined) {
		throw new GitCommandError("signal", `Git exited from ${result.signalCode}.`, result.exitCode);
	}
}

/**
 * Refuse a Git command that ended in anything but success.
 *
 * Git's own stderr is the message where it wrote one: it says what went wrong
 * in Git's words, which are better than any this could invent.
 * @param result What the owner reported.
 * @param err The kept stderr.
 * @throws {GitCommandError} When Git reported no status, or a failing one.
 */
function refuseExitStatus(result: GitOwnerResult, err: DrainOutcome): void {
	const settledExitCode = result.exitCode;
	if (settledExitCode === undefined) {
		throw new GitCommandError("cleanup", "Git process owner reported no exit status.");
	}
	if (settledExitCode !== 0) {
		const detail = new TextDecoder().decode(err.bytes).trim();
		throw new GitCommandError(
			"exit",
			detail || `Git exited with status ${settledExitCode}.`,
			settledExitCode,
		);
	}
}

/**
 * Git's output for a command that ended without termination, or the error its
 * own report amounts to.
 * @param commandResult What the owner reported.
 * @param out The kept stdout.
 * @param err The kept stderr.
 * @returns Trimmed stdout, or undefined when it was empty.
 * @throws {GitCommandError} When the command did not succeed.
 */
function commandOutput(
	commandResult: OwnerOutcome,
	out: DrainOutcome,
	err: DrainOutcome,
): string | undefined {
	if (commandResult.kind !== "result") {
		throw new GitCommandError("cleanup", "Git process owner exited without a command result.");
	}
	refuseOwnerReport(commandResult);
	refuseExitStatus(commandResult, err);
	return new TextDecoder().decode(out.bytes).trim() || undefined;
}

interface GitOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	executable?: string;
}

/** One Git command that has started, and everything it will settle on. */
interface RunningCommand {
	child: OwnerProcess;
	group: ProcessGroupIdentity;
	run: GitRun;
	handles: RunHandles;
}

/**
 * Start the owner, take its process group, and wire up every handle the
 * command will be settled on.
 *
 * Git is told to start only once all of that is in place, so nothing it does
 * can happen before somebody is watching for it.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param options Which executable to run.
 * @returns The running command.
 */
async function startCommand(
	cwd: string,
	args: readonly string[],
	options: GitOptions,
): Promise<RunningCommand> {
	const { child, ownerResult, finishOwner } = spawnGitOwner(cwd, args, options.executable ?? "git");
	const group = await captureOwnerGroup(child);
	const run = new GitRun(group);
	const stdout = drainBounded(
		child.stdout,
		() => run.terminate("output"),
		(error) => run.terminate("cleanup", error),
	);
	const stderr = drainBounded(
		child.stderr,
		() => run.terminate("output"),
		(error) => run.terminate("cleanup", error),
	);
	const leaderExited = child.exited.then((exitCode) => {
		finishOwner({ kind: "owner-exit", exitCode });
		return exitCode;
	});
	const inspectedOwnerResult = ownerResult.then((outcome) =>
		inspectOwnerOutcome(run, child, group, outcome),
	);
	child.send({ kind: "start" });
	return { child, group, run, handles: { leaderExited, inspectedOwnerResult, stdout, stderr } };
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
	const timeout = setTimeout(
		() => run.terminate("timeout"),
		options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
	);
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
	const command = await startCommand(cwd, args, options);
	const settled = await settleWithLimits(command, options);
	const [, commandResult, out, err] = settled;
	noticeLateFailures(command.run, command.child, command.group, settled);
	if (command.run.termination) {
		const exitCode = commandResult.kind === "result" ? commandResult.exitCode : undefined;
		throw await terminationError(command.run, command.run.termination, command.group, exitCode);
	}
	return commandOutput(commandResult, out, err);
}

export { type GitOptions, git };
