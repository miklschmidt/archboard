// The code facts of Objective-C files (ADR 0046, TASK-367.10), read from the
// fixture project `fixtures/objc-shop`: classes, categories and protocols as
// definitions, message sends as references by selector, `#import`,
// `@import` and `#include` resolved as C resolves an include, the
// visibility of a public header and of a class extension, and the macros the
// grammar cannot read.
//
// The project: `Shop/Ledger.h` is the public header of `Shop/Ledger.m`,
// which hides more of the class in a class extension and holds C functions;
// `Ledger+Report` is a category; `Auditing.h` is a protocol; `Money` is C;
// `Checkout.m` mixes C and Objective-C; `Shop.h` is the umbrella header that
// `@import Shop;` in `App/Main.m` names; `Bridge.mm` is Objective-C++;
// `ShopMacros.h` wraps SDK macros that other files use; `Engine.h` is C++.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { definitionSite } from "#runtime/operations/code-facts/definition-site.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { moduleExposure } from "#runtime/operations/code-facts/modules/module-exposure.ts";
import { pairOf } from "#runtime/operations/code-facts/c/c-pairs.ts";
import { type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { fixtureDirectory } from "#tests/runtime/support/code-facts/checkout.ts";
import { asValueOf } from "#tests/runtime/support/code-facts/uses.ts";

const checkout = fixtureDirectory("objc-shop");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string): Promise<SyntaxFacts> {
	const found = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (found === undefined || found.adapter === "text") throw new Error(`${relative} has no syntax`);
	return found;
}

/**
 * Each definition of a file, with its visibility and whether it is exposed.
 * @param relative The file.
 * @returns The definitions by symbol, the last of a symbol defined twice.
 */
async function visibility(relative: string): Promise<Record<string, [string, boolean]>> {
	return Object.fromEntries(
		(await read(relative)).definitions.map((each) => [
			each.symbol,
			[each.visibility, each.exposed],
		]),
	);
}

/**
 * Each use of a file, with where it leads.
 * @param relative The file.
 * @returns Each spelling, and the file and name its target names, or `-`.
 */
async function uses(relative: string): Promise<Record<string, string>> {
	return Object.fromEntries(
		(await read(relative)).references.map((each) => [
			each.symbol,
			each.target === undefined ? "-" : `${each.target.path} ${each.target.symbol}`,
		]),
	);
}

test("a public header exposes its classes, categories, protocols and their members, and a class extension in an .m is internal", async () => {
	expect(await visibility("Shop/Ledger.h")).toMatchObject({
		Ledger: ["@interface", true],
		"Ledger::total": ["public", true],
		"Ledger::ledgerNamed:": ["public", true],
		"Ledger::post:by:": ["public", true],
		"Ledger::close": ["public", true],
		// C in an Objective-C header, and an enum that `NS_ENUM` writes.
		ledger_fee: ["extern", true],
		LedgerKind: ["no linkage", true],
		LedgerKindCard: ["no linkage", true],
	});
	expect(await visibility("Shop/Ledger+Report.h")).toEqual({
		"Ledger(Report)": ["@interface", true],
		"Ledger::report": ["public", true],
	});
	expect(await visibility("Shop/Auditing.h")).toEqual({
		Auditing: ["@protocol", true],
		"Auditing::audit:": ["public", true],
	});
	expect(await visibility("Shop/Ledger.m")).toEqual({
		rounded: ["static", false],
		ledger_fee: ["extern", true],
		Ledger: ["@implementation", false],
		"Ledger::total": ["private", false],
		"Ledger::ledgerNamed:": ["public", false],
		"Ledger::post:by:": ["public", false],
		"Ledger::close": ["public", false],
		"Ledger::remember:": ["private", false],
		"Ledger::audit:": ["public", false],
	});
	// An interface declares; its code is the implementation.
	const header = await read("Shop/Ledger.h");
	expect(header.definitions.filter((each) => each.declaration).map((each) => each.symbol)).toEqual([
		"ledger_fee",
		"Ledger",
		"Ledger::ledgerNamed:",
		"Ledger::post:by:",
		"Ledger::close",
	]);
	// A binding spells a method with `::` or `.`, whole or by its selector.
	const source = await read("Shop/Ledger.m");
	for (const symbol of ["Ledger::post:by:", "Ledger.post:by:", "post:by:"]) {
		expect(findSymbol(source, symbol, "definition")).toMatchObject({ status: "found", line: 20 });
	}
});

test("a message send is a call of its selector, qualified by the receiver's class where the syntax shows it", async () => {
	expect(await uses("Shop/Ledger.m")).toMatchObject({
		// A class named as the receiver, and a new object of it.
		"Ledger::alloc": "-",
		"Ledger::init": "-",
		// `self`, in the class's own file.
		"Ledger::remember:": "-",
		// A parameter declared as a pointer to a class.
		"User::notify": "-",
		// C in the same file, through its include.
		money_round: "Shop/Money.h money_round",
	});
	const checkoutUses = await uses("Shop/Checkout.m");
	expect(checkoutUses).toMatchObject({
		"Ledger::post:by:": "Shop/Ledger.h Ledger::post:by:",
		"Ledger::report": "Shop/Ledger+Report.h Ledger::report",
		// A call's result names no class, and a selector expression no receiver.
		".length": "-",
		".close": "-",
		// A loop's variable shadows the parameter of the same name.
		"User::notify": "-",
		// An instance variable is a member, also where another class declares one `@package`.
		_count: "-",
	});
	expect(Object.keys(checkoutUses)).not.toContain("Ledger::notify");
	const checkoutFile = await read("Shop/Checkout.m");
	expect(checkoutFile.references.find((each) => each.symbol === "Ledger::post:by:")).toMatchObject({
		kind: "call",
		typeOnly: false,
		line: 5,
	});
	// A selector's parts and a method's parameters are no uses of their own.
	for (const symbol of ["post", "by", "amount", "self"]) {
		expect(checkoutFile.references.some((each) => each.symbol === symbol)).toBe(false);
		expect((await read("Shop/Ledger.m")).references.some((each) => each.symbol === symbol)).toBe(
			false,
		);
	}
});

test("a message to a class runs it, and a selector expression and a constant read use what they name as a value", async () => {
	const asValue = await asValueOf("Uses.m", [
		"void use(void) {",
		"\t[Ledger post];",
		"\tSEL chosen = @selector(settle:);",
		"\tint n = LIMIT;",
		"}",
	]);
	expect(asValue).toMatchObject({
		Ledger: false,
		"Ledger::post": false,
		".settle:": true,
		LIMIT: true,
	});
});

const imports = async (relative: string) =>
	Object.fromEntries((await read(relative)).imports.map((each) => [each.specifier, each.resolved]));

test("#import, #include and @import resolve as a C include does, and a use leads to the pair's implementation", async () => {
	expect(await imports("Shop/Checkout.m")).toEqual({
		"Ledger+Report.h": "Shop/Ledger+Report.h",
		"Money.h": "Shop/Money.h",
	});
	// `@import Shop;` names the module's umbrella header; the SDK's modules are outside the checkout.
	expect(await imports("App/Main.m")).toEqual({ "<Shop/Shop.h>": "Shop/Shop.h" });
	expect(await imports("Shop/Auditing.h")).toEqual({ "<Foundation/Foundation.h>": undefined });
	const pass = facts.pass(new AbortController().signal);
	expect(await definitionSite(pass, checkout, "App/Main.m", "Ledger::ledgerNamed:")).toMatchObject({
		path: "Shop/Ledger.m",
		definition: { symbol: "Ledger::ledgerNamed:", start: 15 },
		via: ["Shop/Ledger.h"],
	});
	expect(await definitionSite(pass, checkout, "Shop/Checkout.m", "Ledger::report")).toMatchObject({
		path: "Shop/Ledger+Report.m",
	});
	// C declared in an Objective-C header leads to its source file too.
	expect(await definitionSite(pass, checkout, "Shop/Ledger+Report.m", "ledger_fee")).toMatchObject({
		path: "Shop/Ledger.m",
	});
	expect(pairOf("Shop/Ledger.h", checkout.files)).toEqual(["Shop/Ledger.m"]);
	expect(pairOf("Shop/Ledger+Report.m", checkout.files)).toEqual(["Shop/Ledger+Report.h"]);
	expect(pairOf("Shop/Bridge.mm", checkout.files)).toEqual([]);
});

test("an Objective-C directory is a module whose public headers expose its interface at the code of each name, and a class extension stays inside", async () => {
	const exposure = await moduleExposure(facts.pass(new AbortController().signal), checkout, "Shop");
	expect(exposure?.rootFiles).toEqual(["Shop/Ledger+Report.h", "Shop/Ledger.h", "Shop/Money.h"]);
	const exposed = Object.fromEntries(exposure?.exposed.map((each) => [each.name, each.path]) ?? []);
	expect(exposed).toMatchObject({
		"Ledger::report": "Shop/Ledger+Report.m",
		Ledger: "Shop/Ledger.m",
		"Ledger::post:by:": "Shop/Ledger.m",
		ledger_fee: "Shop/Ledger.m",
		money_round: "Shop/Money.c",
	});
	expect(Object.keys(exposed)).not.toContain("Ledger::remember:");
	expect(exposure?.outside).toEqual(["App/Main.m"]);
});

test("a header is read as Objective-C by its text outside comments, and an Objective-C++ file as text", async () => {
	expect((await read("Shop/Money.h")).definitions.map((each) => each.symbol)).toEqual([
		"money_round",
	]);
	// `@class Engine` stands only in a documentation comment of a C++ header.
	expect((await read("Shop/Engine.h")).definitions.map((each) => each.symbol)).toEqual([
		"shop::Engine",
		"shop::Engine::run",
	]);
	const bridge = await facts.pass(new AbortController().signal).read(checkout, "Shop/Bridge.mm");
	expect(bridge?.adapter).toBe("text");
});

test("the attribute macros the grammar cannot read are blanked with every line in place, so the code around them parses", async () => {
	// `SHOP_API_AVAILABLE`, `NS_ENUM` and `NS_ASSUME_NONNULL_BEGIN` stand in the header.
	expect((await read("Shop/Ledger.h")).unparsed).toEqual([]);
	// `ShopMacros.h` wraps `NS_HEADER_AUDIT_BEGIN`, which takes arguments, under another name.
	expect((await read("Shop/Auditing.h")).references.map((each) => each.symbol)).toEqual([
		"NSObject",
	]);
	const macros = await read("Shop/Macros.m");
	expect(macros.unparsed).toEqual([]);
	const declared = macros.definitions.filter((each) => each.visibility !== "macro");
	expect(declared.map((each) => [each.symbol, each.start, each.end])).toEqual([
		["Macros", 9, 13],
		["Macros::a", 10, 11],
		["Macros::b", 12, 12],
		["Mode", 15, 17],
		["ModeA", 16, 16],
		["Macros", 19, 22],
		["Macros::a", 20, 20],
		["Macros::b", 21, 21],
	]);
	// `LOG` is code in one branch, so it stays with its arguments; `HIDDEN` expands to nothing.
	const symbols = macros.references.map((each) => each.symbol);
	expect(symbols).toContain("Macros::shown");
	expect(symbols).not.toContain("Macros::hidden");
});

test("a file is read again when a header of its checkout stops wrapping an SDK macro the file uses", async () => {
	const edited = fixtureDirectory("objc-shop");
	try {
		const cache = createCodeFacts();
		const usesOfAuditing = async () => {
			const found = await cache.pass(new AbortController().signal).read(edited, "Shop/Auditing.h");
			return found === undefined || found.adapter === "text"
				? []
				: found.references.map((each) => each.symbol);
		};
		expect(await usesOfAuditing()).not.toContain("SHOP_AUDIT_BEGIN");
		edited.write("Shop/ShopMacros.h", "#define SHOP_AUDIT_BEGIN(...) shop_audit(__VA_ARGS__)\n");
		expect(await usesOfAuditing()).toContain("SHOP_AUDIT_BEGIN");
	} finally {
		edited.remove();
	}
});
