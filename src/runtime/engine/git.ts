// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

import fs from "fs";
import path from "path";

import { git } from "@/runtime/engine/lib/git-command";
import { GitCommandError } from "@/runtime/engine/lib/git-failure";
import type { GitFailure } from "@/runtime/engine/lib/git-failure";

/** How a caller cancels a Git inspection. */
interface InspectOptions {
	signal?: AbortSignal;
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
	options: InspectOptions = {},
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
async function repoIdentityAt(root: string, options: InspectOptions = {}): Promise<string> {
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
	options: InspectOptions,
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
	options: InspectOptions = {},
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
