import fs from "fs";
import path from "path";
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

// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024;
const GIT_PROCESS_OWNER = fileURLToPath(new URL("./git-process-owner.ts", import.meta.url));

type GitFailure = "aborted" | "cleanup" | "exit" | "output" | "signal" | "spawn" | "timeout";

class GitCommandError extends Error {
	/**
	 * A Git command that did not produce a usable result.
	 * @param failure Which stage failed.
	 * @param message What to tell the caller.
	 * @param exitCode Git's exit status, when it got as far as exiting.
	 */
	constructor(
		readonly failure: GitFailure,
		message: string,
		readonly exitCode?: number,
	) {
		super(message);
		this.name = "GitCommandError";
	}
}

interface DrainOutcome {
	bytes: Uint8Array;
	exceeded: boolean;
	error?: Error;
}

interface BoundedDrain {
	readonly result: Promise<DrainOutcome>;
	cancel(reason: Error): Promise<void>;
}

/**
 * Read a stream to its end, keeping at most the output limit and reporting
 * the moment it is exceeded.
 * @param stream The child's stdout or stderr.
 * @param onExcess Called once when the limit is passed.
 * @param onFailure Called when the read itself fails.
 * @returns The kept bytes as a promise, and a way to cut the read short.
 */
function drainBounded(
	stream: ReadableStream<Uint8Array>,
	onExcess: () => void,
	onFailure: (error: Error) => void,
): BoundedDrain {
	const reader = stream.getReader();
	let chunks: Uint8Array[] = [];
	let kept = 0;
	let seen = 0;
	let exceeded = false;
	let finished = false;
	let finish!: (value: DrainOutcome) => void;
	const result = new Promise<DrainOutcome>((resolve) => {
		finish = resolve;
	});
	/**
	 * Assemble what was kept so far.
	 * @param error The read failure, if any.
	 * @returns The kept bytes, whether the limit was passed, and the failure.
	 */
	const outcome = (error?: Error): DrainOutcome => {
		const bytes = new Uint8Array(kept);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return { bytes, exceeded, ...(error ? { error } : {}) };
	};
	/**
	 * Resolve the result once and drop the chunks.
	 * @param value The final outcome.
	 */
	const settle = (value: DrainOutcome): void => {
		if (finished) {
			return;
		}
		finished = true;
		finish(value);
		chunks = [];
	};
	/**
	 * Keep one chunk up to the limit and notice when the total passes it.
	 * @param value The chunk read.
	 */
	const take = (value: Uint8Array): void => {
		seen += value.byteLength;
		if (kept < GIT_OUTPUT_LIMIT_BYTES) {
			const room = GIT_OUTPUT_LIMIT_BYTES - kept;
			const chunk = value.byteLength <= room ? value : value.slice(0, room);
			chunks.push(chunk);
			kept += chunk.byteLength;
		}
		if (!exceeded && seen > GIT_OUTPUT_LIMIT_BYTES) {
			exceeded = true;
			onExcess();
		}
	};
	/**
	 * Read until the stream ends or fails.
	 * @returns The outcome to settle with.
	 */
	const drain = async (): Promise<DrainOutcome> => {
		let error: Error | undefined;
		try {
			for (;;) {
				// oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				take(value);
			}
		} catch (cause) {
			error = asError(cause);
			onFailure(error);
		} finally {
			reader.releaseLock();
		}
		return outcome(error);
	};
	void drain().then(settle);
	return {
		result,
		/**
		 * Settle with what was read so far and stop reading.
		 * @param reason Why the read is being abandoned.
		 */
		cancel: async (reason: Error): Promise<void> => {
			settle(outcome(reason));
			try {
				void reader.cancel(reason).catch(() => undefined);
			} catch {
				// The result was already terminalized; the stream may also have settled.
			}
		},
	};
}

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
 * The error a terminated command ends in, once its group has been given the
 * cleanup grace to disappear.
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
		const detail = run.groupSignalError?.message ?? "the detached process group remained live";
		return new GitCommandError(
			"cleanup",
			`Git command cleanup failed after ${termination.failure}: ${detail}.`,
			exitCode,
		);
	}
	if (termination.failure === "output") {
		return new GitCommandError("output", "Git command output exceeded 64 KiB.", exitCode);
	}
	return new GitCommandError(
		termination.failure,
		termination.cause?.message ?? `Git command ${termination.failure}.`,
		exitCode,
	);
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
	if (out.error || err.error) {
		run.terminate("cleanup", out.error ?? err.error);
	}
	if (!run.termination && (ownerExitCode !== 0 || child.signalCode !== null)) {
		run.terminate("cleanup", new Error("Git process owner did not exit normally."));
	}
	if (!run.termination && processGroupExists(group.group)) {
		run.terminate("cleanup", new Error("Git exited while its detached process group remained live."));
	}
}

/**
 * Git's output for a command that ended without termination, or the error its
 * own report amounts to.
 * @param commandResult What the owner reported.
 * @param out The kept stdout.
 * @param err The kept stderr.
 * @returns Trimmed stdout, or undefined when it was empty.
 */
function commandOutput(
	commandResult: OwnerOutcome,
	out: DrainOutcome,
	err: DrainOutcome,
): string | undefined {
	if (commandResult.kind !== "result") {
		throw new GitCommandError("cleanup", "Git process owner exited without a command result.");
	}
	if (commandResult.spawnError) {
		throw new GitCommandError("spawn", `Could not start Git: ${commandResult.spawnError}`);
	}
	if (commandResult.signalCode !== undefined) {
		throw new GitCommandError(
			"signal",
			`Git exited from ${commandResult.signalCode}.`,
			commandResult.exitCode,
		);
	}
	const settledExitCode = commandResult.exitCode;
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
	return new TextDecoder().decode(out.bytes).trim() || undefined;
}

interface GitOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	executable?: string;
}

/**
 * Run one bounded Git command without ever blocking Bun's process supervisor.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @param options Cancellation, a timeout, and which executable to run.
 * @returns Trimmed stdout, or undefined when Git printed nothing.
 */
async function git(
	cwd: string,
	args: readonly string[],
	options: GitOptions = {},
): Promise<string | undefined> {
	if (options.signal?.aborted) {
		throw new GitCommandError("aborted", "Git command was cancelled.");
	}
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
	const timeout = setTimeout(
		() => run.terminate("timeout"),
		options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
	);
	/** End the command because the caller gave up on it. */
	const abort = (): void => run.terminate("aborted");
	options.signal?.addEventListener("abort", abort, { once: true });
	let settled: Settled;
	try {
		settled = await settleRun(run, { leaderExited, inspectedOwnerResult, stdout, stderr });
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
	}
	const [, commandResult, out, err] = settled;
	noticeLateFailures(run, child, group, settled);
	if (run.termination) {
		const exitCode = commandResult.kind === "result" ? commandResult.exitCode : undefined;
		throw await terminationError(run, run.termination, group, exitCode);
	}
	return commandOutput(commandResult, out, err);
}

/**
 * Turn a git remote URL into a stable identity: host/owner/name, with the
 * scheme, credentials, and .git suffix stripped so ssh and https clones of the
 * same repo produce the same string.
 * @param remote The remote URL as Git prints it.
 * @returns The identity string.
 */
function repoIdentityFromRemote(remote: string): string {
	let url = remote.trim().replace(/\.git$/, "");
	url = url.replace(/^[a-z+]+:\/\//i, "");
	url = url.replace(/^[^@/]+@/, ""); // user@ / token@
	url = url.replace(":", "/"); // scp-style git@host:owner/name
	return url.replace(/\/+$/, "");
}

/**
 * Deepest existing directory at or above a path. A binding may legitimately
 * name a file that does not exist yet (a proposal), and we still want the repo.
 * @param p The path to start from.
 * @returns The nearest existing ancestor directory, or undefined when none is found.
 */
function existingDir(p: string): string | undefined {
	let dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
	for (let i = 0; i < 64; i++) {
		if (fs.existsSync(dir)) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
	return undefined;
}

/**
 * The git root a path sits in, walking up from the deepest directory that exists.
 * @param anyPath Any path, existing or not.
 * @param options Cancellation.
 * @returns The repository root, or undefined when the path is not in one.
 */
async function repoRootOf(
	anyPath: string,
	options: { signal?: AbortSignal } = {},
): Promise<string | undefined> {
	const searchDir = existingDir(path.resolve(anyPath));
	if (!searchDir) {
		return undefined;
	}
	return optionalGit(searchDir, ["rev-parse", "--show-toplevel"], options);
}

/**
 * What a checkout calls itself.
 *
 * `origin` when there is one, because that is the name the same repository has
 * on every machine and in every clone. A repo with no remote falls back to the
 * directory name, which is machine-local and therefore weaker. A binding that
 * says which local repo it means still beats one that says nothing.
 * @param root The repository root.
 * @param options Cancellation.
 * @returns The remote-derived identity, or the directory name.
 */
async function repoIdentityAt(
	root: string,
	options: { signal?: AbortSignal } = {},
): Promise<string> {
	const remote = await optionalGit(root, ["remote", "get-url", "origin"], options);
	return remote ? repoIdentityFromRemote(remote) : path.basename(root);
}

interface CheckoutGitInspection {
	readonly root: string;
	readonly identity: string;
	readonly branch?: string;
	readonly commit?: string;
}

/**
 * Run Git where a non-zero exit is an answer rather than a fault.
 * @param root Where Git runs.
 * @param args Git's arguments.
 * @param options Cancellation.
 * @returns Trimmed stdout, or undefined when Git exited non-zero or printed nothing.
 */
async function optionalGit(
	root: string,
	args: readonly string[],
	options: { signal?: AbortSignal },
): Promise<string | undefined> {
	try {
		return await git(root, args, options);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit") {
			return undefined;
		}
		throw error;
	}
}

/**
 * The value of a settled promise, rethrowing its rejection.
 * @param result One entry from `Promise.allSettled`.
 * @returns The fulfilled value.
 */
function fulfilled<T>(result: PromiseSettledResult<T>): T {
	if (result.status === "rejected") {
		throw result.reason;
	}
	return result.value;
}

/**
 * Capture one immutable view of the Git facts a top-level operation consumes.
 * @param anyPath Any path inside the checkout.
 * @param options Cancellation.
 * @returns The root, identity, branch and commit, or undefined outside a repository.
 */
async function inspectCheckout(
	anyPath: string,
	options: { signal?: AbortSignal } = {},
): Promise<Readonly<CheckoutGitInspection> | undefined> {
	const root = await repoRootOf(anyPath, options);
	if (!root) {
		return undefined;
	}
	// Every command is allowed to finish before the first failure is thrown, so
	// no Git process is left running under a rejected inspection.
	const [identityResult, branchResult, commitResult] = await Promise.allSettled([
		repoIdentityAt(root, options),
		optionalGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], options),
		optionalGit(root, ["rev-parse", "HEAD"], options),
	]);
	const identity = fulfilled(identityResult);
	const branch = fulfilled(branchResult);
	const commit = fulfilled(commitResult);
	return Object.freeze({
		root,
		identity,
		...(branch ? { branch } : {}),
		...(commit ? { commit } : {}),
	});
}

export {
	type GitFailure,
	GitCommandError,
	git,
	repoIdentityFromRemote,
	existingDir,
	repoRootOf,
	repoIdentityAt,
	type CheckoutGitInspection,
	inspectCheckout,
};
