// Where a binding resolves (ADR 0049), owned by one function.
//
// A binding or anchor names a repository identity. Every reader that turns one
// into a directory (the code opener, the code check, behind, footprint,
// locality and the vault's binding check) asks `checkoutsReadFrom` which
// checkout holds each identity for the vault it reads. The answer is the
// chosen checkout of every identity, except that the checkout holding the vault
// takes the place of its own identity, whether it is registered or chosen or
// not. So a proposal in a worktree is read against the worktree's code, and a
// vault in no checkout (an untracked vault) reads only chosen checkouts.
//
// The vault's checkout is found by asking Git, which is also how `behind` finds
// the commit a vault last changed in. The question is synchronous because the
// vault check, which every open canvas polls, is: at most three bounded `git`
// calls that start no other program. A Git that does not answer leaves the
// vault in no checkout rather than naming it by a directory.

import fs from "node:fs";
import path from "node:path";
import {
	existingDir,
	GitCommandError,
	repoIdentityFor,
	chosenCheckouts,
	listRegistry,
	type RegisteredRepoStatus,
} from "@archboard/workspace/checkouts";
import { GIT_COMMAND_TIMEOUT_MS } from "@archboard/timing";

/** The checkout that holds a vault: its canonical root, and what it calls itself. */
interface VaultCheckout {
	readonly root: string;
	readonly identity: string;
}

/**
 * Run Git synchronously.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @returns What it did.
 * @throws {GitCommandError} When Git could not start.
 */
function startedGit(cwd: string, args: readonly string[]) {
	try {
		return Bun.spawnSync(["git", ...args], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
			// A reading must not take the index lock that `git status` refreshes.
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
			timeout: GIT_COMMAND_TIMEOUT_MS,
		});
	} catch (error) {
		throw new GitCommandError("spawn", `Could not start Git: ${String(error)}`);
	}
}

/**
 * Run one Git command to its end. A non-zero exit is an answer (no repository,
 * no `origin`), as it is for the registry's own Git calls.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @returns Trimmed stdout, or undefined when Git exited non-zero or printed nothing.
 * @throws {GitCommandError} When Git could not start, was killed or timed out:
 * that is no answer, and reading it as "no `origin`" would name the checkout
 * by a directory where the registry names it by its remote.
 */
function gitAnswer(cwd: string, args: readonly string[]): string | undefined {
	const run = startedGit(cwd, args);
	if (run.exitedDueToTimeout === true) {
		throw new GitCommandError("timeout", "Git did not answer in time.");
	}
	if (run.signalCode !== undefined) {
		throw new GitCommandError("signal", `Git exited from ${run.signalCode}.`);
	}
	return run.exitCode === 0 ? run.stdout.toString().trim() || undefined : undefined;
}

/**
 * The checkout that holds a vault, asking Git without hiding a failure.
 * @param vault The vault directory.
 * @returns Its checkout, or undefined when the vault is in no Git repository.
 * @throws {GitCommandError} When Git could not start, was killed or timed out.
 */
function locatedVaultCheckout(vault: string): VaultCheckout | undefined {
	const start = existingDir(path.resolve(vault));
	if (start === undefined) return undefined;
	const top = gitAnswer(start, ["rev-parse", "--show-toplevel"]);
	if (top === undefined) return undefined;
	const remote = gitAnswer(top, ["remote", "get-url", "origin"]);
	// A repository with no remote is named by its main checkout, which only Git's listing knows.
	const listing =
		remote === undefined ? gitAnswer(top, ["worktree", "list", "--porcelain"]) : undefined;
	return { root: fs.realpathSync.native(top), identity: repoIdentityFor(top, remote, listing) };
}

/**
 * The checkout that holds a vault.
 * @param vault The vault directory.
 * @returns Its checkout, or undefined when the vault is in none or Git did not answer.
 */
function vaultCheckoutOf(vault: string): VaultCheckout | undefined {
	try {
		return locatedVaultCheckout(vault);
	} catch (error) {
		if (error instanceof GitCommandError) return undefined;
		throw error;
	}
}

/**
 * Whether a registered directory is the one at a canonical root.
 * @param registered The directory as registered.
 * @param root The canonical root.
 * @returns True when they are the same directory.
 */
function isRoot(registered: string, root: string): boolean {
	try {
		return fs.realpathSync.native(registered) === root;
	} catch {
		return false;
	}
}

/**
 * The checkouts a reader of one vault resolves identities in.
 * @param vault The vault directory, or null for a reading that belongs to no
 * vault (the machine's settings), which sees the chosen checkouts alone.
 * @returns One checkout for each identity: the vault's own for its own
 * identity, the chosen one for every other.
 */
function checkoutsReadFrom(vault: string | null): RegisteredRepoStatus[] {
	const chosen = chosenCheckouts();
	const own = vault === null ? undefined : vaultCheckoutOf(vault);
	if (own === undefined) return chosen;
	// A registered entry for this directory keeps its language servers; one
	// that nobody registered has none.
	const registered = listRegistry().checkouts.find((entry) => isRoot(entry.root, own.root));
	const read: RegisteredRepoStatus = {
		source: "declared",
		addedAt: "",
		...registered,
		repo: own.identity,
		root: own.root,
		chosen: true,
		exists: true,
	};
	return [...chosen.filter((entry) => entry.repo !== own.identity), read];
}

/**
 * The repository identity of the checkout that holds a vault: the identity
 * `checkoutsReadFrom` reads in the vault's own checkout. A drill-down that
 * names it opens a board of the vault itself (ADR 0049).
 * @param vault The vault directory.
 * @returns The identity, or undefined for an untracked vault or a Git that did not answer.
 */
function vaultIdentity(vault: string): string | undefined {
	return vaultCheckoutOf(vault)?.identity;
}

/**
 * The repository identity of the checkout that holds a vault, for a reader that
 * writes it down. `vaultIdentity` answers undefined when Git did not answer, as
 * it does for a vault in no repository; a record of "no repository" must tell
 * the two apart.
 * @param vault The vault directory.
 * @returns The identity, or null when the vault is in no Git repository.
 * @throws {GitCommandError} When Git could not start, was killed or timed out.
 */
function vaultRepositoryIdentity(vault: string): string | null {
	return locatedVaultCheckout(vault)?.identity ?? null;
}

export { checkoutsReadFrom, vaultIdentity, vaultRepositoryIdentity };
