// The code pass reads TypeScript through code facts (ADR 0046, TASK-367.06):
// a bound symbol must be a definition, an anchor's symbol a definition or a
// use, a name in a comment or a string is neither, a symbol found only in code
// that did not parse is skipped, and an anchor whose symbol is defined outside
// the bound code of both ends does not support its relationship, unless an end
// has no binding to say where its code is.
//
// The checkout `mart` is registered. Web binds `src/web`, Orders the module
// index that passes `placeOrder` on, Billing the `charge` definition, and
// Logger a file no relationship from Web reaches through its anchors. Provider
// is bound to nothing.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-facts-check-"));
const mart = join(scratch, "mart");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const MART = "github.com/test/mart";
let check: typeof CheckModule;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param name Its name.
 * @param binding Its path, and its symbol if any.
 * @returns The node.
 */
function part(id: string, name: string, binding: Record<string, string>) {
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: MART, ...binding },
	};
}

/**
 * An anchored call.
 * @param id The relationship's id.
 * @param ends Its start and end.
 * @param path The anchored file.
 * @param symbol The anchored symbol.
 * @returns The relationship.
 */
function call(id: string, ends: readonly [string, string], path: string, symbol: string) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind: "call",
		anchor: { repo: MART, path, symbol },
	};
}

beforeAll(async () => {
	mkdirSync(mart, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, mart, "init", "-q", "-b", "main");
	git(scratch, mart, "remote", "add", "origin", `https://${MART}.git`);
	write(mart, {
		"tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
		"src/orders/index.ts": 'export { placeOrder } from "./lib/place";\n',
		"src/orders/lib/place.ts": "export function placeOrder(): void {}\n",
		"src/billing/charge.ts":
			"export function charge(): void {}\nexport function audit(): void {}\n",
		"src/shared/log.ts": "export function log(): void {}\n",
		"src/web/checkout.ts": [
			'import { placeOrder } from "@/orders/index";',
			'import { charge } from "../billing/charge";',
			'import { log } from "@/shared/log";',
			"// refundOrder is not called here.",
			"type Sink = typeof log;",
			'const label = "cancelOrder";',
			"export function submit(): string { placeOrder(); charge(); log(); return label; }",
			"",
		].join("\n"),
		"src/web/broken.ts":
			"export function before() {}\nconst a = 1 @ onlyHere @;\nexport function after() {}\n",
		"README.md": "Checkout calls placeOrder.\n",
	});
	git(scratch, mart, "add", "-A");
	git(scratch, mart, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [MART]: mart });
	const web: readonly [string, string] = ["pW", "pB"];
	board(vault, "Mart", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pW", "Web", { path: "src/web" }),
					part("pO", "Orders", { path: "src/orders/index.ts" }),
					part("pB", "Billing", { path: "src/billing/charge.ts", symbol: "charge" }),
					part("pL", "Logger", { path: "src/shared/log.ts" }),
					// Checkout uses placeOrder and defines none of it.
					part("pU", "Uses", { path: "src/web/checkout.ts", symbol: "placeOrder" }),
					part("pK", "Broken", { path: "src/web/broken.ts", symbol: "onlyHere" }),
					part("pA", "Audit", { path: "src/billing/charge.ts", symbol: "audit" }),
					// An external system, which no binding places in the checkout.
					{ id: "pX", name: "Provider", kind: "module", order: 880 },
				],
				edges: [
					// Defined behind the index Orders binds, which passes it on.
					call("e1", ["pW", "pO"], "src/web/checkout.ts", "placeOrder"),
					// Defined inside the definition Billing binds.
					call("e2", web, "src/web/checkout.ts", "charge"),
					// Defined in Logger's file, which neither end binds.
					call("e3", ["pW", "pO"], "src/web/checkout.ts", "log"),
					call("e4", web, "src/web/checkout.ts", "refundOrder"),
					call("e5", web, "src/web/checkout.ts", "cancelOrder"),
					// Defined by the anchored file itself, outside Billing's symbol.
					call("e6", ["pO", "pB"], "src/billing/charge.ts", "audit"),
					call("e7", ["pB", "pW"], "src/billing/charge.ts", "charge"),
					call("e8", web, "README.md", "placeOrder"),
					call("e9", ["pW", "pL"], "src/web/broken.ts", "onlyHere"),
					// Defined outside Web, and the check cannot tell whether it is Provider's code.
					call("e10", ["pW", "pX"], "src/web/checkout.ts", "log"),
				],
			},
		},
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the pass over the current variant.
 * @returns Its outcome.
 */
async function pass() {
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	return check.checkCode(vault, read.boards, new AbortController().signal);
}

test("a TypeScript file holds a bound symbol it defines and an anchored one it defines or uses, never one in a comment or a string", async () => {
	const outcome = await pass();
	const found = outcome.findings.map((finding) => `${finding.code} ${finding.subject?.id}`);
	expect(found.toSorted()).toEqual(
		[
			"BINDING_SYMBOL_MISSING pU",
			"ANCHOR_SYMBOL_MISSING e4",
			"ANCHOR_SYMBOL_MISSING e5",
			"ANCHOR_MISMATCH e3",
			"ANCHOR_MISMATCH e6",
		].toSorted(),
	);
	expect(outcome.findings.every((finding) => finding.severity === "warning")).toBe(true);
});

test("an anchor whose symbol is defined outside both ends names the use it rests on, a use at run time before a use as a type", async () => {
	const outcome = await pass();
	const mismatch = (id: string) =>
		outcome.findings.find(
			(finding) => finding.code === "ANCHOR_MISMATCH" && finding.subject?.id === id,
		);
	expect(mismatch("e3")?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			repo: MART,
			path: "src/web/checkout.ts",
			line: 7,
			symbol: "log",
		},
	]);
	expect(mismatch("e3")?.message).toContain("src/shared/log.ts:1");
	// The anchored file defines it itself, which gives no evidence kind.
	expect(mismatch("e6")?.evidence).toBeUndefined();
});

test("a symbol found only in code that did not parse is skipped, and text-only names the kinds of file read as text", async () => {
	const outcome = await pass();
	const skips = outcome.skipped.map((skip) => [
		skip.reason,
		skip.subject?.id ?? skip.repo,
		skip.detail,
	]);
	expect(skips.toSorted()).toEqual(
		[
			["symbol-unparsed", "pK", "src/web/broken.ts:2"],
			["symbol-unparsed", "e9", "src/web/broken.ts:2"],
			["text-only", MART, expect.stringContaining(".md")],
		].toSorted(),
	);
	const textOnly = outcome.skipped.find((skip) => skip.reason === "text-only");
	expect(textOnly?.detail).not.toContain(".ts");
});
