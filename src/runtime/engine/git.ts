import fs from "fs";
import path from "path";

// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

const GIT_TIMEOUT_MS = 5_000;
const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024;

export type GitFailure = "aborted" | "exit" | "output" | "spawn" | "timeout";

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

async function drainBounded(
	stream: ReadableStream<Uint8Array>,
): Promise<{ bytes: Uint8Array; exceeded: boolean }> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let kept = 0;
	let seen = 0;
	let exceeded = false;
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
			exceeded = seen > GIT_OUTPUT_LIMIT_BYTES;
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(kept);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { bytes, exceeded };
}

/** Run one bounded Git command without ever blocking Bun's process supervisor. */
export async function git(
	cwd: string,
	args: readonly string[],
	options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string | undefined> {
	if (options.signal?.aborted) throw new GitCommandError("aborted", "Git command was cancelled.");
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn(["git", ...args], {
			cwd,
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${(error as Error).message}`);
	}
	const stdout = drainBounded(child.stdout as ReadableStream<Uint8Array>);
	const stderr = drainBounded(child.stderr as ReadableStream<Uint8Array>);
	let termination: GitFailure | undefined;
	const terminate = (failure: GitFailure): void => {
		if (termination) return;
		termination = failure;
		if (child.exitCode !== null) return;
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	};
	const timeout = setTimeout(() => terminate("timeout"), options.timeoutMs ?? GIT_TIMEOUT_MS);
	const abort = (): void => terminate("aborted");
	options.signal?.addEventListener("abort", abort, { once: true });
	let exitCode: number;
	let out: Awaited<ReturnType<typeof drainBounded>>;
	let err: Awaited<ReturnType<typeof drainBounded>>;
	try {
		[exitCode, out, err] = await Promise.all([child.exited, stdout, stderr]);
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
	}
	if (termination) throw new GitCommandError(termination, `Git command ${termination}.`, exitCode);
	if (out.exceeded || err.exceeded)
		throw new GitCommandError("output", "Git command output exceeded 64 KiB.", exitCode);
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
