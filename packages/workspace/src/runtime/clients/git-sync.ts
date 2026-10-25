// The checkout that holds a vault, asked of Git synchronously.
//
// A caller that cannot wait, such as the vault check that every open canvas
// polls, asks here: at most three bounded `git` calls that start no other
// program. A Git that does not answer leaves the vault in no checkout rather
// than naming it by a directory, because the registry names it by its remote.

import fs from "node:fs";
import path from "node:path";
import { GIT_MS } from "@archboard/timing";
import { existingDir, repoIdentityFor } from "#runtime/clients/git.ts";
import { GitCommandError } from "#runtime/clients/git-failure.ts";

/** The checkout that holds a vault: its canonical root, and what it calls itself. */
interface VaultGitCheckout {
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
			timeout: GIT_MS.command,
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
 * The Git checkout that holds a vault, asked synchronously.
 * @param vault The vault directory.
 * @returns Its checkout, or undefined when the vault is in none or Git did not answer.
 */
function gitCheckoutOfVault(vault: string): VaultGitCheckout | undefined {
	const start = existingDir(path.resolve(vault));
	if (start === undefined) return undefined;
	try {
		const top = gitAnswer(start, ["rev-parse", "--show-toplevel"]);
		if (top === undefined) return undefined;
		const remote = gitAnswer(top, ["remote", "get-url", "origin"]);
		// A repository with no remote is named by its main checkout, which only Git's listing knows.
		const listing =
			remote === undefined ? gitAnswer(top, ["worktree", "list", "--porcelain"]) : undefined;
		return { root: fs.realpathSync.native(top), identity: repoIdentityFor(top, remote, listing) };
	} catch (error) {
		if (error instanceof GitCommandError) return undefined;
		throw error;
	}
}

export { gitCheckoutOfVault, type VaultGitCheckout };
