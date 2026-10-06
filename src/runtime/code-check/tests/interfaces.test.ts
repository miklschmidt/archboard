// The code pass holds each container's interface (ADR 0044) against what the
// module it binds exposes (ADR 0046, TASK-368.10).
//
// The checkout `shop` holds a store module whose `index.ts` exposes Read,
// Write, Audit and Util but not Cache or Hook; a server that calls Read and
// Write through the index and Cache past it; a file of the store drawn outside
// it that calls Hook; a report no part binds that calls Audit and names Util's
// type; a system test that calls an exposed helper nothing else uses; and a
// file of tests beside the index.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "@/runtime/code-check/index";
import type { CodeCheckOutcome } from "@/runtime/code-check/index";
import { board, git, register, write } from "@/runtime/code-check/tests/fixture";
import { ownServers } from "@/runtime/code-check/tests/servers";

const caller = {
	ARCHBOARD_VAULT: process.env["ARCHBOARD_VAULT"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-interfaces-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_VAULT"] = vault;
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;
let order = 0;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param path Its bound path.
 * @param parent The part that holds it, if any.
 * @returns The node.
 */
function part(id: string, path: string, parent?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: (order += 10),
		binding: { repo: SHOP, path },
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * A call from one part to another.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @returns The relationship.
 */
function call(id: string, from: string, to: string) {
	return { id, order: Number(id.slice(1)) * 10, from, to, kind: "call" };
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/store/index.ts": [
			'export { readShelf } from "./lib/read";',
			'export { writeShelf } from "./lib/write";',
			'export { auditShelf } from "./lib/audit";',
			'export { unusedHelper, type ShelfType } from "./lib/util";',
			"",
		].join("\n"),
		"src/store/lib/read.ts":
			'import { cached } from "./cache";\nexport function readShelf(): string { return cached(); }\n',
		"src/store/lib/cache.ts": 'export function cached(): string { return "x"; }\n',
		"src/store/lib/write.ts": "export function writeShelf(): void {}\n",
		"src/store/lib/audit.ts": "export function auditShelf(): void {}\n",
		"src/store/lib/hook.ts": "export function hook(): void {}\n",
		"src/store/lib/inner.ts":
			'import { hook } from "./hook";\nexport function inner(): void { hook(); }\n',
		"src/store/lib/util.ts":
			"export function unusedHelper(): void {}\nexport interface ShelfType { name: string }\n",
		// A file of tests at the store's root, which is no root file.
		"src/store/index.test.ts": "export function shelfFixture(): void {}\n",
		"src/server/routes.ts": [
			'import { readShelf, writeShelf } from "../store";',
			'import { cached } from "../store/lib/cache";',
			"export function route(): string { writeShelf(); return readShelf() + cached(); }",
			"",
		].join("\n"),
		"src/report/report.ts": [
			'import { auditShelf, type ShelfType } from "../store";',
			"export function report(shelf: ShelfType): string { auditShelf(); return shelf.name; }",
			"",
		].join("\n"),
		"tests/system/store.test.ts":
			'import { unusedHelper } from "../../src/store";\nunusedHelper();\n',
		"docs/guide.md": "# Guide\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Server", "src/server"),
					part("Store", "src/store"),
					part("Read", "src/store/lib/read.ts", "Store"),
					part("Cache", "src/store/lib/cache.ts", "Store"),
					part("Write", "src/store/lib/write.ts", "Store"),
					part("Audit", "src/store/lib/audit.ts", "Store"),
					part("Util", "src/store/lib/util.ts", "Store"),
					part("Hook", "src/store/lib/hook.ts", "Store"),
					// Code of the store, drawn outside it.
					part("Inner", "src/store/lib/inner.ts"),
				],
				edges: [
					call("e1", "Server", "Read"),
					// The server reaches past the index to the cache, which the store does not expose.
					call("e2", "Server", "Cache"),
					call("e3", "Read", "Cache"),
					// Hook's callers: the server, whose code shows no use, and code inside the module.
					call("e4", "Server", "Hook"),
					call("e5", "Inner", "Hook"),
				],
				flows: [],
			},
		},
	]);
	// The store bound through its index, drawn with no caller: the board says nothing about its interface.
	board(vault, "Store alone", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Store", "src/store/index.ts"),
					part("Read", "src/store/lib/read.ts", "Store"),
					part("Audit", "src/store/lib/audit.ts", "Store"),
				],
				edges: [],
				flows: [],
			},
		},
	]);
	// A directory no language the check reads has a root file in.
	board(vault, "Docs", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [part("Manual", "docs"), part("Guide", "docs/guide.md", "Manual")],
				edges: [],
				flows: [],
			},
		},
	]);
	const check: typeof CheckModule = await import("@/runtime/code-check/index");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(read.boards, new AbortController().signal, ownServers());
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The findings of one code on one board.
 * @param code The finding's code.
 * @param boardName The board.
 * @returns Each finding.
 */
function findings(code: string, boardName: string) {
	return outcome.findings.filter((each) => each.code === code && each.board === boardName);
}

test("an entry point the module does not expose, which a caller's code reaches from outside the module, is a warning with that use", () => {
	const unexposed = findings("ENTRY_POINT_UNEXPOSED", "Shop");
	// Read holds what the index exposes; Hook's callers show no use from outside the module.
	expect(unexposed.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Cache", "warning"],
	]);
	expect(unexposed[0]?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "Server",
			to: "Cache",
			repo: SHOP,
			path: "src/server/routes.ts",
			line: 3,
			symbol: "cached",
		},
	]);
	expect(findings("ENTRY_POINT_UNEXPOSED", "Store alone")).toEqual([]);
});

test("a hidden part whose exposed code a file no part binds uses at run time is a caller the board does not draw", () => {
	const undrawn = findings("CALLER_UNDRAWN", "Shop");
	expect(undrawn.map((each) => [each.subject?.id, each.severity])).toEqual([["Audit", "warning"]]);
	expect(undrawn[0]?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			to: "Audit",
			repo: SHOP,
			path: "src/report/report.ts",
			line: 2,
			symbol: "auditShelf",
		},
	]);
});

test("a use by a part on the board is the undrawn relationship's to report, and a use only as a type is no caller", () => {
	// The server, a part on the board, calls Write: RELATIONSHIP_UNDRAWN says so, once.
	expect(findings("RELATIONSHIP_UNDRAWN", "Shop").map((each) => each.subject?.id)).toEqual([
		"Write",
	]);
	// The report names Util's type only.
	expect(findings("CALLER_UNDRAWN", "Shop").some((each) => each.subject?.id === "Util")).toBe(
		false,
	);
});

test("a container with no caller on its board has no caller to miss", () => {
	expect(findings("CALLER_UNDRAWN", "Store alone")).toEqual([]);
});

test("exposed names no file outside the module uses are information on the container, and a test is no caller and no root file", () => {
	for (const boardName of ["Shop", "Store alone"]) {
		const unused = findings("EXPOSED_UNUSED", boardName);
		expect(unused.map((each) => [each.subject?.id, each.severity])).toEqual([
			["Store", "information"],
		]);
		// The system test calls the helper, and the report names the type.
		expect(unused[0]?.message).toContain("unusedHelper");
		expect(unused[0]?.message).not.toContain("ShelfType");
		expect(unused[0]?.message).not.toContain("shelfFixture");
	}
});

test("a container whose module exposes nothing the check can read is listed as not judged", () => {
	const skip = outcome.skipped.find((each) => each.board === "Docs");
	expect(skip).toMatchObject({ reason: "exposure-unknown", subject: { id: "Manual" }, repo: SHOP });
	expect(outcome.findings.some((each) => each.board === "Docs")).toBe(false);
});
