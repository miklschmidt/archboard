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
// vault check, which every open canvas polls, is: two bounded `git` calls
// that start no other program.

import fs from "node:fs";
import path from "node:path";
import { existingDir, repoIdentityFor } from "@/runtime/engine/git";
import {
	chosenCheckouts,
	listRegistry,
	type RegisteredRepoStatus,
} from "@/runtime/engine/repo-registry";
import { GIT_COMMAND_TIMEOUT_MS } from "@/shared/timing/timing";

/** The checkout that holds a vault: its canonical root, and what it calls itself. */
interface VaultCheckout {
	readonly root: string;
	readonly identity: string;
}

/**
 * Run one Git command to its end. A failure to answer (no repository, no
 * `origin`, no Git, a timeout) is no answer.
 * @param cwd Where Git runs.
 * @param args Git's arguments.
 * @returns Trimmed stdout, or undefined when Git did not answer.
 */
function gitAnswer(cwd: string, args: readonly string[]): string | undefined {
	try {
		const run = Bun.spawnSync(["git", ...args], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
			// A reading must not take the index lock that `git status` refreshes.
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
			timeout: GIT_COMMAND_TIMEOUT_MS,
		});
		return run.exitCode === 0 ? run.stdout.toString().trim() || undefined : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The checkout that holds a vault.
 * @param vault The vault directory.
 * @returns Its checkout, or undefined when the vault is in none.
 */
function vaultCheckoutOf(vault: string): VaultCheckout | undefined {
	const start = existingDir(path.resolve(vault));
	const top = start === undefined ? undefined : gitAnswer(start, ["rev-parse", "--show-toplevel"]);
	if (top === undefined) return undefined;
	const remote = gitAnswer(top, ["remote", "get-url", "origin"]);
	// A repository with no remote is named by its main checkout, which only Git's listing knows.
	const listing =
		remote === undefined ? gitAnswer(top, ["worktree", "list", "--porcelain"]) : undefined;
	return { root: fs.realpathSync.native(top), identity: repoIdentityFor(top, remote, listing) };
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

export { checkoutsReadFrom };
