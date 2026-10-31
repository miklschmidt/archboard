// The code pass reads parts bound to C and C++ files through the C and C++
// adapters (ADR 0046, TASK-367.09): bindings and anchors are held to
// definitions and references, the relationships between bound parts to the
// evidence that joins their code through the includes, and a part bound to a
// header or to its source file owns the pair.
//
// The checkout `shop` has no `compile_commands.json`: the ledger's public
// header is under `include/`, its source under `src/`; the ledger rounds
// through the money module, which a part binds by its header; the mailer
// calls the notifier, and an audit the ledger's header declares and
// `audit.c` defines; and a C++ app opens a store whose class is declared in
// `store.hpp` and defined in `store.cpp`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-c-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param name Its name.
 * @param path Its bound path.
 * @param symbol Its bound symbol, if any.
 * @returns The node.
 */
function part(id: string, name: string, path: string, symbol?: string) {
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor, if any.
 * @returns The relationship.
 */
function edge(
	id: string,
	ends: readonly [string, string],
	kind: string,
	anchor?: [string, string],
) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } }),
	};
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"include/shop/ledger.h": [
			"#ifndef SHOP_LEDGER_H",
			"#define SHOP_LEDGER_H",
			"#define LEDGER_MAX 100",
			"struct Ledger;",
			"int ledger_post(struct Ledger *ledger, long amount);",
			"int ledger_audit(long amount);",
			"#endif",
			"",
		].join("\n"),
		"src/ledger.c": [
			'#include "shop/ledger.h"',
			'#include "money.h"',
			"",
			"struct Ledger { long total; };",
			"",
			"int ledger_post(struct Ledger *ledger, long amount) {",
			"\tledger->total += money_round(amount);",
			"\treturn 0;",
			"}",
			"",
		].join("\n"),
		"src/money.h": "long money_round(long amount);\n",
		"src/money.c": '#include "money.h"\n\nlong money_round(long amount) { return amount; }\n',
		"src/checkout.c": [
			'#include "shop/ledger.h"',
			"",
			"int checkout_pay(struct Ledger *ledger) {",
			"\t/* money_in_comment */",
			"\treturn ledger_post(ledger, 5);",
			"}",
			"",
		].join("\n"),
		"src/notify.h": "void notify(int order);\n",
		"src/notify.c": '#include "notify.h"\n\nvoid notify(int order) { (void)order; }\n',
		"src/audit.c":
			'#include "shop/ledger.h"\n\nint ledger_audit(long amount) { return amount > 0; }\n',
		"src/mail.c": [
			'#include "notify.h"',
			'#include "shop/ledger.h"',
			"",
			"void send_mail(int order) { notify(order); ledger_audit(order); }",
			"",
		].join("\n"),
		"cpp/store.hpp": [
			"namespace shop {",
			"class Store {",
			"public:",
			"\tstatic Store *open();",
			"\tvoid save(int item);",
			"};",
			"}",
			"",
		].join("\n"),
		"cpp/store.cpp": [
			'#include "store.hpp"',
			"namespace shop {",
			"Store *Store::open() { return new Store(); }",
			"void Store::save(int item) { (void)item; }",
			"}",
			"",
		].join("\n"),
		"cpp/app.cpp":
			'#include "store.hpp"\n\nint run() { shop::Store::open()->save(1); return 0; }\n',
		// Callers of the `src` module from outside it, through its public header `money.h`.
		"tools/report.c":
			'#include "../src/money.h"\n\nlong report(long a) { return money_round(a); }\n',
		"tools/batch.c":
			'#include "../src/money.h"\n\nlong batch(long a) { return money_round(a) * 2; }\n',
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
					part("pL", "Ledger", "src/ledger.c"),
					// The macro is declared in the ledger's header, the pair of its source file.
					part("pX", "Limit", "src/ledger.c", "LEDGER_MAX"),
					part("pB", "Gone", "src/ledger.c", "Missing"),
					part("pC", "Checkout", "src/checkout.c"),
					// Bound to the header, so it owns the source file too.
					part("pM", "Money", "src/money.h"),
					part("pN", "Notifier", "src/notify.c"),
					part("pA", "Mailer", "src/mail.c"),
					part("pS", "Store", "cpp/store.cpp"),
					part("pV", "Save", "cpp/store.cpp", "Store::save"),
					{ ...part("pO", "Open", "cpp/store.cpp", "Store::open"), parent: "pS" },
					part("pP", "App", "cpp/app.cpp"),
				],
				edges: [
					// The anchor holds, and the header it reaches is the ledger's pair.
					edge("e1", ["pC", "pL"], "call", ["src/checkout.c", "ledger_post"]),
					// The name stands only in a comment, which is no use.
					edge("e2", ["pC", "pM"], "call", ["src/checkout.c", "money_in_comment"]),
					// Drawn from the notifier, while the mailer's code calls it.
					edge("e3", ["pN", "pA"], "event"),
					// The app calls the class its header declares, in the store's pair.
					edge("e4", ["pP", "pS"], "call"),
					// The use leads through the header to the method's code, which the part binds.
					edge("e5", ["pP", "pO"], "call", ["cpp/app.cpp", "shop::Store::open"]),
				],
			},
		},
	]);
	// A container bound to the `src` module, whose money part no drawn caller reaches.
	board(vault, "Modules", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pK", "Ledger library", "src"),
					{ ...part("pR", "Money", "src/money.h"), parent: "pK" },
					part("pT", "Report", "tools/report.c"),
				],
				edges: [edge("e1", ["pT", "pK"], "call")],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
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

test("anchors, binding symbols and the relationships between parts bound to C and C++ files are judged by the C and C++ adapters", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pB warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pM warning",
			// The ledger's header only declares the audit, and its source defines none of it.
			"RELATIONSHIP_UNDRAWN pL information",
			"CALLER_UNDRAWN pR warning",
			"EXPOSED_UNUSED pK information",
		].toSorted(),
	);
	// Nothing was read as text.
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
});

test("a use reaches the part bound to the pair of the header its include names, resolved", () => {
	const undrawn = outcome.findings.find(
		(each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === "pM",
	);
	expect(undrawn?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "pL",
			to: "pM",
			repo: SHOP,
			path: "src/ledger.c",
			line: 7,
			symbol: "money_round",
		},
	]);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pA", "pN", "call"],
	]);
});

test("a C module exposes what its public headers declare, and an outside file uses it through an include", () => {
	const undrawn = outcome.findings.find((each) => each.code === "CALLER_UNDRAWN");
	// The report's use is drawn through its part; the batch file no part binds uses the money part's code.
	expect(undrawn?.evidence?.map((piece) => [piece.path, piece.symbol, piece.resolution])).toEqual([
		["tools/batch.c", "money_round", "resolved"],
	]);
	// `notify.h` is a public header too, and no file outside `src` calls the notifier.
	const unused = outcome.findings.find((each) => each.code === "EXPOSED_UNUSED");
	expect(unused?.message).toContain("notify");
	expect(unused?.message).not.toContain("money_round");
});

test("a checkout with no configured C server says language-server-missing once for it, and names the command that configures one", () => {
	const missing = outcome.skipped.filter((each) => each.reason === "language-server-missing");
	expect(missing).toEqual([
		{
			reason: "language-server-missing",
			repo: SHOP,
			detail: expect.stringContaining(`repo language-server c <command> --repo ${SHOP}`),
		},
	]);
});
