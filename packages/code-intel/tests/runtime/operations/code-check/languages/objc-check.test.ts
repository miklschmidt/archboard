// The code pass reads parts bound to Objective-C files through the
// Objective-C adapter (ADR 0046, TASK-367.10): bindings and anchors are held
// to classes, methods and sends, and the relationships between bound parts to
// the evidence that joins their code through `#import`, `#include` and
// `@import`, also in files that mix C and Objective-C.
//
// The checkout `shop`: the ledger's class is declared in `Shop/Ledger.h` and
// implemented in `Shop/Ledger.m`, which rounds through the C money module; a
// category reports on the ledger; the checkout, which mixes C and
// Objective-C, posts to the ledger and reads the report; the app imports the
// shop as a module.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-objc-"));
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
		"Shop/Ledger.h": [
			"@import Foundation;",
			"",
			"NS_ASSUME_NONNULL_BEGIN",
			"long ledger_fee(long amount);",
			"@interface Ledger : NSObject",
			"+ (instancetype)ledgerNamed:(NSString *)name;",
			"- (void)post:(long)amount SHOP_API_AVAILABLE(ios(13.0));",
			"@end",
			"NS_ASSUME_NONNULL_END",
			"",
		].join("\n"),
		"Shop/Ledger.m": [
			'#import "Ledger.h"',
			'#include "Money.h"',
			"",
			"long ledger_fee(long amount) { return amount / 100; }",
			"",
			"@interface Ledger ()",
			"- (void)remember:(long)amount;",
			"@end",
			"",
			"@implementation Ledger",
			"+ (instancetype)ledgerNamed:(NSString *)name { return [[Ledger alloc] init]; }",
			"- (void)post:(long)amount { [self remember:money_round(amount)]; }",
			"- (void)remember:(long)amount { (void)amount; }",
			"@end",
			"",
		].join("\n"),
		"Shop/Ledger+Report.h":
			'#import "Ledger.h"\n\n@interface Ledger (Report)\n- (long)report;\n@end\n',
		"Shop/Ledger+Report.m": [
			'#import "Ledger+Report.h"',
			"",
			"@implementation Ledger (Report)",
			"- (long)report { return ledger_fee(1); }",
			"@end",
			"",
		].join("\n"),
		"Shop/Money.h": "long money_round(long amount);\n",
		"Shop/Money.c": '#include "Money.h"\n\nlong money_round(long amount) { return amount; }\n',
		"Shop/Shop.h": '#import "Ledger.h"\n#import "Ledger+Report.h"\n',
		"Shop/Checkout.m": [
			'#import "Ledger+Report.h"',
			"",
			"long checkout_pay(Ledger *ledger) {",
			"\t[ledger post:5];",
			"\treturn [ledger report];",
			"}",
			"",
		].join("\n"),
		"Shop/Bridge.mm": '#import "Ledger.h"\n\nvoid bridge(Ledger *ledger) { [ledger post:1]; }\n',
		"App/Main.m": [
			"@import Shop;",
			"",
			"int main(void) {",
			'\t[[Ledger ledgerNamed:@"main"] post:1];',
			"\treturn 0;",
			"}",
			"",
		].join("\n"),
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
					part("pL", "Ledger", "Shop/Ledger.m"),
					{ ...part("pP", "Post", "Shop/Ledger.m", "Ledger.post:"), parent: "pL" },
					part("pB", "Gone", "Shop/Ledger.m", "Ledger.vanish"),
					part("pR", "Report", "Shop/Ledger+Report.m"),
					part("pC", "Checkout", "Shop/Checkout.m"),
					// Bound to the header, so it owns the source file too.
					part("pM", "Money", "Shop/Money.h"),
					part("pA", "App", "App/Main.m"),
					part("pX", "Bridge", "Shop/Bridge.mm"),
				],
				edges: [
					// The anchor holds, and the send leads through the header to the method the part binds.
					edge("e1", ["pC", "pP"], "call", ["Shop/Checkout.m", "Ledger.post:"]),
					// No send of that selector stands in the file.
					edge("e2", ["pC", "pL"], "call", ["Shop/Checkout.m", "Ledger.close"]),
					// Drawn from the money module, while the ledger's code calls it.
					edge("e3", ["pM", "pL"], "call"),
					edge("e4", ["pR", "pL"], "call"),
					edge("e5", ["pX", "pL"], "call"),
				],
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

test("anchors, binding symbols and the relationships between parts bound to Objective-C files are judged by the Objective-C adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pB warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pR warning",
			"RELATIONSHIP_UNDRAWN pL warning",
		].toSorted(),
	);
	// The Objective-C++ file is read as text, and so says the pass.
	expect(outcome.skipped.map((each) => each.reason)).toContain("text-only");
});

test("a send reaches the part bound to the implementation its receiver's class declares, resolved, also through @import", () => {
	const undrawn = (id: string) =>
		outcome.findings
			.find((each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id)
			?.evidence?.map((piece) => [
				piece.from,
				piece.to,
				piece.path,
				piece.symbol,
				piece.resolution,
			]);
	// The checkout's send to the category reaches the report through the category's header.
	expect(undrawn("pR")).toEqual([["pC", "pR", "Shop/Checkout.m", "Ledger::report", "resolved"]]);
	// `@import Shop;` brings in the umbrella header, and the app's use of the class reaches its implementation.
	expect(undrawn("pL")).toEqual([["pA", "pL", "App/Main.m", "Ledger", "resolved"]]);
	// The method the part binds holds the C call that runs the other way.
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.symbol])).toEqual([
		["pP", "pM", "money_round"],
	]);
});
