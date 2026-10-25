// The code pass with clangd for C (TASK-367.15). A C use whose include leads
// only to a declaration, because the header's own source file does not define
// the name, is a candidate that only a language server can place; with a
// `compile_commands.json` the pass asks clangd, and without one it says so
// once and keeps the candidate.
//
// Two checkouts hold the same code: `shop` has a compilation database and
// `bare` has none. `ledger.c` calls `audit_check`, which `ledger.h` declares
// and `audit.c` defines, and `main.c` calls `audit_log`, which `ledger.h`
// declares and no file defines. Parts bind each source file, and one relationship,
// from the ledger to a report, is anchored at that call. clangd is this
// owner's stand-in, run as a program, which answers as clangd does once its
// index has ended.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-clangd-"));
const vault = join(scratch, "vault");
const state = join(scratch, "server");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const BARE = "github.com/test/bare";
/** This owner's stand-in for clangd, run as a program. */
const STAND_IN = join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"support",
	"code-check",
	"clangd-stand-in.ts",
);
let outcome: CodeCheckOutcome;

/** The C code both checkouts hold. */
const CODE = {
	"include/ledger.h":
		"int ledger_post(int amount);\nint audit_check(int amount);\nint audit_log(int amount);\n",
	"src/ledger.c":
		'#include "ledger.h"\nint ledger_post(int amount) {\n  return audit_check(amount);\n}\n',
	"src/audit.c": '#include "ledger.h"\nint audit_check(int amount) { return amount; }\n',
	"src/main.c": '#include "ledger.h"\nint main(void) { return audit_log(1); }\n',
	"src/report.c": "int report(void) { return 0; }\n",
};

/**
 * A part bound to a file of a checkout.
 * @param id Its id.
 * @param repo Its repository.
 * @param path The bound file.
 * @returns The node.
 */
function part(id: string, repo: string, path: string) {
	const order = (id.charCodeAt(0) * 100 + id.charCodeAt(1)) * 10;
	return { id, name: id, kind: "module", order, binding: { repo, path } };
}

/**
 * Commit the code into a new checkout.
 * @param repo Its repository.
 * @param files Its files.
 * @returns The checkout.
 */
function checkout(repo: string, files: Record<string, string>): string {
	const root = join(scratch, repo.split("/").at(-1) ?? "");
	mkdirSync(root, { recursive: true });
	git(scratch, root, "init", "-q", "-b", "main");
	git(scratch, root, "remote", "add", "origin", `https://${repo}.git`);
	write(root, files);
	git(scratch, root, "add", "-A");
	git(scratch, root, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	return root;
}

beforeAll(async () => {
	writeFileSync(join(scratch, "gitconfig"), "");
	const database = ["ledger.c", "audit.c", "main.c", "report.c"].map((file) => ({
		directory: ".",
		file: `src/${file}`,
		arguments: ["cc", "-Iinclude", "-c", `src/${file}`],
	}));
	const shop = checkout(SHOP, { ...CODE, "compile_commands.json": JSON.stringify(database) });
	const bare = checkout(BARE, CODE);
	// Both checkouts configure the stand-in, as `repo language-server c` would.
	register(
		scratch,
		{ [SHOP]: shop, [BARE]: bare },
		{ c: { command: process.execPath, args: [STAND_IN, join(state, "answers.json")] } },
	);
	mkdirSync(state);
	// What clangd answers in `shop`: `audit_check` is defined in audit.c, and
	// `audit_log` only declared in ledger.h; each outline declares a function.
	const audit = { start: { line: 1, character: 4 }, end: { line: 1, character: 15 } };
	const log = { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } };
	writeFileSync(
		join(state, "answers.json"),
		JSON.stringify({
			"src/ledger.c:3:audit_check": { path: "src/audit.c", line: 2, character: 4 },
			"outline:src/audit.c": [
				{ name: "audit_check", kind: 12, range: audit, selectionRange: audit },
			],
			"src/main.c:2:audit_log": { path: "include/ledger.h", line: 3, character: 4 },
			"outline:include/ledger.h": [
				{ name: "audit_log", kind: 12, range: log, selectionRange: log },
			],
		}),
	);
	const anchor = { path: "src/ledger.c", symbol: "audit_check" };
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pL", SHOP, "src/ledger.c"),
					part("pA", SHOP, "src/audit.c"),
					part("pR", SHOP, "src/report.c"),
					part("pM", SHOP, "src/main.c"),
					part("qL", BARE, "src/ledger.c"),
					part("qA", BARE, "src/audit.c"),
					part("qR", BARE, "src/report.c"),
					part("qM", BARE, "src/main.c"),
				],
				edges: [
					{
						id: "e1",
						order: 10,
						from: "pL",
						to: "pR",
						kind: "call",
						anchor: { repo: SHOP, ...anchor },
					},
					{
						id: "e2",
						order: 20,
						from: "qL",
						to: "qR",
						kind: "call",
						anchor: { repo: BARE, ...anchor },
					},
				],
			},
		},
	]);
	const check = await import("#runtime/api/code-check-run.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The finding of one code about one subject.
 * @param code The finding's code.
 * @param id The subject's id.
 * @returns The finding, if any.
 */
function finding(code: string, id: string) {
	return outcome.findings.find((each) => each.code === code && each.subject?.id === id);
}

test("with a compilation database, clangd places a use whose include leads only to a declaration, and the undrawn dependency it proves is a warning", () => {
	const undrawn = finding("RELATIONSHIP_UNDRAWN", "pA");
	expect(undrawn?.severity).toBe("warning");
	expect(undrawn?.evidence?.map((piece) => [piece.from, piece.to, piece.resolution])).toEqual([
		["pL", "pA", "resolved"],
	]);
});

const read = (id: string) => {
	const undrawn = finding("RELATIONSHIP_UNDRAWN", id);
	return [undrawn?.severity, undrawn?.evidence?.map((piece) => piece.resolution)];
};

test("a declaration clangd names, whose header's source file does not define it, stays as code facts read it", () => {
	expect(read("pL")).toEqual(["information", ["candidate"]]);
	expect(read("pL")).toEqual(read("qL"));
});

test("with a compilation database, an anchor whose include leads only to a declaration is judged where clangd places it", () => {
	expect(finding("ANCHOR_MISMATCH", "e1")?.severity).toBe("warning");
});

test("without a compilation database, the check says so once for the checkout and keeps what code facts read", () => {
	expect(finding("RELATIONSHIP_UNDRAWN", "qA")).toBeUndefined();
	expect(finding("ANCHOR_MISMATCH", "e2")).toBeUndefined();
	expect(outcome.skipped.filter((each) => each.reason.startsWith("language-server-"))).toEqual([
		{ reason: "language-server-unready", repo: BARE, detail: expect.any(String) },
	]);
});
