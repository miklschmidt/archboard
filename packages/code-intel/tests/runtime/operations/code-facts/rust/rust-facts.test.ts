// The code facts of Rust files (ADR 0046, TASK-540), read from the fixture
// workspace `fixtures/rust-shop`: items and their members with Rust's
// visibility, uses that lead through `use` paths, `mod` declarations and the
// crates a `Cargo.toml` depends on, and code that did not parse.
//
// The workspace: its root `Cargo.toml` lists the members `crates/*` and the
// workspace dependency `ledger`. The library `ledger` declares the private
// module `entry` (a file) and the public module `money` (a directory), passes
// on `entry::post` renamed `record` and `entry::Entry`, and defines the trait
// `Account`, a `pub(crate)` function, a private one and an exported macro.
// `entry.rs` implements `Account` for `Entry` and calls into `money` and the
// crate's root. The binary `shop` inherits `ledger` from the workspace, and
// its `checkout.rs` calls `record` under the name `book` across the crates.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { definitionSite } from "#runtime/operations/code-facts/definition-site.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { type CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import { fixtureCheckout, fixtureDirectory } from "#tests/runtime/support/code-facts/checkout.ts";
import { asValueOf } from "#tests/runtime/support/code-facts/uses.ts";

const shop = fixtureDirectory("rust-shop");
/** A crate whose modules glob each other's names, and a file that did not parse. */
const globs = fixtureCheckout({
	"Cargo.toml": '[package]\nname = "globs"\nversion = "0.1.0"\n',
	"src/lib.rs": "mod a;\nmod b;\nfn secret() {}\npub fn open() {}\n",
	"src/a.rs": [
		"use super::*;",
		"use crate::b::*;",
		"fn run() {",
		"    secret();",
		"    open();",
		"    shown();",
		"    hidden();",
		"}",
		"",
	].join("\n"),
	"src/b.rs": "fn hidden() {}\npub fn shown() {}\n",
	"src/broken.rs": "pub fn whole() {}\nfn torn( {\n    let lost = 1;\n",
});
const facts = createCodeFacts();

afterAll(() => {
	shop.remove();
	globs.remove();
});

/**
 * Read one Rust file's facts in a pass of their own.
 * @param relative The file.
 * @param checkout The checkout; the fixture workspace when left out.
 * @returns Its facts.
 */
async function rust(relative: string, checkout: CheckoutFiles = shop): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "rust") throw new Error(`${relative} was not read as Rust`);
	return read;
}

/**
 * Where each use of a file leads, by its spelling and evidence kind.
 * @param relative The file.
 * @param checkout The checkout.
 * @returns `file#symbol` for a use that leads somewhere, else `nowhere`.
 */
async function targets(
	relative: string,
	checkout?: CheckoutFiles,
): Promise<Record<string, string>> {
	return Object.fromEntries(
		(await rust(relative, checkout)).references
			.filter((use) => use.via === "code")
			.map((use) => [
				`${use.symbol} ${use.kind ?? ""}`,
				use.target === undefined ? "nowhere" : `${use.target.path}#${use.target.symbol}`,
			]),
	);
}

/**
 * Each definition of a file with its visibility and whether it is exposed.
 * @param relative The file.
 * @returns The definitions by symbol.
 */
async function levels(relative: string): Promise<Record<string, [string, boolean]>> {
	return Object.fromEntries(
		(await rust(relative)).definitions.map((each) => [
			each.symbol,
			[each.visibility, each.exposed],
		]),
	);
}

test("a Rust file defines its items and their members with Rust's visibility, exposed when code outside the file can name them", async () => {
	expect(await levels("crates/ledger/src/lib.rs")).toEqual({
		// A module whose code is in its own file is exposed through what it passes on.
		entry: ["private", false],
		money: ["pub", false],
		Account: ["pub", true],
		// A trait's items take the trait's visibility.
		"Account.balance": ["pub", true],
		"Account.describe": ["pub", true],
		audit: ["pub(crate)", true],
		private_helper: ["private", false],
		cents: ["macro_export", true],
		tests: ["private", false],
		"tests.helps": ["private", false],
	});
	expect(await levels("crates/ledger/src/entry.rs")).toMatchObject({
		Entry: ["pub", true],
		"Entry.amount": ["pub", true],
		"Entry.note": ["private", false],
		// An `impl` block's members belong to its type; a trait's `impl` writes no word.
		"Entry.new": ["pub", true],
		"Entry.noted": ["private", false],
		"Entry.balance": ["impl", true],
	});
	expect(await levels("crates/ledger/src/money/mod.rs")).toMatchObject({
		ZERO: ["pub", true],
		CURRENCY: ["pub", true],
		Cents: ["pub", true],
		"Kind.Debit": ["pub", true],
		"Money.from_cents": ["pub", true],
	});
	const entry = await rust("crates/ledger/src/entry.rs");
	expect(entry.definitions.find((each) => each.symbol === "post")).toMatchObject({
		kind: "function",
		start: 27,
		end: 32,
	});
	// An anchor finds a method by its name, and a trait's provided method in the trait.
	expect(findSymbol(entry, "balance", "definition")).toMatchObject({ status: "found", line: 21 });
	const lib = await rust("crates/ledger/src/lib.rs");
	expect(findSymbol(lib, "Account.describe", "definition")).toMatchObject({ line: 13 });
});

test("a use leads across crates through a renamed import and a re-export, and through paths from the crate, its modules and the crates it depends on", async () => {
	expect(await targets("crates/shop/src/checkout.rs")).toEqual({
		// `use ledger::{record as book}`: the library passes `record` on from `entry`.
		"book call": "crates/ledger/src/lib.rs#record",
		// A trait brought in only for its methods is a use of the trait.
		"Account import": "crates/ledger/src/lib.rs#Account",
		"Money import": "crates/ledger/src/money/mod.rs#Money",
		// A path uses each of its leading parts, and one that names a crate or a module leads to its file.
		"ledger call": "crates/ledger/src/lib.rs#*",
		"ledger.money call": "crates/ledger/src/money/mod.rs#*",
		"ledger.money.Money call": "crates/ledger/src/money/mod.rs#Money",
		"ledger.money.Money.from_cents call": "crates/ledger/src/money/mod.rs#Money.from_cents",
		// `use ledger::money::{self}` brings in the whole module.
		"money call": "crates/ledger/src/money/mod.rs#*",
		"money.ZERO call": "crates/ledger/src/money/mod.rs#ZERO",
		"ledger.cents call": "crates/ledger/src/lib.rs#cents",
		// Locals, and a member only the value's type tells.
		"entry call": "nowhere",
		"entry.balance call": "nowhere",
		"held call": "nowhere",
		"total call": "nowhere",
		"total.cents call": "nowhere",
		".cents call": "nowhere",
	});
	const pass = facts.pass(new AbortController().signal);
	const site = await definitionSite(pass, shop, "crates/shop/src/checkout.rs", "book");
	expect(site).toMatchObject({
		path: "crates/ledger/src/entry.rs",
		definition: { symbol: "post" },
		via: ["crates/ledger/src/lib.rs"],
	});
	expect(await targets("crates/ledger/src/entry.rs")).toMatchObject({
		// `use super::Account` from the crate's root, `crate::money` into its directory.
		"Account import": "crates/ledger/src/lib.rs#Account",
		"Money.from_cents call": "crates/ledger/src/money/mod.rs#Money.from_cents",
		"crate.audit call": "crates/ledger/src/lib.rs#audit",
		// The file's own type, read by name as the file's own.
		"Entry.new call": "nowhere",
	});
	expect(await targets("crates/ledger/src/entry.rs")).not.toHaveProperty("post call");
	// `mod checkout;` brings in the file of the module.
	expect(await targets("crates/shop/src/main.rs")).toEqual({
		"checkout call": "crates/shop/src/checkout.rs#*",
		"checkout.run call": "crates/shop/src/checkout.rs#run",
	});
});

test("a glob brings in every name of a module that holds the file, and only the open names of another", async () => {
	expect(await targets("src/a.rs", globs)).toMatchObject({
		"secret call": "src/lib.rs#secret",
		"open call": "src/lib.rs#open",
		"shown call": "src/b.rs#shown",
		"hidden call": "nowhere",
	});
});

test("a Cargo.toml depends on a local crate by path or through its workspace, and that use leads to the crate's sources", async () => {
	const manifest = await rust("crates/shop/Cargo.toml");
	expect(manifest.definitions.map((each) => [each.symbol, each.visibility])).toEqual([
		["shop", "package"],
	]);
	expect(await targets("crates/shop/Cargo.toml")).toEqual({
		"ledger build-dependency": "crates/ledger/src/#*",
	});
});

test("a call, a macro call and a struct it builds run what they name, and a constant read and a name passed on use it as a value", async () => {
	const asValue = await asValueOf("uses.rs", [
		"fn run() {",
		"    call();",
		"    let made = Made { a: 1 };",
		"    api::read();",
		"    schedule(passed);",
		"    let max = Limits::MAX;",
		"    shout!(loud(), quiet);",
		"}",
	]);
	expect(asValue).toMatchObject({
		call: false,
		Made: false,
		"api.read": false,
		passed: true,
		"Limits.MAX": true,
		shout: false,
		loud: false,
		quiet: true,
	});
});

test("a name written only in code that did not parse is neither found nor absent", async () => {
	const broken = await rust("src/broken.rs", globs);
	expect(findSymbol(broken, "whole", "definition")).toMatchObject({ status: "found" });
	expect(findSymbol(broken, "lost", "definition-or-reference").status).toBe("unparsed");
});

test("public methods of a private type do not become a module interface", async () => {
	const checkout = fixtureCheckout({
		"lib.rs": [
			"struct Hidden;",
			"impl Hidden { pub fn new() -> Self { Self } }",
			"pub struct Visible;",
			"impl Visible { pub fn new() -> Self { Self } }",
		].join("\n"),
	});
	try {
		const read = await rust("lib.rs", checkout);
		expect(read.definitions.filter((each) => each.exposed).map((each) => each.symbol)).toEqual([
			"Visible",
			"Visible.new",
		]);
	} finally {
		checkout.remove();
	}
});
