import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

import {
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
} from "../../shared/timing/timing.js";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	processGroupHasOtherMember,
	signalOwnedProcessGroup,
	type ProcessGroupIdentity,
} from "./process-group.js";

// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024;
const GIT_PROCESS_OWNER = fileURLToPath(new URL("./git-process-owner.ts", import.meta.url));

export type GitFailure = "aborted" | "cleanup" | "exit" | "output" | "signal" | "spawn" | "timeout";

export class GitCommandError extends Error {
	constructor(
		readonly failure: GitFailure,
		message: string,
		readonly exitCode?: number,
	) {
		super(message);
		this.name = "GitCommandError";
	}
}

interface BoundedDrain {
	readonly result: Promise<{ bytes: Uint8Array; exceeded: boolean; error?: Error }>;
	cancel(reason: Error): Promise<void>;
}

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
	let finish!: (value: { bytes: Uint8Array; exceeded: boolean; error?: Error }) => void;
	const result = new Promise<{ bytes: Uint8Array; exceeded: boolean; error?: Error }>((resolve) => {
		finish = resolve;
	});
	const outcome = (error?: Error): { bytes: Uint8Array; exceeded: boolean; error?: Error } => {
		const bytes = new Uint8Array(kept);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return { bytes, exceeded, ...(error ? { error } : {}) };
	};
	const settle = (value: { bytes: Uint8Array; exceeded: boolean; error?: Error }): void => {
		if (finished) return;
		finished = true;
		finish(value);
		chunks = [];
	};
	void (async (): Promise<{
		bytes: Uint8Array;
		exceeded: boolean;
		error?: Error;
	}> => {
		let error: Error | undefined;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				seen += value.byteLength;
				if (kept < GIT_OUTPUT_LIMIT_BYTES) {
					const remaining = GIT_OUTPUT_LIMIT_BYTES - kept;
					const chunk = value.byteLength <= remaining ? value : value.slice(0, remaining);
					chunks.push(chunk);
					kept += chunk.byteLength;
				}
				if (!exceeded && seen > GIT_OUTPUT_LIMIT_BYTES) {
					exceeded = true;
					onExcess();
				}
			}
		} catch (cause) {
			error = cause instanceof Error ? cause : new Error(String(cause));
			onFailure(error);
		} finally {
			reader.releaseLock();
		}
		return outcome(error);
	})().then(settle);
	return {
		result,
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

async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	for (;;) {
		if (!processGroupExists(pgid)) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, GIT_PROCESS_GROUP_POLL_MS));
	}
}

interface GitOwnerResult {
	readonly kind: "result";
	readonly exitCode?: number;
	readonly signalCode?: string | number;
	readonly spawnError?: string;
}

interface GitOwnerExit {
	readonly kind: "owner-exit";
	readonly exitCode: number;
}

function gitOwnerMessage(message: unknown): GitOwnerResult | undefined {
	if (typeof message !== "object" || message === null || !("kind" in message)) return undefined;
	if (message.kind !== "result") return undefined;
	const value = message as Partial<GitOwnerResult>;
	if (value.exitCode !== undefined && !Number.isInteger(value.exitCode)) return undefined;
	if (value.signalCode !== undefined && !["string", "number"].includes(typeof value.signalCode))
		return undefined;
	if (value.spawnError !== undefined && typeof value.spawnError !== "string") return undefined;
	return value as GitOwnerResult;
}

/** Run one bounded Git command without ever blocking Bun's process supervisor. */
export async function git(
	cwd: string,
	args: readonly string[],
	options: { signal?: AbortSignal; timeoutMs?: number; executable?: string } = {},
): Promise<string | undefined> {
	if (options.signal?.aborted) throw new GitCommandError("aborted", "Git command was cancelled.");
	let finishOwner!: (outcome: GitOwnerResult | GitOwnerExit) => void;
	let ownerFinished = false;
	const ownerResult = new Promise<GitOwnerResult | GitOwnerExit>((resolve) => {
		finishOwner = (outcome) => {
			if (ownerFinished) return;
			ownerFinished = true;
			resolve(outcome);
		};
	});
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([process.execPath, GIT_PROCESS_OWNER, options.executable ?? "git", ...args], {
			cwd,
			detached: true,
			ipc: (message) => {
				const parsed = gitOwnerMessage(message);
				if (parsed) finishOwner(parsed);
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${(error as Error).message}`);
	}
	let groupIdentity: ProcessGroupIdentity;
	try {
		groupIdentity = captureDetachedProcessGroup(child.pid);
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
			`Could not capture Git process-group ownership: ${(cause as Error).message}`,
		);
	}
	let termination: { failure: GitFailure; cause?: Error } | undefined;
	let groupSignalError: Error | undefined;
	let terminationStarted!: () => void;
	const terminationSignal = new Promise<void>((resolve) => {
		terminationStarted = resolve;
	});
	const terminate = (failure: GitFailure, cause?: unknown): void => {
		if (termination) return;
		termination = {
			failure,
			...(cause === undefined
				? {}
				: { cause: cause instanceof Error ? cause : new Error(String(cause)) }),
		};
		terminationStarted();
		try {
			signalOwnedProcessGroup(groupIdentity, "SIGKILL");
		} catch (error) {
			groupSignalError = error instanceof Error ? error : new Error(String(error));
		}
	};
	const stdout = drainBounded(
		child.stdout as ReadableStream<Uint8Array>,
		() => terminate("output"),
		(error) => terminate("cleanup", error),
	);
	const stderr = drainBounded(
		child.stderr as ReadableStream<Uint8Array>,
		() => terminate("output"),
		(error) => terminate("cleanup", error),
	);
	const leaderExited = child.exited.then((exitCode) => {
		finishOwner({ kind: "owner-exit", exitCode });
		return exitCode;
	});
	const inspectedOwnerResult = ownerResult.then((outcome) => {
		if (outcome.kind === "owner-exit") {
			if (!termination)
				terminate("cleanup", new Error("Git process owner exited before reporting a result."));
			return outcome;
		}
		if (termination) return outcome;
		try {
			if (processGroupHasOtherMember(groupIdentity)) {
				terminate(
					"cleanup",
					new Error("Git exited while another process remained in its detached group."),
				);
			} else {
				child.send({ kind: "release" });
			}
		} catch (cause) {
			terminate("cleanup", cause);
		}
		return outcome;
	});
	child.send({ kind: "start" });
	const timeout = setTimeout(
		() => terminate("timeout"),
		options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
	);
	const abort = (): void => terminate("aborted");
	options.signal?.addEventListener("abort", abort, { once: true });
	let settled:
		| [
				number,
				GitOwnerResult | GitOwnerExit,
				Awaited<typeof stdout.result>,
				Awaited<typeof stderr.result>,
		  ]
		| undefined;
	let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	try {
		const complete = Promise.all([
			leaderExited,
			inspectedOwnerResult,
			stdout.result,
			stderr.result,
		]);
		const cleanupExpired = terminationSignal.then(
			() =>
				new Promise<null>((resolve) => {
					cleanupTimer = setTimeout(() => resolve(null), GIT_PROCESS_GROUP_CLEANUP_MS);
				}),
		);
		const raced = await Promise.race([complete, cleanupExpired]);
		if (raced === null) {
			const cancellation = new Error("Git process-group cleanup exceeded its grace.");
			termination ??= { failure: "cleanup", cause: cancellation };
			await Promise.all([stdout.cancel(cancellation), stderr.cancel(cancellation)]);
			settled = await complete;
		} else {
			settled = raced;
		}
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
		if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
	}
	const ownerExitCode = settled?.[0];
	const commandResult = settled?.[1];
	const out = settled?.[2];
	const err = settled?.[3];
	const exitCode = commandResult?.kind === "result" ? commandResult.exitCode : undefined;
	if (out?.error || err?.error) terminate("cleanup", out?.error ?? err?.error);
	if (!termination && (ownerExitCode !== 0 || child.signalCode !== null)) {
		terminate("cleanup", new Error("Git process owner did not exit normally."));
	}
	if (!termination && processGroupExists(groupIdentity.group)) {
		terminate("cleanup", new Error("Git exited while its detached process group remained live."));
	}
	if (termination) {
		const gone = await processGroupDisappeared(groupIdentity.group);
		if (groupSignalError || !gone) {
			const detail = groupSignalError?.message ?? "the detached process group remained live";
			throw new GitCommandError(
				"cleanup",
				`Git command cleanup failed after ${termination.failure}: ${detail}.`,
				exitCode,
			);
		}
		if (termination.failure === "output")
			throw new GitCommandError("output", "Git command output exceeded 64 KiB.", exitCode);
		throw new GitCommandError(
			termination.failure,
			termination.cause?.message ?? `Git command ${termination.failure}.`,
			exitCode,
		);
	}
	if (!settled) throw new GitCommandError("cleanup", "Git command did not settle.");
	if (commandResult?.kind !== "result")
		throw new GitCommandError("cleanup", "Git process owner exited without a command result.");
	if (commandResult.spawnError)
		throw new GitCommandError("spawn", `Could not start Git: ${commandResult.spawnError}`);
	if (commandResult.signalCode !== undefined)
		throw new GitCommandError(
			"signal",
			`Git exited from ${commandResult.signalCode}.`,
			commandResult.exitCode,
		);
	const settledExitCode = commandResult.exitCode;
	if (settledExitCode === undefined)
		throw new GitCommandError("cleanup", "Git process owner reported no exit status.");
	if (settledExitCode !== 0) {
		const detail = new TextDecoder().decode(err!.bytes).trim();
		throw new GitCommandError(
			"exit",
			detail || `Git exited with status ${settledExitCode}.`,
			settledExitCode,
		);
	}
	return new TextDecoder().decode(out!.bytes).trim() || undefined;
}

// Turn a git remote URL into a stable identity: host/owner/name, with the
// scheme, credentials, and .git suffix stripped so ssh and https clones of the
// same repo produce the same string.
export function repoIdentityFromRemote(remote: string): string {
	let url = remote.trim().replace(/\.git$/, "");
	url = url.replace(/^[a-z+]+:\/\//i, "");
	url = url.replace(/^[^@/]+@/, ""); // user@ / token@
	url = url.replace(":", "/"); // scp-style git@host:owner/name
	return url.replace(/\/+$/, "");
}

// Deepest existing directory at or above `p`. A binding may legitimately name
// a file that does not exist yet (a proposal), and we still want the repo.
export function existingDir(p: string): string | undefined {
	let dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
	for (let i = 0; i < 64; i++) {
		if (fs.existsSync(dir)) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return undefined;
}

/** The git root a path sits in, walking up from the deepest directory that exists. */
export async function repoRootOf(
	anyPath: string,
	options: { signal?: AbortSignal } = {},
): Promise<string | undefined> {
	const searchDir = existingDir(path.resolve(anyPath));
	if (!searchDir) return undefined;
	try {
		return await git(searchDir, ["rev-parse", "--show-toplevel"], options);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit") return undefined;
		throw error;
	}
}

/**
 * What a checkout calls itself.
 *
 * `origin` when there is one, because that is the name the same repository has
 * on every machine and in every clone. A repo with no remote falls back to the
 * directory name, which is machine-local and therefore weaker. A binding that
 * says which local repo it means still beats one that says nothing.
 */
export async function repoIdentityAt(
	root: string,
	options: { signal?: AbortSignal } = {},
): Promise<string> {
	let remote: string | undefined;
	try {
		remote = await git(root, ["remote", "get-url", "origin"], options);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit") remote = undefined;
		else throw error;
	}
	return remote ? repoIdentityFromRemote(remote) : path.basename(root);
}

export interface CheckoutGitInspection {
	readonly root: string;
	readonly identity: string;
	readonly branch?: string;
	readonly commit?: string;
}

async function optionalGit(
	root: string,
	args: string[],
	options: { signal?: AbortSignal },
): Promise<string | undefined> {
	try {
		return await git(root, args, options);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit") return undefined;
		throw error;
	}
}

/** Capture one immutable view of the Git facts a top-level operation consumes. */
export async function inspectCheckout(
	anyPath: string,
	options: { signal?: AbortSignal } = {},
): Promise<Readonly<CheckoutGitInspection> | undefined> {
	const root = await repoRootOf(anyPath, options);
	if (!root) return undefined;
	const settled = await Promise.allSettled([
		repoIdentityAt(root, options),
		optionalGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], options),
		optionalGit(root, ["rev-parse", "HEAD"], options),
	]);
	const failed = settled.find(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	if (failed) throw failed.reason;
	const [identity, branch, commit] = settled.map(
		(result) => (result as PromiseFulfilledResult<string | undefined>).value,
	);
	return Object.freeze({
		root,
		identity: identity as string,
		...(branch ? { branch } : {}),
		...(commit ? { commit } : {}),
	});
}
