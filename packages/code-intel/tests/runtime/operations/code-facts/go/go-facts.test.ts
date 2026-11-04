// The code facts of Go files (ADR 0046, TASK-575), read from the fixture
// workspace `fixtures/go-shop`: definitions with Go's exported names, uses
// that lead through the files of a package and the packages a file imports by
// their module paths, and the modules a `go.mod` requires.
//
// The workspace: a `go.work` uses the modules `example.com/ledger` and
// `example.com/shop`, whose `go.mod` also replaces the ledger with its local
// directory. The ledger's package holds `Ledger` with its methods, `audit` in
// another file, `platform` in two files with other build constraints, a test
// of the package and a test package of its own, and the subpackage `money`.
// The shop imports the ledger as `books`, and `shop/internal/fmtx`, whose
// package clause names it `format`.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import type { SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { fixtureCheckout, fixtureDirectory } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureDirectory("go-shop");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file of the Go adapter in a pass of its own.
 * @param relative The file.
 * @returns Its facts.
 */
async function go(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "go") throw new Error(`${relative} was not read as Go`);
	return read;
}

/**
 * Where each use of a file leads, by its spelling and evidence kind.
 * @param relative The file.
 * @returns `file#symbol` for a use that leads somewhere, else `nowhere`.
 */
async function targets(relative: string): Promise<Record<string, string>> {
	return Object.fromEntries(
		(await go(relative)).references
			.filter((use) => use.via === "code")
			.map((use) => [
				`${use.symbol} ${use.kind ?? ""}`,
				use.target === undefined ? "nowhere" : `${use.target.path}#${use.target.symbol}`,
			]),
	);
}

test("a Go file defines its declarations, methods by their receiver's type and the members of its types, exposed when the name and its type are exported", async () => {
	const read = await go("ledger/ledger.go");
	expect(
		Object.fromEntries(
			read.definitions.map((each) => [each.symbol, [each.kind, each.visibility, each.exposed]]),
		),
	).toEqual({
		Ledger: ["class", "exported", true],
		"Ledger.Name": ["value", "exported", true],
		"Ledger.total": ["value", "unexported", false],
		New: ["function", "exported", true],
		"Ledger.Post": ["function", "exported", true],
		"Ledger.Balance": ["function", "exported", true],
		// Exported as written, and no other package can name its type.
		"hidden.Close": ["function", "exported", false],
		hidden: ["class", "unexported", false],
		Archive: ["function", "exported", true],
	});
	const money = await go("ledger/money/money.go");
	expect(money.definitions.map((each) => [each.symbol, each.kind])).toEqual([
		["Money", "class"],
		["Zero", "value"],
		["Add", "function"],
		["Parse", "function"],
	]);
});

test("a use leads through an import's name to the package its module path names, and through the package to its other files", async () => {
	expect(await targets("shop/main.go")).toMatchObject({
		// The alias names the ledger; the module is the ledger's directory.
		"books.New call": "ledger/ledger.go#New",
		"example.com/ledger build-dependency": "ledger/#*",
		// A package of the ledger's module, below its directory.
		"money.Parse call": "ledger/money/money.go#Parse",
		// The package clause names the package, not its directory.
		"format.Cents call": "shop/internal/fmtx/cents.go#Cents",
		// Another file of the same package, with no import.
		"checkout call": "shop/checkout.go#checkout",
		// A local leads nowhere, and so does the standard library.
		"book.Post call": "nowhere",
		"fmt.Println call": "nowhere",
		"fmt build-dependency": "nowhere",
	});
	expect(await targets("ledger/ledger.go")).toMatchObject({
		"money.Add call": "ledger/money/money.go#Add",
		"audit call": "ledger/audit.go#audit",
	});
	// Two files with other build constraints define it, so neither is the one.
	expect(await targets("ledger/audit.go")).toMatchObject({ "platform call": "nowhere" });
});

test("a test sees its package's names, and a test package imports the package it tests", async () => {
	expect(await targets("ledger/ledger_test.go")).toMatchObject({
		"New call": "ledger/ledger.go#New",
		"audit call": "ledger/audit.go#audit",
	});
	expect(await targets("ledger/ledger_external_test.go")).toMatchObject({
		"ledger.New call": "ledger/ledger.go#New",
	});
});

test("an explicit import alias wins over the package clause even when it matches the path's last element", async () => {
	const aliased = fixtureCheckout({
		"go.mod": "module example.com/demo\n",
		"caller/caller.go":
			'package caller\nimport fmtx "example.com/demo/fmtx"\nfunc Run() { fmtx.Cents() }\n',
		"fmtx/fmtx.go": "package format\nfunc Cents() {}\n",
	});
	try {
		const read = await facts.pass(new AbortController().signal).read(aliased, "caller/caller.go");
		if (read?.adapter !== "go") throw new Error("not read as Go");
		expect(read.references.find((use) => use.symbol === "fmtx.Cents")?.target).toEqual({
			path: "fmtx/fmtx.go",
			symbol: "Cents",
		});
	} finally {
		aliased.remove();
	}
});

test("a go.mod requires the modules of the checkout as build dependencies of their directories", async () => {
	expect(await targets("shop/go.mod")).toEqual({
		"example.com/ledger build-dependency": "ledger/#*",
	});
});

test("an environment value read through the os package is a use of its name", async () => {
	const read = await go("shop/main.go");
	expect(
		read.references.filter((use) => use.via === "environment").map((use) => use.symbol),
	).toEqual(["SHOP_NAME"]);
});
