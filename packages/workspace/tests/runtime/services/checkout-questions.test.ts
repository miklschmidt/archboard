// What callers ask of the checkout registry (ADR 0049, ADR 0050, TASK-653.10): the checkout a
// repository reads, choosing one, and the checkouts a vault reads. A vault reads its own checkout
// for its own identity and the chosen checkout of any other; a vault in no checkout, or one whose
// Git does not answer, reads the chosen checkouts alone. These tests drive real temporary
// checkouts, real Git and an isolated registry through the package's interface.

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkoutOf,
	checkoutsReadFrom,
	chooseCheckout,
	declareDirectory,
	forgetDirectory,
} from "#runtime/api/checkouts.ts";

const PAYMENTS = "github.com/acme/payments";
const BILLING = "github.com/acme/billing";
const caller = process.env["ARCHBOARD_REPOS"];
let scratch = "";
let payments = "";
let billing = "";

/**
 * Run Git with no configuration of the machine.
 * @param cwd Where it runs.
 * @param args Its arguments.
 */
function git(cwd: string, ...args: string[]): void {
	const done = Bun.spawnSync(["git", ...args], {
		cwd,
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (done.exitCode !== 0) throw new Error(done.stderr.toString());
}

/**
 * A checkout with a vault in it.
 * @param name Its directory name.
 * @param origin The identity it names as its origin, or none.
 * @returns Its canonical root.
 */
function checkoutWithVault(name: string, origin: string | undefined): string {
	const root = join(scratch, name);
	mkdirSync(join(root, ".archboard", "vault"), { recursive: true });
	git(root, "init", "-q");
	if (origin !== undefined) git(root, "remote", "add", "origin", `https://${origin}.git`);
	return realpathSync.native(root);
}

/**
 * The vault of a directory.
 * @param holder The directory.
 * @returns Its `.archboard/vault`.
 */
function vaultOf(holder: string): string {
	return join(holder, ".archboard", "vault");
}

/**
 * Where an identity resolves for a vault.
 * @param vault The vault, or null for no vault.
 * @param repo The identity.
 * @returns The root it reads, or undefined when it reads none.
 */
function rootFor(vault: string | null, repo: string): string | undefined {
	return checkoutsReadFrom(vault).checkouts.find((each) => each.repo === repo)?.root;
}

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

beforeEach(async () => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-checkout-questions-")));
	process.env["ARCHBOARD_REPOS"] = join(scratch, "state", "repos.json");
	payments = checkoutWithVault("payments", PAYMENTS);
	billing = checkoutWithVault("billing", BILLING);
	await declareDirectory(payments);
	await declareDirectory(billing);
});

afterEach(() => {
	if (caller === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller;
	rmSync(scratch, { recursive: true, force: true });
});

test("a vault reads its own checkout for its own identity, though nobody registered it, and the chosen checkout for any other", () => {
	const holder = checkoutWithVault("holder", PAYMENTS);
	const read = checkoutsReadFrom(vaultOf(holder));
	expect(read.own).toEqual({ identity: PAYMENTS, root: holder });
	expect(read.checkouts.map((each) => [each.repo, each.root, each.chosen, each.exists])).toEqual([
		[BILLING, billing, true, true],
		[PAYMENTS, holder, true, true],
	]);
	expect(rootFor(null, PAYMENTS)).toBe(payments);
	expect(checkoutsReadFrom(null).own).toBeUndefined();
});

test("the vault's own checkout keeps what the registry holds for it", async () => {
	const holder = checkoutWithVault("holder", PAYMENTS);
	await declareDirectory(holder);
	const registered = checkoutsReadFrom(null).checkouts;
	const own = checkoutsReadFrom(vaultOf(holder)).checkouts.find((each) => each.root === holder);
	expect(own).toMatchObject({ source: "declared", chosen: true, exists: true });
	expect(own?.addedAt).not.toBe("");
	expect(registered.map((each) => each.root)).toEqual([billing, payments]);
});

test("a vault in no checkout reads the chosen checkouts alone", () => {
	const untracked = join(scratch, "untracked", ".archboard", "vault");
	mkdirSync(untracked, { recursive: true });
	expect(checkoutsReadFrom(untracked)).toEqual(checkoutsReadFrom(null));
	expect(rootFor(untracked, PAYMENTS)).toBe(payments);
});

test("a vault in a linked worktree of a repository with no origin has the identity of the main checkout", async () => {
	const main = checkoutWithVault("lonely-main", undefined);
	const linked = join(scratch, "lonely-linked");
	writeFileSync(join(main, "file.ts"), "export {};\n");
	git(main, "add", "-A");
	git(main, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "first");
	git(main, "worktree", "add", "-q", "-b", "feature", linked);
	mkdirSync(vaultOf(linked), { recursive: true });
	await declareDirectory(main);
	expect(rootFor(vaultOf(linked), "lonely-main")).toBe(realpathSync.native(linked));
});

test.each(["rev-parse", "remote"])(
	"a vault whose Git is killed at %s reads the chosen checkouts alone",
	(subcommand) => {
		const chosen = checkoutsReadFrom(null);
		withGitKilledAt(subcommand, () => {
			expect(checkoutsReadFrom(vaultOf(payments))).toEqual(chosen);
		});
	},
);

test("a repository reads its chosen checkout, names its known roots while none is chosen, and names the chosen repositories when it has none known", async () => {
	expect(checkoutOf(PAYMENTS)).toEqual({ kind: "chosen", root: payments });
	const clone = checkoutWithVault("payments-clone", PAYMENTS);
	await declareDirectory(clone);
	await forgetDirectory(payments);
	expect(checkoutOf(PAYMENTS)).toEqual({ kind: "unchosen", roots: [clone] });
	expect(checkoutOf("github.com/acme/ledger")).toEqual({
		kind: "unknown",
		chosenRepositories: [BILLING],
	});
});

test("choosing a known checkout says what it replaced, and choosing it again changes nothing", async () => {
	const clone = checkoutWithVault("payments-clone", PAYMENTS);
	await declareDirectory(clone);
	expect(chooseCheckout(PAYMENTS, clone)).toEqual({
		kind: "chosen",
		changed: true,
		replaced: payments,
	});
	expect(checkoutOf(PAYMENTS)).toEqual({ kind: "chosen", root: clone });
	expect(chooseCheckout(PAYMENTS, clone)).toEqual({
		kind: "chosen",
		changed: false,
		replaced: null,
	});
});

test("a choice of a root that is not a known checkout of the repository, is gone, or holds no vault the server serves is refused and changes nothing", async () => {
	const bare = join(scratch, "bare-clone");
	mkdirSync(bare);
	git(bare, "init", "-q");
	git(bare, "remote", "add", "origin", `https://${PAYMENTS}.git`);
	const linked = checkoutWithVault("linked-clone", PAYMENTS);
	rmSync(vaultOf(linked), { recursive: true });
	symlinkSync(scratch, vaultOf(linked));
	const doomed = checkoutWithVault("doomed-clone", PAYMENTS);
	for (const root of [bare, linked, doomed]) await declareDirectory(root);
	rmSync(doomed, { recursive: true });
	expect(chooseCheckout(BILLING, payments)).toEqual({ kind: "unknown" });
	expect(chooseCheckout(PAYMENTS, join(scratch, "nowhere"))).toEqual({ kind: "unknown" });
	expect(chooseCheckout(PAYMENTS, doomed)).toEqual({ kind: "gone" });
	expect(chooseCheckout(PAYMENTS, realpathSync.native(bare))).toEqual({ kind: "no-vault" });
	expect(chooseCheckout(PAYMENTS, linked)).toEqual({ kind: "no-vault" });
	expect(checkoutOf(PAYMENTS)).toEqual({ kind: "chosen", root: payments });
});
