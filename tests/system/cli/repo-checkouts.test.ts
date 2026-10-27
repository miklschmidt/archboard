// `repo add`, `repo use`, `repo list` and `repo forget` as the shipped bin runs
// them over temporary git checkouts, worktrees and an untracked vault, with an
// isolated registry (ADR 0049, TASK-472.02). No server is involved: the
// registry is a file.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { packageBin } from "./support/package-cli.ts";
import { createRepositoryFixture, type RepositoryFixture } from "./support/repository-fixture.ts";

const ORIGIN = "https://github.com/acme/orders.git";
const IDENTITY = "github.com/acme/orders";
let fixture: RepositoryFixture;
let main = "";
let clone = "";
let worktree = "";
let plans = "";

beforeAll(() => {
	fixture = createRepositoryFixture();
	main = fixture.repository("orders", ORIGIN);
	clone = fixture.repository("orders-clone", ORIGIN);
	const target = join(fixture.root, "orders-feature");
	execFileSync("git", ["worktree", "add", "-q", "-b", "feature", target], {
		cwd: main,
		stdio: "ignore",
	});
	worktree = realpathSync.native(target);
	const holder = join(fixture.root, "meta", "plans");
	mkdirSync(join(holder, ".archboard", "vault"), { recursive: true });
	// The registry records an untracked vault by its real path, as Git reports a checkout's.
	plans = realpathSync.native(holder);
});

afterAll(() => fixture.dispose());

/**
 * Run a `repo` command and read its JSON answer.
 * @param args The arguments after `repo`.
 * @param cwd Where it runs; the directory with no checkout when absent.
 * @param env Its environment.
 * @returns The exit status and the parsed answer.
 */
function repo(args: readonly string[], cwd?: string, env = fixture.serverEnvironment) {
	const command = [packageBin, "repo", ...args];
	const result = spawnSync(command[0]!, command.slice(1), {
		cwd: cwd ?? fixture.nowhere,
		encoding: "utf8",
		env,
	});
	const answer: unknown = result.stdout.trim() === "" ? undefined : JSON.parse(result.stdout);
	const failure = `${command.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
	return { status: result.status, answer, failure };
}

/**
 * What `repo list` reports.
 * @returns Each checkout's root with whether it is chosen, the vault names and the unchosen identities.
 */
function listed() {
	const { answer } = repo(["list"]);
	const parsed = answer as {
		repos: { repo: string; root: string; chosen: boolean; exists: boolean }[];
		vaults: { name: string; root: string; exists: boolean }[];
		unchosen: string[];
	};
	return {
		chosen: parsed.repos.filter((each) => each.chosen).map((each) => each.root),
		known: parsed.repos.map((each) => each.root).toSorted(),
		vaults: parsed.vaults.map((each) => each.name),
		unchosen: parsed.unchosen,
	};
}

test("add registers a checkout with its worktrees and chooses the first one only", () => {
	// A `git` first on the PATH writes down where each Git command runs.
	const bin = join(fixture.root, "bin");
	const ran = join(fixture.root, "git-directories.log");
	mkdirSync(bin);
	const script = `#!/bin/sh\npwd -P >> '${ran}'\nexec '${Bun.which("git")}' "$@"\n`;
	writeFileSync(join(bin, "git"), script, { mode: 0o755 });
	const first = repo(["add", main], undefined, {
		...fixture.serverEnvironment,
		PATH: `${bin}:${process.env["PATH"]}`,
	});
	expect(first.status, first.failure).toBe(0);
	// The worktrees are read from the checkout: a checkout with many never runs Git in each of them.
	const directories = readFileSync(ran, "utf8").split("\n");
	expect(directories).toContain(main);
	expect(directories).not.toContain(worktree);
	expect(first.answer).toMatchObject({
		kind: "checkout",
		repo: IDENTITY,
		root: main,
		chosen: true,
		added: true,
		worktrees: [worktree],
	});
	const second = repo(["add", clone]);
	expect(second.answer).toMatchObject({ root: clone, chosen: false, added: true });
	expect(listed()).toMatchObject({
		chosen: [main],
		known: [main, clone, worktree].toSorted(),
		unchosen: [],
	});
});

test("use chooses a known or unknown checkout, names the one it replaced and refuses what is not a checkout", () => {
	const chosen = repo(["use", clone]);
	expect(chosen.status, chosen.failure).toBe(0);
	expect(chosen.answer).toMatchObject({ root: clone, chosen: true, added: false, replaced: main });
	expect(listed().chosen).toEqual([clone]);
	// A checkout that nobody registered is registered and chosen in one command.
	const unknown = repo(["use", worktree], fixture.nowhere);
	expect(unknown.answer).toMatchObject({ root: worktree, chosen: true, replaced: clone });
	expect(listed().chosen).toEqual([worktree]);
	expect(repo(["use", fixture.nowhere]).status).toBe(2);
	expect(repo(["use", plans]).status).toBe(2);
});

test("add registers an untracked vault under its base name", () => {
	const added = repo(["add", plans]);
	expect(added.status, added.failure).toBe(0);
	expect(added.answer).toMatchObject({ kind: "vault", name: "plans", root: plans, added: true });
	expect(listed().vaults).toEqual(["plans"]);
	expect(repo(["add", fixture.nowhere]).status).toBe(2);
});

test("forgetting the chosen checkout leaves its identity with none chosen until use, and forgetting a vault removes it", () => {
	const forgotten = repo(["forget", worktree]);
	expect(forgotten.status, forgotten.failure).toBe(0);
	expect(forgotten.answer).toMatchObject({ forgotten: true, kind: "checkout", unchosen: true });
	expect(listed()).toMatchObject({ chosen: [], unchosen: [IDENTITY] });
	expect(repo(["use", main]).status).toBe(0);
	expect(listed()).toMatchObject({ chosen: [main], unchosen: [] });
	expect(repo(["forget", plans]).answer).toMatchObject({ forgotten: true, kind: "vault" });
	expect(listed().vaults).toEqual([]);
	// A directory nobody registered is not an error, and it changes nothing.
	const before = listed();
	const nothing = repo(["forget", fixture.nowhere]);
	expect(nothing.status).toBe(0);
	expect(nothing.answer).toMatchObject({ forgotten: false });
	expect(listed()).toEqual(before);
});
