// Where a binding resolves (ADR 0049, TASK-472.03): in the checkout that holds
// the vault when it names the vault's own identity, and in the chosen checkout
// of the identity when it names any other. The cases here are the ones that
// only the rule can get wrong; the CLI and opener owners prove the readers use it.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GitCommandError } from "@archboard/process/git";
import { declareDirectory, setLanguageServer } from "@archboard/workspace/checkouts";
import { checkoutsReadFrom, vaultRepositoryIdentity } from "#runtime/services/vault-checkout.ts";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "#runtime/operations/checkout-snapshot.ts";
import {
	createResolverFixture,
	type ResolverFixture,
} from "#tests/runtime/support/resolver-fixture.ts";

const BILLING = "github.com/acme/billing";
let fixture: ResolverFixture;
let previousRegistry: string | undefined;
let billing = "";
let holder = "";

/**
 * A checkout of an identity, with a vault in it.
 * @param parent The directory it goes in.
 * @param name Its directory name.
 * @param origin The identity it names as its origin, or none.
 * @returns Its canonical root.
 */
function checkoutWithVault(parent: string, name: string, origin: string | undefined): string {
	const root = join(parent, name);
	mkdirSync(join(root, ".archboard", "vault"), { recursive: true });
	for (const args of [["init", "-q"], ...(origin ? [["remote", "add", "origin", origin]] : [])]) {
		Bun.spawnSync(["git", ...args], { cwd: root });
	}
	return realpathSync.native(root);
}

/**
 * Where an identity resolves for a vault.
 * @param vault The vault directory, or null for no vault.
 * @param repository The identity.
 * @returns The root it resolved to, or the failure code.
 */
async function resolvedFor(vault: string | null, repository: string): Promise<string> {
	const resolved = resolveRegisteredCheckout(repository, await snapshotCheckoutAccess({ vault }));
	return resolved.ok ? resolved.root : resolved.code;
}

beforeEach(async () => {
	fixture = createResolverFixture();
	previousRegistry = process.env["ARCHBOARD_REPOS"];
	process.env["ARCHBOARD_REPOS"] = fixture.registry;
	// A second checkout of the fixture's repository, which holds a vault and is not registered.
	holder = checkoutWithVault(fixture.root, "holder", `https://${fixture.repository}.git`);
	// Another repository, registered and so chosen.
	billing = checkoutWithVault(fixture.root, "billing", `https://${BILLING}.git`);
	await declareDirectory(billing);
});

afterEach(() => {
	if (previousRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = previousRegistry;
	fixture.dispose();
});

test("a vault reads its own checkout for its own identity, though nobody registered it", async () => {
	const vault = join(holder, ".archboard", "vault");
	expect(await resolvedFor(vault, fixture.repository)).toBe(holder);
	expect(await resolvedFor(null, fixture.repository)).toBe(realpathSync.native(fixture.checkout));
});

test("a vault reads the chosen checkout for any other identity", async () => {
	expect(await resolvedFor(join(holder, ".archboard", "vault"), BILLING)).toBe(billing);
});

test("a vault's checkout runs the language servers registered for it, never the chosen checkout's", async () => {
	const vault = join(holder, ".archboard", "vault");
	/**
	 * The language servers a reading of the vault runs for its own identity.
	 * @returns The servers of the checkout it reads.
	 */
	async function serversRead() {
		const snapshot = await snapshotCheckoutAccess({ vault });
		return snapshot.entries.find((entry) => entry.repo === fixture.repository)?.servers;
	}
	expect(
		setLanguageServer(fixture.checkout, "python", { command: "chosen", args: [] }),
	).toBeDefined();
	expect(await serversRead()).toBeUndefined();
	await declareDirectory(holder);
	expect(setLanguageServer(holder, "python", { command: "own", args: [] })).toBeDefined();
	expect(await serversRead()).toEqual({ python: { command: "own", args: [] } });
	expect(await resolvedFor(vault, fixture.repository)).toBe(holder);
});

test("a vault in no checkout reads the chosen checkouts alone", async () => {
	const untracked = join(fixture.root, "untracked", ".archboard", "vault");
	mkdirSync(untracked, { recursive: true });
	writeFileSync(join(untracked, "marker"), "");
	expect(await resolvedFor(untracked, fixture.repository)).toBe(
		realpathSync.native(fixture.checkout),
	);
	expect(await resolvedFor(untracked, BILLING)).toBe(billing);
});

test("a vault in a linked worktree of a repository with no origin has the identity of the main checkout", async () => {
	const main = checkoutWithVault(fixture.root, "lonely-main", undefined);
	const linked = join(fixture.root, "lonely-linked");
	writeFileSync(join(main, "file.ts"), "export {};\n");
	for (const args of [
		["add", "-A"],
		["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "first"],
		["worktree", "add", "-q", "-b", "feature", linked],
	]) {
		const result = Bun.spawnSync(["git", ...args], {
			cwd: main,
			env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
		});
		expect(result.exitCode, result.stderr.toString()).toBe(0);
	}
	mkdirSync(join(linked, ".archboard", "vault"), { recursive: true });
	await declareDirectory(main);
	expect(await resolvedFor(join(linked, ".archboard", "vault"), "lonely-main")).toBe(
		realpathSync.native(linked),
	);
});

test("a vault whose Git does not answer for its origin reads the chosen checkouts alone", () => {
	const vault = join(holder, ".archboard", "vault");
	const chosen = checkoutsReadFrom(null);
	// A Git that is killed when asked for the remote, as one that times out is.
	withGitKilledAt("remote", () => {
		expect(checkoutsReadFrom(vault)).toEqual(chosen);
	});
});

/**
 * Run a body with a `git` first on the PATH that is killed when asked for one subcommand.
 * @param subcommand The Git subcommand that dies.
 * @param body What runs with that Git.
 */
function withGitKilledAt(subcommand: string, body: () => void): void {
	const bin = join(fixture.root, "bin");
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
	}
}

test("the repository a vault is in is null only when it is in no Git repository", () => {
	expect(vaultRepositoryIdentity(join(holder, ".archboard", "vault"))).toBe(fixture.repository);
	const untracked = join(fixture.root, "untracked", ".archboard", "vault");
	mkdirSync(untracked, { recursive: true });
	expect(vaultRepositoryIdentity(untracked)).toBeNull();
});

test("a Git that does not answer is no answer for the repository a vault is in, never null", () => {
	const vault = join(holder, ".archboard", "vault");
	for (const subcommand of ["rev-parse", "remote"]) {
		withGitKilledAt(subcommand, () => {
			expect(() => vaultRepositoryIdentity(vault)).toThrow(GitCommandError);
		});
		rmSync(join(fixture.root, "bin"), { recursive: true });
	}
});
