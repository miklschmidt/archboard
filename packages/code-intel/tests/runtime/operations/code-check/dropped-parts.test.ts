// A draft that lacks a bound part the variant before it holds, while the code
// the draft describes still holds that part, is INHERITED_PART_DROPPED
// (TASK-488). The code a draft describes is the ref its bindings name, read
// from Git without checking it out, or the checkout's files when it names
// none; a draft whose ref cannot be read is skipped with the reason.
//
// The checkout `shop` has `main` out, with `src/refunds.ts`. Branch `feat/a`
// deletes `src/refunds.ts`, and `feat/b`, built on it, deletes `src/api.ts`.
// So a pass that read the files on disk where a draft names a ref would
// report Refunds, and one that read `feat/a` where a draft names `feat/b` too
// would report Audit.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import {
	board as fixtureBoard,
	git as fixtureGit,
	register,
	write,
} from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-dropped-parts-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let check: typeof CheckModule;
/** The order of the last part made, so every part has its own. */
let order = 0;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * A part bound to code, in the shop unless the binding names another repository.
 * @param id Its id.
 * @param name Its name.
 * @param binding Its path, and its symbol, ref and repository if any.
 * @returns The node.
 */
function part(id: string, name: string, binding: Record<string, string>) {
	order += 1000;
	return { id, name, kind: "module", order, binding: { repo: SHOP, ...binding } };
}

/**
 * A draft branched from another variant.
 * @param id Its id.
 * @param parent The variant it was branched from.
 * @param nodes Its parts.
 * @returns The variant.
 */
function draft(id: string, parent: string | undefined, nodes: readonly object[]) {
	const from = parent === undefined ? {} : { parent };
	return { id, name: `draft ${id}`, lifecycle: "draft" as const, ...from, content: { nodes } };
}

const base = [
	part("pL", "Ledger", { path: "src/ledger.ts", symbol: "Ledger.post" }),
	part("pA", "Api", { path: "src/api.ts" }),
	part("pR", "Refunds", { path: "src/refunds.ts" }),
	part("pS", "Settle", { path: "src", symbol: "settle" }),
	// The default repository is overridden by a repository this machine has not registered.
	part("pX", "Stranger", { repo: "github.com/test/stranger", path: "x.ts" }),
];
const onA = part("pN", "Audit", { path: "src/api.ts", branch: "feat/a" });
const keeper = part("pK", "Keeper", { path: "src/ledger.ts", branch: "feat/a" });
const extra = part("pE", "Extra", { path: "src/ledger.ts", symbol: "Ledger", branch: "feat/a" });

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/ledger.ts": "export class Ledger {\n\tpost(): void {}\n}\n",
		"src/api.ts": "export const api = 1;\n",
		"src/refunds.ts": "export const refund = 1;\n",
	});
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	git("checkout", "-q", "-b", "feat/a");
	git("rm", "-q", "src/refunds.ts");
	git("commit", "-q", "--no-gpg-sign", "-m", "remove refunds");
	git("checkout", "-q", "-b", "feat/b");
	git("rm", "-q", "src/api.ts");
	git("commit", "-q", "--no-gpg-sign", "-m", "remove the api");
	git("checkout", "-q", "main");
	register(scratch, { [SHOP]: shop });
	// v2 keeps Keeper and drops Audit and Extra from v1.
	fixtureBoard(vault, "Shop", [
		{ id: "v0", name: "Built", lifecycle: "current", content: { nodes: base } },
		draft("v1", "v0", [onA, keeper, extra]),
		draft("v2", "v1", [keeper, part("pB", "Bookkeeping", { path: "src", branch: "feat/b" })]),
		draft("v3", "v0", [part("pM", "Missing", { path: "src", branch: "feat/missing" })]),
		draft("v4", "v0", [
			part("pP", "One", { path: "src", branch: "feat/a" }),
			part("pQ", "Two", { path: "src", branch: "feat/b" }),
		]),
		draft("v5", "v0", []),
		draft("v6", undefined, []),
		{ id: "v7", name: "Shelved", lifecycle: "shelved", parent: "v0", content: { nodes: [] } },
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Read every draft of the vault and run the pass.
 * @returns The drafts read and the outcome.
 */
async function everyDraft() {
	const read = check.readEveryDraftToCheck(vault);
	const outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
	return { read, outcome };
}

test("every draft of a board is read, and no current, shelved or historical variant", async () => {
	const { read } = await everyDraft();
	expect(read.boards.map((one) => [one.variant.id, one.named])).toEqual([
		["v1", true],
		["v2", true],
		["v3", true],
		["v4", true],
		["v5", true],
		["v6", true],
	]);
});

test("a dropped part whose bound path and symbol the draft's ref still holds is reported with its evidence", async () => {
	const { outcome } = await everyDraft();
	const dropped = outcome.findings.filter((one) => one.code === "INHERITED_PART_DROPPED");
	expect(dropped.map((one) => [one.variant, one.subject?.id, one.dropped?.ref])).toEqual([
		// v1 names feat/a, which still holds the ledger and the api, and no longer refunds.
		["v1", "pL", "feat/a"],
		["v1", "pA", "feat/a"],
		// v2 names feat/a and feat/b; feat/b is its own, and it no longer holds the api.
		["v2", "pE", "feat/b"],
		// v5 names no ref, so the files on disk are read, and they hold refunds.
		["v5", "pL", undefined],
		["v5", "pA", undefined],
		["v5", "pR", undefined],
	]);
	const ledger = dropped[0];
	expect(ledger?.severity).toBe("warning");
	expect(ledger?.board).toBe("Shop");
	expect(ledger?.subject).toEqual({ kind: "node", id: "pL", name: "Ledger" });
	expect(ledger?.dropped).toEqual({
		from: "v0",
		repo: SHOP,
		ref: "feat/a",
		commit: expect.stringMatching(/^[0-9a-f]{40}$/u),
		path: "src/ledger.ts",
		symbol: "Ledger.post",
		file: "src/ledger.ts",
		line: 2,
	});
});

test("a part whose bound code is gone, or whose symbol is not defined, is not reported", async () => {
	const { outcome } = await everyDraft();
	const reported = new Set(outcome.findings.map((one) => `${one.variant} ${one.subject?.id}`));
	// Refunds is gone at feat/a, though the files on disk still hold it.
	expect(reported.has("v1 pR")).toBe(false);
	// No file below src defines settle.
	expect(reported.has("v1 pS")).toBe(false);
	// Audit's file is gone at feat/b, the ref v2 is read against.
	expect(reported.has("v2 pN")).toBe(false);
});

test("a draft whose ref the checkout lacks, or that names several refs, is skipped with the reason", async () => {
	const { outcome } = await everyDraft();
	const drafts = outcome.skipped.filter(
		(one) => one.variant !== undefined && one.subject === undefined,
	);
	expect(drafts.map((one) => [one.reason, one.variant, one.repo, one.detail])).toEqual([
		["repository-unregistered", "v1", "github.com/test/stranger", undefined],
		["draft-ref-missing", "v3", SHOP, "feat/missing"],
		["repository-unregistered", "v3", "github.com/test/stranger", undefined],
		["draft-refs-ambiguous", "v4", SHOP, "feat/a, feat/b"],
		["repository-unregistered", "v4", "github.com/test/stranger", undefined],
		["repository-unregistered", "v5", "github.com/test/stranger", undefined],
	]);
	expect(outcome.findings.some((one) => one.variant === "v3" || one.variant === "v4")).toBe(false);
});

test("a draft named with --variant is held to what it dropped too", async () => {
	const read = check.readBoardsToCheck(vault, "draft v1");
	if (!read.ok) throw new Error("no draft v1");
	const outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
	expect(
		outcome.findings
			.filter((one) => one.code === "INHERITED_PART_DROPPED")
			.map((one) => one.subject?.id),
	).toEqual(["pL", "pA"]);
});
