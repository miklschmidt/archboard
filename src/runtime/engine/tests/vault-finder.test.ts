// The vault a command addresses, found the way git finds its repository
// (ADR 0049, TASK-472.06). These tests drive the finder over real temporary
// git checkouts, a checkout nested in another, and directories outside any
// checkout, and read what it found or why it found nothing.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findVault, type VaultFinding } from "@/runtime/engine/vault-finder";

let scratch = "";

/**
 * Make a directory and return its real path.
 * @param segments The path below the scratch directory.
 * @returns The real path.
 */
function directory(...segments: string[]): string {
	const made = join(scratch, ...segments);
	mkdirSync(made, { recursive: true });
	return realpathSync.native(made);
}

/**
 * Give a directory a vault.
 * @param holder The directory.
 * @returns The vault's real path.
 */
function vaultIn(holder: string): string {
	return directory(relative(scratch, holder), ".archboard", "vault");
}

/**
 * Make a git checkout with no machine configuration.
 * @param segments Where, below the scratch directory.
 * @returns Its root.
 */
function checkout(...segments: string[]): string {
	const root = directory(...segments);
	const done = Bun.spawnSync(["git", "init", "-q", "-b", "main"], {
		cwd: root,
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (done.exitCode !== 0) throw new Error(done.stderr.toString());
	return root;
}

/**
 * Find the vault from a working directory, with neither -C nor the environment.
 * @param cwd The working directory.
 * @returns The finding.
 */
function fromWorkingDirectory(cwd: string): Promise<VaultFinding> {
	return findVault({ directory: null, environment: undefined, cwd });
}

beforeAll(() => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-vault-finder-")));
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("anywhere inside a checkout the vault is the one at the checkout root", async () => {
	const root = checkout("shop");
	const vault = vaultIn(root);
	const deep = directory("shop", "src", "orders");
	expect(await fromWorkingDirectory(deep)).toEqual({
		ok: true,
		found: { path: vault, origin: "working-directory", holder: root },
	});
	// The vault directory itself is inside the checkout, and finds itself.
	expect(await fromWorkingDirectory(vault)).toMatchObject({ ok: true, found: { path: vault } });
});

test("a checkout without a vault at its root refuses, and never uses a vault above it", async () => {
	const parent = directory("meta");
	vaultIn(parent);
	const root = checkout("meta", "billing");
	const inside = directory("meta", "billing", "lib");
	expect(await fromWorkingDirectory(inside)).toMatchObject({
		ok: false,
		code: "VAULT_NOT_FOUND",
		reason: "checkout-without-vault",
		directory: inside,
		origin: "working-directory",
		checkoutRoot: root,
	});
});

test("a checkout nested in a checkout with a vault refuses rather than use the outer vault", async () => {
	const outer = checkout("outer");
	vaultIn(outer);
	const inner = checkout("outer", "vendor", "inner");
	expect(await fromWorkingDirectory(inner)).toMatchObject({
		ok: false,
		reason: "checkout-without-vault",
		checkoutRoot: inner,
	});
});

test("outside any checkout the nearest enclosing vault is used, and none is refused", async () => {
	const far = directory("plans");
	vaultIn(far);
	const near = directory("plans", "q3");
	const nearVault = vaultIn(near);
	const below = directory("plans", "q3", "drafts");
	expect(await fromWorkingDirectory(below)).toEqual({
		ok: true,
		found: { path: nearVault, origin: "working-directory", holder: near },
	});
	const lonely = directory("lonely", "deep");
	expect(await fromWorkingDirectory(lonely)).toMatchObject({
		ok: false,
		reason: "none-enclosing",
		directory: lonely,
		origin: "working-directory",
	});
	expect(await fromWorkingDirectory(lonely)).not.toHaveProperty("checkoutRoot");
});

test("-C starts the same search from the directory it names, relative to the working directory", async () => {
	const root = checkout("named");
	const vault = vaultIn(root);
	const elsewhere = directory("elsewhere");
	expect(
		await findVault({ directory: "../named", environment: "/somewhere/else", cwd: elsewhere }),
	).toEqual({ ok: true, found: { path: vault, origin: "-C", holder: root } });
	// A vault directory names its own vault, in a checkout and outside one.
	expect(await findVault({ directory: vault, environment: undefined, cwd: elsewhere })).toEqual({
		ok: true,
		found: { path: vault, origin: "-C", holder: root },
	});
	const untracked = directory("loose");
	const looseVault = vaultIn(untracked);
	expect(
		await findVault({ directory: looseVault, environment: undefined, cwd: elsewhere }),
	).toEqual({
		ok: true,
		found: { path: looseVault, origin: "-C", holder: untracked },
	});
});

test("-C naming no directory is refused", async () => {
	const elsewhere = directory("elsewhere");
	expect(
		await findVault({ directory: "gone", environment: undefined, cwd: elsewhere }),
	).toMatchObject({
		ok: false,
		reason: "directory-missing",
		directory: join(elsewhere, "gone"),
		origin: "-C",
	});
});
