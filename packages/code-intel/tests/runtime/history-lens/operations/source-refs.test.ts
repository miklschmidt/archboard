// The refs a branch footprint can be read between (ADR 0045), listed through the lens's public
// operation over a canonical vault and repositories this owner builds for itself, with its own
// checkout registry through ARCHBOARD_REPOS so nothing reads the machine's real one.
//
// The vault is in `shop`, which a second module binds beside `other`. A third module binds a
// repository that no checkout is registered for. The answer merges the branches of `shop` and
// `other` by name, names the repositories that hold each, says why `stranger` was not read, and
// names the default base and the standing of the vault's checkout.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as ApiModule from "#runtime/api/history-lens.ts";
import { ArchitectureHistoryResultSchema } from "#shared/protocol/canonical-history.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-source-refs-"));
const shop = join(scratch, "shop");
const other = join(scratch, "other");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const OTHER = "github.com/test/other";
const STRANGER = "github.com/test/stranger";
let api: typeof ApiModule;
let head = "";

/**
 * Run Git in a test repository.
 * @param cwd The repository.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(cwd: string, ...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

/**
 * Make a repository with one commit that identifies as a repository identity.
 * @param root Where.
 * @param identity The identity its origin gives it.
 * @returns Its commit.
 */
function repository(root: string, identity: string): string {
	mkdirSync(root, { recursive: true });
	git(root, "init", "-q", "-b", "main");
	git(root, "remote", "add", "origin", `https://${identity}.git`);
	writeFileSync(join(root, "a.ts"), "1\n");
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-gpg-sign", "-m", "first");
	return git(root, "rev-parse", "HEAD");
}

/**
 * A module of the model, bound into a repository.
 * @param name Its name.
 * @param repo The repository it binds.
 */
function module(name: string, repo: string): void {
	writeFileSync(
		join(vault, `${name}.module.json`),
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${name}`,
			name,
			kind: "module",
			order: 0,
			binding: { repo, path: "a.ts" },
			outgoing: [],
		}),
	);
}

/**
 * The listing of the current state, parsed as the browser parses it.
 * @param range A base and a head to find the merge base of.
 * @returns The answer.
 */
async function listing(range: { base?: string; head?: string } = {}) {
	const answer = ArchitectureHistoryResultSchema.parse(
		await api.readArchitectureHistory(vault, { analysis: "refs", ...range }),
	);
	if (!answer.success || answer.analysis !== "refs") throw new Error(JSON.stringify(answer));
	return answer;
}

beforeAll(async () => {
	head = repository(shop, SHOP);
	repository(other, OTHER);
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify(
			[
				[SHOP, shop],
				[OTHER, other],
			].map(([repo, root]) => ({
				repo,
				root,
				source: "declared",
				addedAt: "2026-10-06T00:00:00.000Z",
			})),
		),
	);
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Current", name: "Built" },
		}),
	);
	module("Checkout", SHOP);
	module("Ledger", OTHER);
	module("Stranger", STRANGER);
	git(shop, "branch", "feat/x");
	git(shop, "branch", "zeta");
	git(other, "branch", "feat/x");
	git(other, "branch", "feat/y");
	git(shop, "tag", "v1");
	git(other, "tag", "v2");
	git(shop, "update-ref", "refs/remotes/origin/main", head);
	git(shop, "update-ref", "refs/remotes/origin/feat/x", head);
	git(shop, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
	git(other, "update-ref", "refs/remotes/origin/main", git(other, "rev-parse", "HEAD"));
	api = await import("#runtime/api/history-lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("branches merge by name across repositories, local first, with who holds each and no tags", async () => {
	const answer = await listing();
	expect(answer.refs).toEqual([
		{ name: "feat/x", kind: "local", repos: [OTHER, SHOP] },
		{ name: "feat/y", kind: "local", repos: [OTHER] },
		{ name: "main", kind: "local", repos: [OTHER, SHOP] },
		{ name: "zeta", kind: "local", repos: [SHOP] },
		{ name: "origin/feat/x", kind: "remote", repos: [SHOP] },
		{ name: "origin/main", kind: "remote", repos: [OTHER, SHOP] },
	]);
	expect(answer.repositories).toEqual([
		{ status: "read", repo: OTHER },
		{ status: "read", repo: SHOP },
		{
			status: "unread",
			repo: STRANGER,
			reason: "repository-unregistered",
			detail: expect.any(String),
		},
	]);
});

test("a base and a head name the merge base in the vault's repository, and null when it cannot", async () => {
	// `ahead` is a commit on top of main that no checkout has out; `unrelated` shares no history.
	const tree = git(shop, "rev-parse", "HEAD^{tree}");
	const ahead = git(shop, "commit-tree", tree, "-p", head, "-m", "ahead");
	git(shop, "update-ref", "refs/heads/ahead", ahead);
	git(shop, "update-ref", "refs/heads/unrelated", git(shop, "commit-tree", tree, "-m", "orphan"));
	const full = { mergeBase: head, head: ahead };
	expect((await listing({ base: "main", head: "ahead" })).range).toEqual(full);
	expect((await listing({ base: "origin/main", head: ahead })).range).toEqual(full);
	expect((await listing({ base: "ahead", head: "main" })).range).toEqual({
		mergeBase: head,
		head,
	});
	expect((await listing({ base: "main", head: "no-such-branch" })).range).toBeNull();
	expect((await listing({ base: "no-such-branch", head: "ahead" })).range).toBeNull();
	expect((await listing({ base: "main", head: "unrelated" })).range).toBeNull();
	// One of the two, or none, names no range.
	expect("range" in (await listing({ base: "main" }))).toBe(false);
	expect("range" in (await listing())).toBe(false);
});

test("the default base is where origin/HEAD points, else main, and the vault checkout's branch is named", async () => {
	expect((await listing()).vault).toEqual({
		repo: SHOP,
		defaultBase: "origin/main",
		branch: "main",
		commit: head,
	});
	git(shop, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
	expect((await listing()).vault?.defaultBase).toBe("main");
	git(shop, "branch", "-m", "main", "trunk");
	expect((await listing()).vault).toMatchObject({ defaultBase: null, branch: "trunk" });
});

test("a detached HEAD names its commit instead of a branch", async () => {
	git(shop, "checkout", "-q", "--detach");
	expect((await listing()).vault).toMatchObject({ branch: null, commit: head });
});
