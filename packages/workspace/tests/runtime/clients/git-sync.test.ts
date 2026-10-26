// The checkout that holds a vault, as Git answers it: the identity of its
// repository, no checkout for a vault in no repository, and a Git that does not
// answer thrown rather than read as no repository. A recipe that wrote "no
// repository" for a Git that timed out would send an embed to the wrong vault.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitCommandError } from "@archboard/process/git";
import { gitCheckoutOfVault } from "#runtime/clients/git-sync.ts";

const REPOSITORY = "github.com/acme/billing";
let scratch = "";
let checkout = "";

beforeEach(() => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-git-sync-")));
	checkout = join(scratch, "billing");
	mkdirSync(join(checkout, ".archboard", "vault"), { recursive: true });
	for (const args of [
		["init", "-q"],
		["remote", "add", "origin", `https://${REPOSITORY}.git`],
	]) {
		Bun.spawnSync(["git", ...args], { cwd: checkout });
	}
});

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run a body with a `git` first on the PATH that is killed when asked for one subcommand.
 * @param subcommand The Git subcommand that dies.
 * @param body What runs with that Git.
 */
function withGitKilledAt(subcommand: string, body: () => void): void {
	const bin = join(scratch, "bin");
	mkdirSync(bin);
	writeFileSync(
		join(bin, "git"),
		`#!/bin/sh\n[ "$1" = ${subcommand} ] && kill -9 $$\nexec ${Bun.which("git")} "$@"\n`,
	);
	chmodSync(join(bin, "git"), 0o755);
	const path = process.env["PATH"];
	process.env["PATH"] = `${bin}:${path}`;
	try {
		body();
	} finally {
		process.env["PATH"] = path;
		rmSync(bin, { recursive: true });
	}
}

test("a vault's checkout is its repository's, and a vault in no repository has none", () => {
	expect(gitCheckoutOfVault(join(checkout, ".archboard", "vault"))).toEqual({
		root: checkout,
		identity: REPOSITORY,
	});
	const untracked = join(scratch, "untracked", ".archboard", "vault");
	mkdirSync(untracked, { recursive: true });
	expect(gitCheckoutOfVault(untracked)).toBeUndefined();
});

test("a Git that does not answer is thrown, never read as no repository", () => {
	const vault = join(checkout, ".archboard", "vault");
	for (const subcommand of ["rev-parse", "remote"]) {
		withGitKilledAt(subcommand, () => {
			expect(() => gitCheckoutOfVault(vault)).toThrow(GitCommandError);
		});
	}
});
