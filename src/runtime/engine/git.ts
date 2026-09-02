import fs from "fs";
import path from "path";

import {
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
} from "../../shared/timing/timing.js";

// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024;

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
	const result = (async (): Promise<{
		bytes: Uint8Array;
		exceeded: boolean;
		error?: Error;
	}> => {
		const chunks: Uint8Array[] = [];
		let kept = 0;
		let seen = 0;
		let exceeded = false;
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
		const bytes = new Uint8Array(kept);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return { bytes, exceeded, ...(error ? { error } : {}) };
	})();
	return {
		result,
		cancel: async (reason: Error): Promise<void> => {
			try {
				await reader.cancel(reason);
			} catch {
				// The reader may already have settled; `result` remains the authority.
			}
		},
	};
}

function processGroupExists(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw cause;
	}
}

function signalProcessGroup(pgid: number): void {
	try {
		process.kill(-pgid, "SIGKILL");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
	}
}

async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	for (;;) {
		if (!processGroupExists(pgid)) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, GIT_PROCESS_GROUP_POLL_MS));
	}
}

/** Run one bounded Git command without ever blocking Bun's process supervisor. */
export async function git(
	cwd: string,
	args: readonly string[],
	options: { signal?: AbortSignal; timeoutMs?: number; executable?: string } = {},
): Promise<string | undefined> {
	if (options.signal?.aborted) throw new GitCommandError("aborted", "Git command was cancelled.");
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([options.executable ?? "git", ...args], {
			cwd,
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${(error as Error).message}`);
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
			signalProcessGroup(child.pid);
		} catch (error) {
			groupSignalError = error instanceof Error ? error : new Error(String(error));
			// Reap the leader as well as diagnosing the failed group signal. This is
			// never accepted as proof that descendants are gone.
			try {
				child.kill("SIGKILL");
			} catch {
				// Group cleanup below remains the terminal proof.
			}
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
		try {
			if (processGroupExists(child.pid)) {
				terminate(
					"cleanup",
					new Error("Git exited while its detached process group remained live."),
				);
			}
		} catch (error) {
			terminate("cleanup", error);
		}
		return exitCode;
	});
	const timeout = setTimeout(
		() => terminate("timeout"),
		options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
	);
	const abort = (): void => terminate("aborted");
	options.signal?.addEventListener("abort", abort, { once: true });
	let exitCode: number;
	let out: Awaited<typeof stdout.result>;
	let err: Awaited<typeof stderr.result>;
	let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	try {
		const complete = Promise.all([leaderExited, stdout.result, stderr.result]);
		const cleanupExpired = terminationSignal.then(
			() =>
				new Promise<null>((resolve) => {
					cleanupTimer = setTimeout(() => resolve(null), GIT_PROCESS_GROUP_CLEANUP_MS);
				}),
		);
		let settled = await Promise.race([complete, cleanupExpired]);
		if (settled === null) {
			try {
				signalProcessGroup(child.pid);
			} catch (error) {
				groupSignalError ??= error instanceof Error ? error : new Error(String(error));
			}
			try {
				child.kill("SIGKILL");
			} catch {
				// The leader may already have been reaped.
			}
			const cancellation = new Error("Git process-group cleanup exceeded its grace.");
			await Promise.all([stdout.cancel(cancellation), stderr.cancel(cancellation)]);
			settled = await complete;
			termination ??= { failure: "cleanup", cause: cancellation };
		}
		[exitCode, out, err] = settled;
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
	}
	if (out.error || err.error) terminate("cleanup", out.error ?? err.error);
	if (!termination && processGroupExists(child.pid)) {
		terminate("cleanup", new Error("Git exited while its detached process group remained live."));
	}
	if (termination) {
		const gone = await processGroupDisappeared(child.pid);
		if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
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
	if (child.signalCode !== null)
		throw new GitCommandError("signal", `Git exited from ${child.signalCode}.`, exitCode);
	if (exitCode !== 0) {
		const detail = new TextDecoder().decode(err.bytes).trim();
		throw new GitCommandError("exit", detail || `Git exited with status ${exitCode}.`, exitCode);
	}
	return new TextDecoder().decode(out.bytes).trim() || undefined;
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
