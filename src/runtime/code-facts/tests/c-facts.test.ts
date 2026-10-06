// The code facts of C and C++ files (ADR 0046, TASK-367.09), read from the
// fixture project `fixtures/c-shop`: definitions with C's visibility,
// references with their evidence kind, includes resolved with and without
// `compile_commands.json`, a header and its source file, and code that did
// not parse.
//
// The project: `include/shop/ledger.h` is the public header of
// `src/ledger.c`; `src/money.h` sits beside `src/money.c`; `src/checkout.c`
// uses both; `cpp/` is a C++ class in a namespace; `built/` has its own
// `compile_commands.json`, written by the test because its paths are absolute.

import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createCodeFacts,
	definitionSite,
	findSymbol,
	pairOf,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

const FIXTURE = join(import.meta.dir, "fixtures", "c-shop");
const checkout = fixtureCheckout(
	Object.fromEntries(
		readdirSync(FIXTURE, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return [file.slice(FIXTURE.length + 1), readFileSync(file, "utf8")];
			}),
	),
);
checkout.write(
	"built/compile_commands.json",
	JSON.stringify([
		{
			directory: join(checkout.root, "built"),
			file: "main.c",
			arguments: ["cc", "-Iheaders", "-iquote", "quoted", "-isystem", "vendor", "-c", "main.c"],
		},
		{
			directory: join(checkout.root, "built"),
			file: join(checkout.root, "built", "other.c"),
			command: `cc -I"${join(checkout.root, "built", "vendor")}" -isystem/usr/include -c other.c`,
		},
	]),
);
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one C or C++ file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string): Promise<SyntaxFacts> {
	const found = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (found?.adapter !== "c" && found?.adapter !== "cpp") {
		throw new Error(`${relative} was not read as C or C++`);
	}
	return found;
}

/**
 * Each definition of a file, with its visibility and whether it is exposed.
 * @param relative The file.
 * @returns The definitions by symbol.
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
 * Where each include of a file leads.
 * @param found The file's facts.
 * @returns Each include's path as written, and the file it resolves to.
 */
function resolved(found: SyntaxFacts): Record<string, string | undefined> {
	return Object.fromEntries(found.imports.map((each) => [each.specifier, each.resolved]));
}

test("a C file defines its functions, variables, types and macros with their linkage, and static names are internal", async () => {
	expect(await visibility("include/shop/ledger.h")).toEqual({
		SHOP_LEDGER_H: ["macro", true],
		LEDGER_MAX: ["macro", true],
		LedgerStats: ["no linkage", true],
		"LedgerStats::total": ["public", true],
		"LedgerStats::count": ["public", true],
		ledger_post: ["extern", true],
		ledger_open_count: ["extern", true],
	});
	expect(await visibility("src/money.c")).toEqual({
		cents: ["static", false],
		money_round: ["extern", true],
	});
	const ledger = await read("src/ledger.c");
	expect(ledger.definitions.find((each) => each.symbol === "ledger_post")).toMatchObject({
		start: 14,
		end: 17,
	});
});

test("a C++ file qualifies names by namespace and class, gives members their access, and an anonymous namespace is internal", async () => {
	expect(await visibility("cpp/store.hpp")).toEqual({
		"shop::Store": ["no linkage", true],
		"shop::Store::Store": ["public", true],
		"shop::Store::save": ["public", true],
		"shop::Store::open": ["public", true],
		"shop::Store::size_": ["private", false],
		"shop::Item": ["no linkage", true],
		"shop::Item::id": ["public", true],
		"shop::Kind": ["no linkage", true],
		"shop::Kind::Book": ["no linkage", true],
		"shop::Kind::Game": ["no linkage", true],
		"shop::StoreId": ["no linkage", true],
	});
	expect(await visibility("cpp/store.cpp")).toEqual({
		"shop::hidden": ["anonymous namespace", false],
		"shop::Store::Store": ["extern", true],
		"shop::Store::save": ["extern", true],
		"shop::Store::open": ["extern", true],
	});
	// A binding spells a C++ name with `::` or `.`, whole or by its last names.
	const header = await read("cpp/store.hpp");
	for (const symbol of ["shop::Store::save", "Store::save", "Store.save", "save"]) {
		expect(findSymbol(header, symbol, "definition")).toMatchObject({ status: "found", line: 8 });
	}
});

test("a call, a construction and a base class are call evidence, a type name is import evidence, and locals, comments and strings are no use", async () => {
	const checkoutFile = await read("src/checkout.c");
	const use = (symbol: string) => checkoutFile.references.find((each) => each.symbol === symbol);
	expect(use("ledger_post")).toMatchObject({ kind: "call", typeOnly: false, line: 12 });
	expect(use("LEDGER_MAX")).toMatchObject({ kind: "call" });
	expect(use("LedgerStats")).toMatchObject({ kind: "import", typeOnly: true });
	expect(use("count")).toBeUndefined();
	expect(use("stats.count")).toMatchObject({ kind: "call" });
	for (const symbol of ["ledger_in_comment", "ledger_in_string"]) {
		expect(findSymbol(checkoutFile, symbol, "definition-or-reference").status).toBe("absent");
	}
	expect(
		checkoutFile.references.filter((each) => each.via === "environment").map((each) => each.symbol),
	).toEqual(["SHOP_TOKEN"]);
	const app = await read("cpp/app.cpp");
	const kinds = Object.fromEntries(
		app.references.map((each) => [`${each.symbol} ${String(each.typeOnly)}`, each.kind]),
	);
	expect(kinds).toMatchObject({
		"shop::Store false": "call",
		"shop::Store::open false": "call",
		"shop::Item true": "import",
		"shop::Item false": "call",
		"store.save false": "call",
	});
	const store = await read("cpp/store.cpp");
	const stores = store.references.filter((each) => each.symbol === "Store");
	expect(stores.map((each) => [each.line, each.kind])).toEqual([
		[18, "import"],
		[19, "call"],
	]);
});

test("without compile_commands.json an include resolves against its file's directory, the checkout root and each include directory", async () => {
	expect(resolved(await read("src/checkout.c"))).toEqual({
		"shop/ledger.h": "include/shop/ledger.h",
		"src/money.h": "src/money.h",
		"<stdio.h>": undefined,
	});
	expect(resolved(await read("src/money.c"))).toEqual({ "money.h": "src/money.h" });
});

test("with compile_commands.json an include resolves through its -iquote, -I and -isystem directories, and nothing else", async () => {
	expect(resolved(await read("built/main.c"))).toEqual({
		"api.h": "built/headers/api.h",
		"q.h": "built/quoted/q.h",
		"<vendor.h>": "built/vendor/vendor.h",
		"shop/ledger.h": undefined,
	});
	// Each file searches its own command's directories, here a quoted absolute -I.
	expect(resolved(await read("built/other.c"))).toEqual({
		"<vendor.h>": "built/vendor/vendor.h",
		"api.h": undefined,
	});
});

test("a use reaches the definition an included header declares, through the headers it includes", async () => {
	const pass = facts.pass(new AbortController().signal);
	expect(await definitionSite(pass, checkout, "src/checkout.c", "ledger_post")).toMatchObject({
		path: "include/shop/ledger.h",
		definition: { symbol: "ledger_post" },
	});
	expect(await definitionSite(pass, checkout, "src/checkout.c", "money_round")).toMatchObject({
		path: "src/money.h",
	});
	// A bare name never reaches a field of a struct.
	expect(await definitionSite(pass, checkout, "src/checkout.c", "total")).toBeUndefined();
	expect(await definitionSite(pass, checkout, "cpp/app.cpp", "shop::Store::open")).toMatchObject({
		path: "cpp/store.hpp",
	});
	expect(await definitionSite(pass, checkout, "built/main.c", "api_call")).toMatchObject({
		path: "built/headers/api.h",
	});
});

test("a header and its source file are a pair, beside each other or apart when the name is the only one", () => {
	expect(pairOf("src/money.c", checkout.files)).toEqual(["src/money.h"]);
	expect(pairOf("src/money.h", checkout.files)).toEqual(["src/money.c"]);
	expect(pairOf("src/ledger.c", checkout.files)).toEqual(["include/shop/ledger.h"]);
	expect(pairOf("include/shop/ledger.h", checkout.files)).toEqual(["src/ledger.c"]);
	expect(pairOf("cpp/store.cpp", checkout.files)).toEqual(["cpp/store.hpp"]);
	expect(pairOf("src/checkout.c", checkout.files)).toEqual([]);
});

test("code that did not parse holds no facts, a name found only there is unparsed, and the rest of the file keeps its facts", async () => {
	const broken = await read("src/broken.c");
	expect(findSymbol(broken, "only_here", "definition-or-reference")).toMatchObject({
		status: "unparsed",
	});
	expect(findSymbol(broken, "before", "definition").status).toBe("found");
	expect(findSymbol(broken, "after", "definition").status).toBe("found");
});
