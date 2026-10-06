// The code facts of Swift files (ADR 0046, TASK-367.12), read from the
// fixture package `fixtures/swift-shop`: definitions with Swift's access
// levels, uses that lead by name through the files of a module and the
// modules a file imports, `Package.swift` read without running it, and code
// that did not parse.
//
// The package: `Package.swift` declares Core (`path:` written out with a
// trailing `/`, named by a library product), Util (by convention) and App,
// which depends on both and on a product of another package, the test target
// CoreTests and a plugin that a product of the same name names. Core holds
// `Ledger`, an extension of it in `Ledger+Refund.swift`, `Money`, a file of
// every access level, `Report.swift`, which uses names of the other files,
// and `Printer.swift`, whose member and parameter share names with them.
// App imports Core and Util; `Broken.swift` uses a module selector and an
// `unsafe` expression, which the grammar does not read, `Platform.swift` an
// `#if` condition it does not read, and `Unclosed.swift` never closes its
// type.

import { afterAll, expect, test } from "bun:test";
import {
	createCodeFacts,
	definitionSite,
	findSymbol,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureDirectory } from "@/runtime/code-facts/tests/checkout";
import { asValueOf } from "@/runtime/code-facts/tests/uses";

const checkout = fixtureDirectory("swift-shop");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one Swift file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function swift(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "swift") throw new Error(`${relative} was not read as Swift`);
	return read;
}

/**
 * Where each use of a file leads, by its spelling and evidence kind.
 * @param relative The file.
 * @returns `file#symbol` for a use that leads somewhere, else `nowhere`.
 */
async function targets(relative: string): Promise<Record<string, string>> {
	return Object.fromEntries(
		(await swift(relative)).references
			.filter((use) => use.via === "code")
			.map((use) => [
				`${use.symbol} ${use.kind ?? ""}`,
				use.target === undefined ? "nowhere" : `${use.target.path}#${use.target.symbol}`,
			]),
	);
}

test("a Swift file defines its declarations and their members with Swift's access level, exposed when another module can use them", async () => {
	const levels = async (file: string) =>
		Object.fromEntries(
			(await swift(file)).definitions.map((each) => [each.symbol, [each.visibility, each.exposed]]),
		);
	expect(await levels("Sources/Core/Access.swift")).toEqual({
		Base: ["open", true],
		"Base.run": ["open", true],
		"Base.step": ["internal", false],
		packaged: ["package", true],
		helper: ["internal", false],
		hidden: ["fileprivate", false],
		secret: ["private", false],
		implicit: ["internal", false],
		isOpen: ["internal", false],
		Closed: ["private", false],
		// Public as written, and still only for the file, because its type is private.
		"Closed.opened": ["public", false],
		Store: ["public", true],
		// A protocol's requirements take its level, its initializers too.
		"Store.init": ["public", true],
		"Store.read": ["public", true],
	});
	expect(await levels("Sources/Core/Ledger.swift")).toMatchObject({
		Ledger: ["public", true],
		"Ledger.entries": ["private", false],
		"Ledger.init": ["public", true],
		"Ledger.make": ["internal", false],
		"Ledger.Kind.debit": ["public", true],
		"Ledger.Draft.write": ["fileprivate", false],
	});
	// An extension's members belong to the type it extends, at the level the extension states.
	expect(await levels("Sources/Core/Ledger+Refund.swift")).toEqual({
		"Ledger.refund": ["public", true],
		"Ledger.audit": ["internal", false],
	});
	const ledger = await swift("Sources/Core/Ledger.swift");
	expect(ledger.definitions.find((each) => each.symbol === "Ledger.post")).toMatchObject({
		start: 9,
		end: 11,
	});
});

test("a use leads by name to the one other file of its module that defines it, extensions in other files included", async () => {
	expect(await targets("Sources/Core/Report.swift")).toMatchObject({
		"helper call": "Sources/Core/Access.swift#helper",
		// File-private to Access.swift, so no other file reaches it.
		"hidden call": "nowhere",
		"Ledger.make call": "Sources/Core/Ledger.swift#Ledger.make",
		"Money call": "Sources/Core/Money.swift#Money",
		// Money.swift extends String with an initializer, and String's own are not read.
		"String.init call": "nowhere",
		// A use behind a prefix operator.
		"isOpen call": "Sources/Core/Access.swift#isOpen",
		// A member of a call's result is no name of the module.
		".post call": "nowhere",
	});
	// The member helper, reached through self and implicitly, and the parameter
	// isOpen are not the module's functions of those names.
	expect(await targets("Sources/Core/Printer.swift")).toMatchObject({
		".helper call": "nowhere",
		"helper call": "nowhere",
		"isOpen call": "nowhere",
	});
	expect(await targets("Sources/Core/Ledger.swift")).toMatchObject({
		// The file defines Ledger itself, and an extension in another file defines Ledger.audit.
		"Ledger call": "nowhere",
		"Ledger.audit call": "Sources/Core/Ledger+Refund.swift#Ledger.audit",
		"Money import": "Sources/Core/Money.swift#Money",
	});
	const site = await definitionSite(
		facts.pass(new AbortController().signal),
		checkout,
		"Sources/Core/Ledger.swift",
		"Ledger.audit",
	);
	expect(site).toMatchObject({ path: "Sources/Core/Ledger+Refund.swift" });
});

test("a use leads into a module the file imports only to what that module exposes, and an import of a dependency the manifest declares leads to its directory", async () => {
	expect(await targets("Sources/App/main.swift")).toEqual({
		"Foundation build-dependency": "nowhere",
		"Core build-dependency": "Sources/Core/#*",
		"Util build-dependency": "Sources/Util/#*",
		"Ledger call": "Sources/Core/Ledger.swift#Ledger",
		"Money import": "Sources/Core/Money.swift#Money",
		"Ledger.refund call": "Sources/Core/Ledger+Refund.swift#Ledger.refund",
		"Core call": "nowhere",
		"Core.Ledger call": "Sources/Core/Ledger.swift#Ledger",
		"Core.Ledger.Kind call": "Sources/Core/Ledger.swift#Ledger.Kind",
		"Core.Ledger.Kind.debit call": "Sources/Core/Ledger.swift#Ledger.Kind.debit",
		"print call": "nowhere",
		"ledger call": "nowhere",
		"ledger.post call": "nowhere",
		// The file's own `let refund`.
		"refund call": "nowhere",
		// Internal and file-private names of Core are not Core's to give.
		"helper call": "nowhere",
		"hidden call": "nowhere",
		// Defined after code of Broken.swift that did not parse, where it may stand in the wrong place.
		"alsoOk call": "nowhere",
	});
	expect((await swift("Sources/App/main.swift")).imports.map((each) => each.specifier)).toEqual([
		"Foundation",
		"Core",
		"Util",
	]);
});

test("a call, a construction and an attribute run what they name, and a static member read, a subscript read and a name passed on use it as a value", async () => {
	const asValue = await asValueOf("Uses.swift", [
		"@Wrapped var wrapped = 1",
		"func use() -> Int {",
		"\tcall()",
		"\tlet made = Made()",
		"\tApi.shared.read()",
		"\tschedule(passed)",
		'\tlet first = Table["k"]',
		"\treturn Limits.max",
		"}",
	]);
	expect(asValue).toMatchObject({
		Wrapped: false,
		call: false,
		Made: false,
		Api: false,
		"Api.shared.read": false,
		passed: true,
		Table: true,
		Limits: true,
		"Limits.max": true,
	});
});

test("Package.swift is read without running it: its targets are definitions and their dependencies lead to the modules' directories", async () => {
	const manifest = await swift("Package.swift");
	expect(
		manifest.definitions
			.filter((each) => each.symbol !== "package")
			.map((each) => [each.symbol, each.visibility, each.exposed]),
	).toEqual([
		["Core", "target", true],
		["Util", "target", false],
		["App", "executableTarget", false],
		["CoreTests", "testTarget", false],
		// Declared once, though a product of the same name names it.
		["ShopPlugin", "plugin", false],
	]);
	const dependencies = manifest.references.filter((use) => use.kind === "build-dependency");
	expect(dependencies.map((use) => [use.symbol, use.line, use.target?.path ?? "nowhere"])).toEqual([
		["PackageDescription", 2, "nowhere"],
		["Core", 19, "Sources/Core/"],
		["Util", 20, "Sources/Util/"],
		// A product of another package.
		["ArgumentParser", 21, "nowhere"],
		["Core", 24, "Sources/Core/"],
	]);
});

test("after a part of a Swift file that did not parse, a name the reading does not find is unknown, never absent", async () => {
	const broken = await swift("Sources/App/Broken.swift");
	expect(broken.unparsed.map(({ start, end }) => [start, end])).toEqual([[2, 23]]);
	expect(broken.definitions.map((each) => each.symbol)).toEqual([
		"ok",
		"selected",
		"alsoOk",
		"Table.count",
	]);
	expect(broken.references.some((use) => use.symbol === "ok" && use.line === 3)).toBe(true);
	// The grammar puts `last` inside `count`, after the `unsafe` it could not read.
	expect(findSymbol(broken, "Table.last", "definition").status).toBe("unparsed");
	expect(findSymbol(broken, "Table.gone", "definition").status).toBe("absent");
	// A condition the grammar does not read closes the type early, before any error.
	const platform = await swift("Sources/App/Platform.swift");
	expect(findSymbol(platform, "Platform.describe", "definition").status).toBe("unparsed");
	// A file whose whole tree is an error holds no definitions, not the local it would read at file level.
	const unclosed = await swift("Sources/App/Unclosed.swift");
	expect(unclosed.definitions).toEqual([]);
	expect(findSymbol(unclosed, "Draft.write", "definition").status).toBe("unparsed");
});

test("the name of an environment value a Swift file reads is a reference", async () => {
	const format = await swift("Sources/Util/Format.swift");
	expect(format.references.filter((use) => use.via === "environment")).toEqual([
		{ symbol: "SHOP_TOKEN", line: 2, via: "environment", typeOnly: false },
	]);
});
