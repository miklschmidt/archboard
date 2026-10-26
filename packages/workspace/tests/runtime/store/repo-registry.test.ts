// The checkout registry holds every known checkout and one chosen checkout for
// each repository identity (ADR 0049, TASK-472.02). These tests drive its
// operations against real temporary git checkouts and worktrees and an
// isolated registry file, and read the answers a command would print.

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	chosenCheckouts,
	declareDirectory,
	declareIfUnknown,
	forgetDirectory,
	listRegistry,
	RepoRegistryError,
	repositoryOfVault,
	setLanguageServer,
} from "#runtime/store/repo-registry.ts";

/**
 * The root of the chosen checkout of an identity.
 * @param repo The repository identity.
 * @returns Its root, or undefined when it has none.
 */
function chosenRoot(repo: string): string | undefined {
	return chosenCheckouts().find((each) => each.repo === repo)?.root;
}

const IDENTITY = "github.com/test/orders";
const caller = process.env["ARCHBOARD_REPOS"];
let scratch = "";
let registry = "";
let main = "";
let clone = "";
let worktree = "";

/**
 * Run Git with an owner's identity and no configuration of the machine.
 * @param directory Where it runs.
 * @param args Its arguments.
 */
function git(directory: string, ...args: string[]): void {
	const done = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", ...args], {
		cwd: directory,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
		},
	});
	if (done.exitCode !== 0) throw new Error(done.stderr.toString());
}

/**
 * A repository of the orders identity with one commit.
 * @param directory Where it is made.
 * @returns Its root.
 */
function repository(directory: string): string {
	mkdirSync(directory, { recursive: true });
	git(directory, "init", "-q", "-b", "main");
	git(directory, "remote", "add", "origin", `https://${IDENTITY}.git`);
	git(directory, "commit", "-q", "--allow-empty", "-m", "init");
	return realpathSync.native(directory);
}

/**
 * Add a linked worktree to a checkout.
 * @param checkout The checkout.
 * @param name The worktree's directory name, beside the checkout.
 * @returns Its root.
 */
function addWorktree(checkout: string, name: string): string {
	const target = join(scratch, name);
	git(checkout, "worktree", "add", "-q", "-b", name, target);
	return realpathSync.native(target);
}

/**
 * The roots of the known checkouts of the orders identity, and which one is chosen.
 * @returns Them in the registry's order.
 */
function orders() {
	const entries = listRegistry().checkouts.filter((each) => each.repo === IDENTITY);
	return {
		roots: entries.map((each) => each.root).toSorted(),
		chosen: entries.filter((each) => each.chosen).map((each) => each.root),
	};
}

beforeAll(() => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-repo-registry-")));
	registry = join(scratch, "repos.json");
	process.env["ARCHBOARD_REPOS"] = registry;
	main = repository(join(scratch, "orders"));
	clone = repository(join(scratch, "orders-clone"));
	worktree = addWorktree(main, "orders-feature");
});

beforeEach(() => {
	rmSync(registry, { force: true });
});

afterAll(() => {
	if (caller === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller;
	rmSync(scratch, { recursive: true, force: true });
});

test("the first known checkout of an identity is chosen, and adding another never changes the choice", async () => {
	await declareDirectory(clone);
	await declareDirectory(main);
	expect(orders().chosen).toEqual([clone]);
	expect(chosenRoot(IDENTITY)).toBe(clone);
	expect(chosenCheckouts().map((each) => each.root)).toEqual([clone]);
	// Registering the chosen checkout again keeps it chosen.
	await declareDirectory(clone);
	expect(orders().chosen).toEqual([clone]);
});

test("use chooses a checkout, registers it when it is unknown, and says which it replaced", async () => {
	await declareDirectory(main);
	const used = await declareDirectory(clone, { choose: true });
	expect(used).toMatchObject({ kind: "checkout", added: true, replaced: { root: main } });
	expect(orders().chosen).toEqual([clone]);
	expect(chosenRoot(IDENTITY)).toBe(clone);
	// Choosing the chosen checkout replaces nothing.
	const again = await declareDirectory(clone, { choose: true });
	expect(again).not.toHaveProperty("replaced");
});

test("the worktrees that git lists for a known checkout are known, and a deleted one is not", async () => {
	const gone = addWorktree(main, "orders-gone");
	rmSync(gone, { recursive: true });
	const declared = await declareDirectory(main);
	expect(declared).toMatchObject({ kind: "checkout" });
	expect(orders().roots).toEqual([main, worktree].toSorted());
	expect(orders().chosen).toEqual([main]);
	// Asking from a worktree finds the main checkout as well.
	rmSync(registry);
	await declareDirectory(worktree);
	expect(orders().roots).toEqual([main, worktree].toSorted());
	expect(orders().chosen).toEqual([worktree]);
});

test("a larger worktree family is registered completely without replacing the chosen checkout", async () => {
	const family = repository(join(scratch, "larger-family"));
	const linked = Array.from({ length: 12 }, (_, index) => addWorktree(family, `family-${index}`));
	await declareDirectory(clone);
	await declareDirectory(family);
	expect(orders().roots).toEqual([clone, family, ...linked].toSorted());
	expect(orders().chosen).toEqual([clone]);
});

test("a repository with no remote is named by its main checkout, and so is every worktree of it", async () => {
	const local = join(scratch, "local");
	mkdirSync(local);
	git(local, "init", "-q", "-b", "main");
	git(local, "commit", "-q", "--allow-empty", "-m", "init");
	const side = addWorktree(local, "local-side");
	// Asked from the main checkout the worktree becomes known under the one identity.
	const declared = await declareDirectory(local);
	expect(declared).toMatchObject({ kind: "checkout", worktrees: [{ root: side, repo: "local" }] });
	expect(listRegistry().checkouts.map((each) => each.repo)).toEqual(["local", "local"]);
	// Asked from the worktree, the main checkout becomes known too, and choosing moves the choice.
	rmSync(registry);
	await declareDirectory(side);
	const chosen = await declareDirectory(side, { choose: true });
	expect(chosen).toMatchObject({ checkout: { repo: "local", root: side, chosen: true } });
	expect(listRegistry().checkouts.filter((each) => each.chosen)).toHaveLength(1);
	expect(chosenRoot("local")).toBe(side);
	expect(listRegistry().checkouts.map((each) => each.root)).toContain(realpathSync.native(local));
});

test("a worktree of a bare repository is named by the bare directory without its .git suffix", async () => {
	const bare = join(scratch, "shop.git");
	mkdirSync(bare);
	git(bare, "init", "-q", "--bare", "-b", "main");
	const seed = repository(join(scratch, "shop-seed"));
	git(seed, "remote", "remove", "origin");
	git(seed, "push", "-q", bare, "main");
	git(bare, "worktree", "add", "-q", join(scratch, "shop-main"), "main");
	const declared = await declareDirectory(join(scratch, "shop-main"));
	expect(declared).toMatchObject({ kind: "checkout", checkout: { repo: "shop" } });
});

test("every checkout of a repository whose git directory lives elsewhere is named by that directory", async () => {
	const work = join(scratch, "sepwork");
	git(scratch, "init", "-q", "-b", "main", "--separate-git-dir", join(scratch, "sep.git"), work);
	git(work, "commit", "-q", "--allow-empty", "-m", "init");
	const side = addWorktree(work, "sepwork-side");
	const declared = await declareDirectory(work);
	expect(declared).toMatchObject({
		kind: "checkout",
		checkout: { repo: "sep" },
		worktrees: [{ root: side, repo: "sep" }],
	});
});

test("a worktree registered under its own directory name becomes known under its main checkout's identity", async () => {
	const ledger = join(scratch, "ledger");
	mkdirSync(ledger);
	git(ledger, "init", "-q", "-b", "main");
	git(ledger, "commit", "-q", "--allow-empty", "-m", "init");
	const side = addWorktree(ledger, "ledger-side");
	const stale = { repo: "ledger-side", root: side, source: "declared", addedAt: "t", chosen: true };
	writeFileSync(registry, JSON.stringify([stale]));
	const declared = await declareDirectory(ledger);
	expect(declared).toMatchObject({ worktrees: [{ root: side, repo: "ledger" }] });
	expect(listRegistry().checkouts.map((each) => [each.repo, each.chosen])).toEqual([
		["ledger", true],
		["ledger", false],
	]);
});

test("a directory inside a checkout registers the checkout", async () => {
	mkdirSync(join(main, "src"), { recursive: true });
	await declareDirectory(join(main, "src"));
	expect(orders().roots).toContain(main);
});

test("an untracked vault is registered under its base name, made unique on this machine", async () => {
	const first = join(scratch, "one", "plans");
	const second = join(scratch, "two", "plans");
	for (const holder of [first, second])
		mkdirSync(join(holder, ".archboard", "vault"), { recursive: true });
	const a = await declareDirectory(first);
	const b = await declareDirectory(second);
	expect(a).toMatchObject({ kind: "vault", added: true, vault: { name: "plans", root: first } });
	expect(b).toMatchObject({ kind: "vault", vault: { name: "plans-2", root: second } });
	// The same directory again keeps its name; a directory below it names the vault it sits in.
	mkdirSync(join(second, "notes"));
	expect(await declareDirectory(join(second, "notes"))).toMatchObject({
		added: false,
		vault: { name: "plans-2" },
	});
	expect(listRegistry().vaults.map((each) => [each.name, each.exists])).toEqual([
		["plans", true],
		["plans-2", true],
	]);
	expect(listRegistry().checkouts).toEqual([]);
});

test.each([
	["a directory that does not exist", () => join(scratch, "nowhere"), false],
	["a directory with no checkout and no vault", () => scratch, false],
	[
		"an untracked vault, which has no identity to choose",
		() => join(scratch, "one", "plans"),
		true,
	],
])("%s is refused and registers nothing", async (_, target, choose) => {
	mkdirSync(join(scratch, "one", "plans", ".archboard", "vault"), { recursive: true });
	await expect(declareDirectory(target(), { choose })).rejects.toBeInstanceOf(RepoRegistryError);
	expect(listRegistry()).toMatchObject({ checkouts: [], vaults: [] });
});

test("forgetting the chosen checkout leaves its identity with none chosen until use", async () => {
	await declareDirectory(main);
	const forgotten = await forgetDirectory(main);
	expect(forgotten).toMatchObject({ kind: "checkout", unchosen: true, others: [worktree] });
	expect(chosenCheckouts()).toEqual([]);
	expect(chosenRoot(IDENTITY)).toBeUndefined();
	expect(listRegistry().unchosen).toEqual([IDENTITY]);
	// Adding a checkout does not choose it, because the identity still has a known one.
	await declareDirectory(clone);
	expect(orders().chosen).toEqual([]);
	await declareDirectory(clone, { choose: true });
	expect(orders().chosen).toEqual([clone]);
	expect(listRegistry().unchosen).toEqual([]);
});

test("forgetting the only checkout of an identity leaves nothing unchosen, and the next one is chosen", async () => {
	await declareDirectory(clone);
	const forgotten = await forgetDirectory(clone);
	expect(forgotten).toMatchObject({ kind: "checkout", unchosen: false });
	expect(listRegistry().unchosen).toEqual([]);
	await declareDirectory(main);
	expect(orders().chosen).toEqual([main]);
});

test("a directory that is gone is listed as gone and forgotten by its path", async () => {
	const doomed = addWorktree(main, "orders-doomed");
	await declareDirectory(doomed);
	rmSync(doomed, { recursive: true });
	expect(listRegistry().checkouts.find((each) => each.root === doomed)).toMatchObject({
		exists: false,
	});
	expect(await forgetDirectory(doomed)).toMatchObject({ kind: "checkout" });
	expect(listRegistry().checkouts.some((each) => each.root === doomed)).toBe(false);
	expect(await forgetDirectory(doomed)).toBeUndefined();
});

test("forgetting an untracked vault removes it, from the directory below it that add accepts too, and a directory nobody registered changes nothing", async () => {
	const holder = join(scratch, "three", "plans");
	mkdirSync(join(holder, ".archboard", "vault"), { recursive: true });
	mkdirSync(join(holder, "notes"), { recursive: true });
	await declareDirectory(holder);
	expect(await forgetDirectory(join(scratch, "three"))).toBeUndefined();
	expect(await forgetDirectory(holder)).toMatchObject({ kind: "vault", vault: { name: "plans" } });
	expect(listRegistry().vaults).toEqual([]);
	await declareDirectory(join(holder, "notes"));
	expect(await forgetDirectory(join(holder, "notes"))).toMatchObject({
		kind: "vault",
		vault: { root: holder },
	});
	expect(listRegistry().vaults).toEqual([]);
});

test("language servers belong to a checkout: another checkout of the identity does not share them, and forgetting drops them", async () => {
	await declareDirectory(main);
	await declareDirectory(clone);
	const server = { command: "clangd", args: [] };
	expect(setLanguageServer(clone, "c", server)?.servers).toEqual({ c: server });
	const entries = listRegistry().checkouts;
	expect(entries.find((each) => each.root === clone)?.servers).toEqual({ c: server });
	expect(entries.find((each) => each.root === main)?.servers).toBeUndefined();
	expect(setLanguageServer(join(scratch, "unknown"), "c", server)).toBeUndefined();
	await forgetDirectory(clone);
	await declareDirectory(clone);
	expect(listRegistry().checkouts.find((each) => each.root === clone)?.servers).toBeUndefined();
});

test("a registry from before checkouts could be chosen reads with every entry chosen, and a read writes nothing", async () => {
	const stored = [
		{ repo: IDENTITY, root: main, source: "observed", addedAt: "2026-10-01" },
		{ repo: "github.com/test/billing", root: clone, source: "declared", addedAt: "2026-10-02" },
	];
	for (const shape of [stored, { repos: stored }]) {
		writeFileSync(registry, JSON.stringify(shape));
		const before = readFileSync(registry, "utf8");
		expect(chosenCheckouts().map((each) => [each.repo, each.root, each.source])).toEqual([
			["github.com/test/billing", clone, "declared"],
			[IDENTITY, main, "observed"],
		]);
		expect(listRegistry().unchosen).toEqual([]);
		expect(readFileSync(registry, "utf8")).toBe(before);
	}
});

test("two chosen checkouts of one identity in a file read as one chosen", () => {
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: IDENTITY, root: main, source: "declared", addedAt: "t", chosen: true },
			{ repo: IDENTITY, root: clone, source: "declared", addedAt: "t", chosen: true },
		]),
	);
	expect(orders().chosen).toEqual([main]);
});

test("a vault that is a symbolic link is named by the checkout whose .archboard/vault leads to it", async () => {
	// A command names the vault by its real path, and the server lists it by the
	// real path too, so `semantic record` must find its repository by that path.
	const elsewhere = join(scratch, "linked-vault");
	mkdirSync(elsewhere);
	mkdirSync(join(clone, ".archboard"), { recursive: true });
	symlinkSync(elsewhere, join(clone, ".archboard", "vault"));
	try {
		await declareDirectory(clone);
		expect(repositoryOfVault(realpathSync.native(elsewhere))).toEqual({
			name: IDENTITY,
			root: clone,
			chosen: true,
		});
	} finally {
		rmSync(join(clone, ".archboard"), { recursive: true, force: true });
	}
});

test("an untracked vault registered through a link is known by its real path, and is not registered again", async () => {
	const real = join(scratch, "real-plans");
	mkdirSync(join(real, ".archboard", "vault"), { recursive: true });
	const linked = join(scratch, "linked-plans");
	symlinkSync(real, linked);
	// An entry from before the registry stored real paths names the holder through the link.
	writeFileSync(registry, JSON.stringify([{ name: "plans", root: linked, addedAt: "2026-10-01" }]));
	expect(await declareIfUnknown(realpathSync.native(real))).toBeUndefined();
	expect(listRegistry().vaults.map((each) => each.name)).toEqual(["plans"]);
});
