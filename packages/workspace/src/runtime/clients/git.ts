// The little bit of git archboard needs: what repository a directory belongs
// to, what that repository is called in a way that is the same on every
// machine, and what a checkout has out. Resolving a binding and keeping the
// checkout registry (ADR 0011) both read it.

import fs from "fs";
import path from "path";

import { git, GitCommandError } from "@archboard/process/git";

/** How a caller cancels a Git inspection. */
type InspectOptions = Pick<NonNullable<Parameters<typeof git>[2]>, "signal" | "timeoutMs">;

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
 * What a checkout calls itself: the identity of its repository, which every
 * worktree of the repository shares.
 *
 * `origin` when there is one, because that is the name the same repository has
 * on every machine and in every clone, and every worktree reads the same
 * remote. A repo with no remote falls back to the directory name of its main
 * checkout, which is machine-local and therefore weaker. A binding that says
 * which local repo it means still beats one that says nothing.
 * @param root The repository root.
 * @param options Cancellation.
 * @returns The remote-derived identity, or the name of the main checkout's directory.
 */
async function repoIdentityAt(root: string, options: InspectOptions = {}): Promise<string> {
	const remote = await optionalGit(root, ["remote", "get-url", "origin"], options);
	const listing =
		remote === undefined
			? await optionalGit(root, ["worktree", "list", "--porcelain"], options)
			: undefined;
	return repoIdentityFor(root, remote, listing);
}

/**
 * The identity of a checkout: the one rule, for a caller that has asked Git
 * itself (`repoIdentityAt`) and for one that cannot wait for it.
 * @param root The repository root.
 * @param remote The URL of `origin`, or undefined when there is none.
 * @param worktreeListing What `git worktree list --porcelain` printed in the
 * checkout. Git lists the main worktree first, and a repository with no remote
 * is named by that directory so that its linked worktrees share its identity.
 * A bare repository has no working tree and is named by its own directory
 * without the `.git` suffix. Without a listing the checkout is named by its own
 * directory, which is wrong for a linked worktree: pass it whenever `remote`
 * is absent.
 * @returns The remote-derived identity, or the name of the main checkout's directory.
 */
function repoIdentityFor(
	root: string,
	remote: string | undefined,
	worktreeListing?: string,
): string {
	if (remote) {
		return repoIdentityFromRemote(remote);
	}
	const main = worktreeEntries(worktreeListing)[0];
	if (main === undefined) {
		return path.basename(root);
	}
	// Git lists a bare repository, and a main checkout whose git directory lives
	// elsewhere (`git init --separate-git-dir`), by that git directory. Nothing in
	// Git leads from a linked worktree back to such a main checkout, so every
	// checkout of the repository is named by the git directory, without `.git`.
	const named =
		main.bare || isGitDirectory(main.path) ? main.path.replace(/\.git$/u, "") : main.path;
	return path.basename(named);
}

/**
 * Whether a path is a git directory rather than a working tree.
 * @param target A path that Git listed as a worktree.
 * @returns True when it holds `HEAD` and no `.git` of its own.
 */
function isGitDirectory(target: string): boolean {
	return fs.existsSync(path.join(target, "HEAD")) && !fs.existsSync(path.join(target, ".git"));
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

/** What a checkout has out: the branch it is on and the commit at HEAD, each absent when none. */
interface CheckoutHead {
	readonly branch?: string;
	readonly commit?: string;
}

/**
 * The branch a checkout is on and the commit it has out. A detached HEAD has no branch, and a
 * branch with no commits yet has no commit.
 * @param root The checkout's root.
 * @param options Cancellation.
 * @returns The branch and the full commit id, each when there is one.
 */
async function checkoutHead(
	root: string,
	options: InspectOptions = {},
): Promise<Readonly<CheckoutHead>> {
	const [branchResult, commitResult] = await Promise.allSettled([
		optionalGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], options),
		optionalGit(root, ["rev-parse", "--quiet", "--verify", "HEAD"], options),
	]);
	const branch = fulfilled(branchResult);
	const commit = fulfilled(commitResult);
	return Object.freeze({ ...(branch ? { branch } : {}), ...(commit ? { commit } : {}) });
}

/** One entry of `git worktree list --porcelain`. */
interface WorktreeEntry {
	readonly path: string;
	readonly bare: boolean;
	readonly prunable: boolean;
}

/**
 * The entries of a `git worktree list --porcelain` listing, in Git's order:
 * the main worktree first.
 * @param listing What Git printed, or undefined when it did not answer.
 * @returns Each entry with a path.
 */
function worktreeEntries(listing: string | undefined): WorktreeEntry[] {
	return (listing ?? "").split(/\n\n+/u).flatMap((block) => {
		const lines = block.split("\n");
		const worktree = lines.find((line) => line.startsWith("worktree "));
		return worktree === undefined
			? []
			: {
					path: worktree.slice(9),
					bare: lines.includes("bare"),
					prunable: lines.some((line) => line.startsWith("prunable")),
				};
	});
}

/** A checkout's root and the identity of its repository. */
type CheckoutOfIdentity = Pick<CheckoutGitInspection, "root" | "identity">;

/**
 * The real path of a directory, as Git reports a root.
 * @param target A path.
 * @returns Its real path, or undefined when it is no directory.
 */
function realDirectory(target: string): string | undefined {
	try {
		const real = fs.realpathSync.native(target);
		return fs.statSync(real).isDirectory() ? real : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The git directory of a checkout: its `.git`, or the directory that a linked
 * worktree's `.git` file names.
 * @param root A checkout's root.
 * @returns The git directory, or undefined when `.git` names none.
 */
function ownGitDirectory(root: string): string | undefined {
	const entry = path.join(root, ".git");
	try {
		if (fs.statSync(entry).isDirectory()) {
			return entry;
		}
		const gitfile = fs.readFileSync(entry, "utf8");
		return gitfile.startsWith("gitdir: ")
			? path.resolve(root, gitfile.slice("gitdir: ".length).trimEnd())
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * The git directory that a checkout shares with every worktree of its
 * repository, when the checkout has no worktree-specific config. A linked
 * worktree's own git directory names the shared one in `commondir`. A checkout
 * with a `config.worktree`, which `extensions.worktreeConfig` turns on and
 * which can name another `origin`, root or `core.bare`, has none.
 * @param root A checkout's root.
 * @returns The real path of the shared git directory, or undefined when only Git can tell.
 */
function commonGitDirectory(root: string): string | undefined {
	const own = ownGitDirectory(root);
	if (own === undefined || !fs.existsSync(path.join(own, "HEAD"))) {
		return undefined;
	}
	const common = path.join(own, "commondir");
	try {
		return fs.existsSync(path.join(own, "config.worktree"))
			? undefined
			: realDirectory(
					fs.existsSync(common)
						? path.resolve(own, fs.readFileSync(common, "utf8").trimEnd())
						: own,
				);
	} catch {
		return undefined;
	}
}

/**
 * Find shared configuration that cannot vary with a worktree's path or branch.
 * @param root The declaring checkout.
 * @param options Cancellation and the command deadline.
 * @returns Its common Git directory, or undefined when each worktree needs inspection.
 */
async function shareableGitDirectory(
	root: string,
	options: InspectOptions,
): Promise<string | undefined> {
	const common = commonGitDirectory(root);
	if (common === undefined) return undefined;
	const conditional = await optionalGit(
		root,
		["config", "--includes", "--name-only", "--get-regexp", "^includeif\\."],
		options,
	);
	return conditional === undefined ? common : undefined;
}

/**
 * One worktree that Git listed for a checkout. It has the checkout's identity
 * and its listed root when it shares the checkout's git directory and effective config,
 * and Git inspects it otherwise.
 * @param root The worktree's listed root.
 * @param common The checkout's shared git directory, when it reads no config of its own.
 * @param checkout The checkout.
 * @param options Cancellation.
 * @returns Its root and identity, or undefined when it is no checkout.
 */
async function listedWorktree(
	root: string,
	common: string | undefined,
	checkout: CheckoutOfIdentity,
	options: InspectOptions,
): Promise<CheckoutOfIdentity | undefined> {
	if (common !== undefined && commonGitDirectory(root) === common) {
		return { root, identity: checkout.identity };
	}
	return inspectCheckout(root, options);
}

/**
 * The worktrees of a checkout other than the checkout itself, as Git lists
 * them for it, that are checkouts of its identity. A bare repository has no
 * working tree, Git lists a main checkout whose git directory lives elsewhere
 * by that git directory, and a worktree whose directory is gone is `prunable`
 * in Git's own words, so all three are left out.
 *
 * One `git worktree list` names every worktree. A worktree that shares its git
 * directory with the checkout, where neither keeps a config of its own and no
 * conditional includes apply, reads
 * the repository's config as the checkout does, so it has the checkout's
 * identity and its listed root (`commonGitDirectory`). Git inspects any other
 * worktree, one at a time: a config of its own can give it another `origin`
 * or another root, and a `.git` that names the git directory of another
 * repository makes it a checkout of that one. One bounded config probe detects
 * conditional includes before any identity is shared. Ordinary worktree families
 * need no per-worktree Git commands.
 * @param checkout The checkout.
 * @param options Cancellation.
 * @returns Each worktree's real root and identity; none when Git cannot list them.
 */
async function worktreesOf(
	checkout: CheckoutOfIdentity,
	options: InspectOptions = {},
): Promise<CheckoutOfIdentity[]> {
	const listing = await optionalGit(checkout.root, ["worktree", "list", "--porcelain"], options);
	const roots = worktreeEntries(listing).flatMap((entry) => {
		const root = entry.bare || entry.prunable ? undefined : realDirectory(entry.path);
		return root === undefined || root === checkout.root || isGitDirectory(root) ? [] : [root];
	});
	const common =
		roots.length === 0 ? undefined : await shareableGitDirectory(checkout.root, options);
	const worktrees: CheckoutOfIdentity[] = [];
	for (const root of roots) {
		// oxlint-disable-next-line no-await-in-loop -- one worktree at a time, so many worktrees that Git must inspect never run Git at once
		const each = await listedWorktree(root, common, checkout, options);
		if (each !== undefined) {
			worktrees.push({ root: each.root, identity: each.identity });
		}
	}
	return worktrees.filter(
		(each) => each.root !== checkout.root && each.identity === checkout.identity,
	);
}

export {
	type CheckoutHead,
	worktreesOf,
	checkoutHead,
	repoIdentityFromRemote,
	existingDir,
	repoRootOf,
	repoIdentityAt,
	repoIdentityFor,
	type CheckoutGitInspection,
	inspectCheckout,
};
