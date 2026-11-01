// A binding or an anchor that names a branch its checkout does not have out is
// held to that branch's code, read from Git without a checkout (TASK-493).
//
// The checkout `shop` has `main` out. Branch `feat/x` renames `Ledger.post` to
// `Ledger.settle`, adds `src/new.ts` and deletes `src/old.ts`. So a pass that
// read the files on disk where a part names `feat/x` would find `post` and
// `old.ts` and miss `created`, and one that skipped the part would say
// nothing at all.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import {
	board as fixtureBoard,
	git as fixtureGit,
	register,
	write,
} from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-ref-code-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let check: typeof CheckModule;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * A part bound to code in the shop.
 * @param id Its id.
 * @param order Its order.
 * @param binding Its path, and its symbol and ref if any.
 * @returns The node.
 */
function part(id: string, order: number, binding: { path: string } & Record<string, string>) {
	return { id, name: id, kind: "module", order, binding: { repo: SHOP, ...binding } };
}

/**
 * A relationship, with an anchor when the file and symbol are given.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @param anchor The anchored file and symbol.
 * @returns The edge.
 */
function edge(id: string, from: string, to: string, anchor?: [string, string]) {
	const cited =
		anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } };
	return {
		id,
		order: Number(id.slice(1)) * 1000,
		from,
		to,
		kind: "call",
		emphasis: "normal" as const,
		...cited,
	};
}

/**
 * The commit the shop has out.
 * @returns Its full id.
 */
function headCommit(): string {
	return Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: shop }).stdout.toString().trim();
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/ledger.ts": "export class Ledger {\n\tpost(): void {}\n}\n",
		"src/api.ts": "export const api = 1;\n",
		"src/old.ts": "export const old = 1;\n",
	});
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "main");
	git("checkout", "-q", "-b", "feat/x");
	write(shop, {
		"src/ledger.ts": "export class Ledger {\n\tsettle(): void {}\n}\n",
		"src/new.ts": "export function created(): void {}\n",
		"src/api.ts":
			'import { Ledger } from "./ledger";\nexport const used = new Ledger();\nused.settle();\n',
	});
	git("rm", "-q", "src/old.ts");
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "feat/x");
	git("checkout", "-q", "main");
	register(scratch, { [SHOP]: shop });
	fixtureBoard(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pNew", 1000, { path: "src/new.ts", symbol: "created", branch: "feat/x" }),
					// `post` is on main and gone on feat/x.
					part("pPost", 2000, { path: "src/ledger.ts", symbol: "post", branch: "feat/x" }),
					part("pSettle", 3000, { path: "src/ledger.ts", symbol: "settle", branch: "feat/x" }),
					part("pApi", 4000, { path: "src/api.ts" }),
					part("pGone", 5000, { path: "src/api.ts", branch: "feat/gone" }),
				],
				edges: [
					edge("e1", "pNew", "pSettle", ["src/new.ts", "created"]),
					edge("e2", "pNew", "pSettle", ["src/ledger.ts", "post"]),
					edge("e3", "pNew", "pSettle", ["src/api.ts", "settle"]),
					edge("e4", "pApi", "pNew"),
					edge("e5", "pNew", "pSettle"),
					edge("e6", "pGone", "pNew", ["src/api.ts", "x"]),
				],
			},
		},
		{
			id: "v2",
			name: "TASK-1",
			lifecycle: "draft",
			content: {
				nodes: [
					part("pFresh", 1000, { path: "src/new.ts", branch: "feat/x" }),
					// `src/old.ts` is on main and gone on feat/x.
					part("pOld", 2000, { path: "src/old.ts", branch: "feat/x" }),
				],
			},
		},
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Read the vault and run the pass.
 * @param variant The draft to read, if any.
 * @returns The outcome.
 */
async function pass(variant?: string): Promise<CodeCheckOutcome> {
	const read = check.readBoardsToCheck(vault, variant);
	if (!read.ok) throw new Error(`no draft ${variant}`);
	return check.checkCode(vault, read.boards, new AbortController().signal);
}

/**
 * Each finding as its code and the id of its subject.
 * @param outcome The pass's outcome.
 * @returns The pairs.
 */
function found(outcome: CodeCheckOutcome): string[] {
	return outcome.findings
		.filter((finding) => finding.severity === "warning")
		.map((finding) => `${finding.code} ${finding.subject?.id}`);
}

test("a broken binding and anchor on a branch that is not checked out are reported, and a sound one is not", async () => {
	const outcome = await pass();
	// `post` is on main, so a pass that read the files on disk would report neither.
	expect(found(outcome).toSorted()).toEqual(
		["BINDING_SYMBOL_MISSING pPost", "ANCHOR_SYMBOL_MISSING e2"].toSorted(),
	);
});

test("a ref the checkout cannot resolve is skipped and names the ref, and no other ref is", async () => {
	const outcome = await pass();
	const refs = outcome.skipped.filter((skip) => skip.reason === "ref-not-checked-out");
	expect(refs.map((skip) => [skip.subject?.id, skip.ref?.named])).toEqual([
		["pGone", "feat/gone"],
		["e6", "feat/gone"],
	]);
});

test("a language server is not run on a ref read from Git, and the pass says so once", async () => {
	const outcome = await pass();
	const skips = outcome.skipped.filter((skip) => skip.reason === "ref-without-language-server");
	expect(skips.map((skip) => [skip.repo, skip.ref?.named, skip.subject])).toEqual([
		[SHOP, "feat/x", undefined],
	]);
});

test("a relationship whose ends are read at different code is skipped, and one read at a ref is judged", async () => {
	const outcome = await pass();
	const differ = outcome.skipped.filter((skip) => skip.reason === "refs-differ");
	expect(differ.map((skip) => skip.subject?.id)).toEqual(["e4"]);
	// Both ends are read at feat/x: the relationship is judged, and no evidence joins them.
	expect(outcome.findings.map((finding) => `${finding.code} ${finding.subject?.id}`)).toContain(
		"RELATIONSHIP_UNSUPPORTED e5",
	);
});

test("a named draft reports a bound path that its branch lacks, and the checkout is left alone", async () => {
	const outcome = await pass("TASK-1");
	expect(found(outcome)).toEqual(["BINDING_PATH_MISSING pOld"]);
	const status = Bun.spawnSync(["git", "status", "--porcelain", "--branch"], { cwd: shop });
	expect(status.stdout.toString().trim()).toBe("## main");
});

test("a historical candidate reads its authoritative commit even at dirty HEAD", async () => {
	const read = check.readBoardsToCheck(vault);
	if (!read.ok || read.boards[0] === undefined) throw new Error("fixture board missing");
	const base = read.boards[0];
	const commit = headCommit();
	const variant = {
		...base.variant,
		lifecycle: "historical" as const,
		documents: [{ repo: SHOP, path: "src/old.ts", branch: "feat/x" }],
		content: {
			...base.variant.content,
			nodes: [part("pPost", 1000, { path: "src/ledger.ts", symbol: "post", branch: "feat/x" })],
			edges: [],
		},
	};
	write(shop, { "src/ledger.ts": "export class Ledger { dirty(): void {} }\n" });
	try {
		const outcome = await check.checkCandidateCode({
			vault,
			board: base.board,
			file: base.file,
			variant,
			revisions: [{ repo: SHOP, commit }],
			signal: new AbortController().signal,
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) throw new Error(outcome.problem);
		expect(outcome.findings.filter((finding) => finding.severity === "warning")).toEqual([]);
		expect(variant.lifecycle).toBe("historical");
		const anchorOnly = {
			...variant,
			documents: [],
			content: {
				...variant.content,
				nodes: [
					{ id: "pOne", name: "One", kind: "module", order: 1000 },
					{ id: "pTwo", name: "Two", kind: "module", order: 2000 },
				],
				edges: [edge("e1", "pOne", "pTwo", ["src/ledger.ts", "post"])],
			},
		};
		const anchored = await check.checkCandidateCode({
			vault,
			board: base.board,
			file: base.file,
			variant: anchorOnly,
			revisions: [{ repo: SHOP, commit }],
			signal: new AbortController().signal,
		});
		expect(anchored.ok).toBe(true);
		if (!anchored.ok) throw new Error(anchored.problem);
		expect(anchored.findings.filter((finding) => finding.code === "ANCHOR_SYMBOL_MISSING")).toEqual(
			[],
		);
	} finally {
		git("checkout", "--", "src/ledger.ts");
	}
});

test("candidate revision evidence refuses duplicates, omissions, branch names and unavailable commits", async () => {
	const read = check.readBoardsToCheck(vault);
	if (!read.ok || read.boards[0] === undefined) throw new Error("fixture board missing");
	const base = read.boards[0];
	const commit = headCommit();
	const revision = { repo: SHOP, commit };
	const refused = [
		[],
		[revision, revision],
		[{ repo: SHOP, commit: "main" }],
		[{ repo: SHOP, commit: "0".repeat(40) }],
	];
	for (const revisions of refused) {
		const outcome = await check.checkCandidateCode({
			vault,
			...base,
			revisions,
			signal: new AbortController().signal,
		});
		expect(outcome.ok).toBe(false);
	}
});

test("historical suggestions use HEAD ancestry and report missing timestamp history", async () => {
	const read = check.readBoardsToCheck(vault);
	if (!read.ok || read.boards[0] === undefined) throw new Error("fixture board missing");
	const variant = read.boards[0].variant;
	const commit = headCommit();
	const signal = new AbortController().signal;
	expect(
		await check.suggestHistoricalCommits(vault, variant, "2030-01-01T00:00:00Z", signal),
	).toEqual([{ repo: SHOP, commit }]);
	const missing = await check.suggestHistoricalCommits(
		vault,
		variant,
		"1970-01-01T00:00:00Z",
		signal,
	);
	expect(missing.map((one) => one.commit)).toEqual([null]);
});
