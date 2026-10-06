// What a module exposes (ADR 0044, TASK-368.10): the names its root files
// expose, each followed through re-exports to its definition. A TypeScript
// module's root files are what a package's `exports` names, else the files
// directly in its directory; a Python package's is its `__init__.py`, read
// from the fixture package `fixtures/python-shop`; a Swift module is a target
// of the package `fixtures/swift-shop`, all of whose files are root files; a
// C or C++ module's are its public headers, read from the fixture project
// `fixtures/c-shop`.

import { afterAll, expect, test } from "bun:test";
import {
	type CheckoutFiles,
	createCodeFacts,
	moduleExposure,
	moduleOf,
} from "@/runtime/code-facts/index";
import { fixtureCheckout, fixtureDirectory } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureCheckout({
	"src/store/index.ts": [
		'export { readShelf as read } from "./lib/read";',
		'export * from "./lib/write";',
		'export * as rules from "./lib/rules";',
		'export { cycle } from "./lib/cycle-a";',
		"export class Ledger { post(): void {} private hidden(): void {} }",
		"export default function main(): void {}",
		"function privateHelper(): void {}",
		"",
	].join("\n"),
	"src/store/client.ts": "export const client = 1;\n",
	"src/store/lib/read.ts":
		"export function readShelf(): void {}\nexport function unlisted(): void {}\n",
	"src/store/lib/write.ts":
		"export function writeShelf(): void {}\nexport default function dropped(): void {}\n",
	"src/store/lib/rules.ts": "export const limit = 3;\n",
	"src/store/lib/cycle-a.ts": 'export * from "./cycle-b";\nexport const cycle = 1;\n',
	"src/store/lib/cycle-b.ts": 'export * from "./cycle-a";\n',
	"src/server/routes.ts": 'import { read } from "../store";\nexport const route = read;\n',
	"src/server/notes.md": "# notes\n",
	"packages/kit/package.json": JSON.stringify({
		exports: { ".": { import: "./src/main.js" }, "./parts/*": "./src/parts/*.js" },
	}),
	"packages/kit/src/main.ts": "export const main = 1;\n",
	"packages/kit/src/parts/one.ts": "export const one = 1;\n",
	"packages/kit/src/private.ts": "export const hidden = 1;\n",
	"packages/kit/setup.ts": "export const setup = 1;\n",
	"packages/built/package.json": JSON.stringify({ exports: "./dist/index.js" }),
	"packages/built/src/index.ts": "export const built = 1;\n",
	// Exports names it imports, as export ... from would pass them on.
	"src/passing/index.ts": [
		'import { readShelf } from "../store/lib/read";',
		'import * as rules from "../store/lib/rules";',
		'import main from "../store/index";',
		"export { readShelf, readShelf as again, rules as policy };",
		"export default main;",
		"",
	].join("\n"),
});
const pythonShop = fixtureDirectory("python-shop");
const swiftShop = fixtureDirectory("swift-shop");
const cShop = fixtureDirectory("c-shop");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
	pythonShop.remove();
	swiftShop.remove();
	cShop.remove();
});

/**
 * What a module exposes, read in a new pass.
 * @param directory The module.
 * @param from The checkout; the TypeScript one when left out.
 * @returns What it exposes.
 */
function exposureOf(directory: string, from: CheckoutFiles = checkout) {
	return moduleExposure(facts.pass(new AbortController().signal), from, directory);
}

/**
 * Each name a module exposes and the file that defines it, sorted.
 * @param directory The module.
 * @param from The checkout.
 * @returns The names and their files.
 */
async function namesOf(directory: string, from?: CheckoutFiles) {
	const exposure = await exposureOf(directory, from);
	return exposure?.exposed.map((each) => [each.name, each.path]).toSorted();
}

test("a module is a directory, and an index file stands for the directory that holds it", () => {
	expect(moduleOf("src/store", "directory")).toBe("src/store");
	expect(moduleOf("src/store/index.ts", "file")).toBe("src/store");
	expect(moduleOf("index.tsx", "file")).toBe("");
	expect(moduleOf("src/store/lib/read.ts", "file")).toBeUndefined();
});

test("a module exposes what its root files export, each name followed to its definition", async () => {
	const exposure = await exposureOf("src/store");
	expect(exposure?.rootFiles).toEqual(["src/store/client.ts", "src/store/index.ts"]);
	const names = exposure?.exposed.map((each) => [each.name, each.path, each.definition.symbol]);
	expect(names?.toSorted()).toEqual(
		[
			["client", "src/store/client.ts", "client"],
			["Ledger", "src/store/index.ts", "Ledger"],
			["Ledger.post", "src/store/index.ts", "Ledger.post"],
			["default", "src/store/index.ts", "main"],
			["read", "src/store/lib/read.ts", "readShelf"],
			["writeShelf", "src/store/lib/write.ts", "writeShelf"],
			["rules.limit", "src/store/lib/rules.ts", "limit"],
			["cycle", "src/store/lib/cycle-a.ts", "cycle"],
		].toSorted(),
	);
	const read = exposure?.exposed.find((each) => each.name === "read");
	expect(read?.via).toEqual(["src/store/index.ts"]);
});

test("a module's callers can be in every file outside it written in its language", async () => {
	const exposure = await exposureOf("src/store");
	expect(exposure?.outside).toContain("src/server/routes.ts");
	expect(exposure?.outside).not.toContain("src/server/notes.md");
	expect(exposure?.outside.some((file) => file.startsWith("src/store/"))).toBe(false);
});

test("a package's exports names its root files, and exports that name only built output expose nothing the check can read", async () => {
	const kit = await exposureOf("packages/kit");
	expect(kit?.rootFiles).toEqual(["packages/kit/src/main.ts", "packages/kit/src/parts/one.ts"]);
	expect(kit?.exposed.map((each) => each.name)).toEqual(["main", "one"]);
	expect(await exposureOf("packages/built")).toBeUndefined();
});

test("a root file exposes a name it imports and exports, under the name it exports it by", async () => {
	expect(await namesOf("src/passing")).toEqual(
		[
			["readShelf", "src/store/lib/read.ts"],
			["again", "src/store/lib/read.ts"],
			["policy.limit", "src/store/lib/rules.ts"],
			["default", "src/store/index.ts"],
		].toSorted(),
	);
});

test("a Python package is its directory, and its __init__.py exposes what __all__ lists, or else each public name it defines or imports", async () => {
	expect(moduleOf("lib/ledger/__init__.py", "file")).toBe("lib/ledger");
	const ledger = await exposureOf("lib/ledger", pythonShop);
	expect(ledger?.rootFiles).toEqual(["lib/ledger/__init__.py"]);
	// __all__ lists Ledger, from book.py, and the submodule money; book.py's helper is not in its own __all__.
	expect(await namesOf("lib/ledger", pythonShop)).toEqual(
		[
			["Ledger", "lib/ledger/book.py"],
			["Ledger.__init__", "lib/ledger/book.py"],
			["Ledger.post", "lib/ledger/book.py"],
			["Ledger.rate", "lib/ledger/book.py"],
			["money.round_amount", "lib/ledger/money.py"],
		].toSorted(),
	);
	// No __all__: the public name it imports is passed on, and _first is not.
	expect(await namesOf("lib/checkout", pythonShop)).toEqual([["pay", "lib/checkout/pay.py"]]);
	expect(ledger?.outside).toContain("tools/report.py");
	expect(ledger?.outside.some((file) => file.startsWith("lib/ledger/"))).toBe(false);
	// A directory with no __init__.py is no package.
	expect(await exposureOf("tools", pythonShop)).toBeUndefined();
});

test("a Swift module is a target of its package, and exposes the open, public and package declarations of its files", async () => {
	expect(moduleOf("Sources/Core/Ledger.swift", "file")).toBeUndefined();
	const core = await exposureOf("Sources/Core", swiftShop);
	expect(core?.rootFiles).toContain("Sources/Core/Ledger+Refund.swift");
	const exposed = new Map(core?.exposed.map((each) => [each.name, each.path]));
	expect([...exposed.keys()].filter((name) => !name.includes(".")).toSorted()).toEqual(
		["Base", "Ledger", "Money", "Store", "packaged"].toSorted(),
	);
	// A public extension's member is exposed from the extension's file.
	expect(exposed.get("Ledger.refund")).toBe("Sources/Core/Ledger+Refund.swift");
	expect(exposed.has("Ledger.audit")).toBe(false);
	expect(core?.outside).toContain("Sources/App/main.swift");
	expect(core?.outside.some((file) => file.startsWith("Sources/Core/"))).toBe(false);
	// Sources holds every target and is none.
	expect(await exposureOf("Sources", swiftShop)).toBeUndefined();
});

test("a C or C++ module's root files are the headers under its include directory, else the headers beside their source files", async () => {
	// No file stands for a C or C++ module.
	expect(moduleOf("src/ledger.c", "file")).toBeUndefined();
	const src = await exposureOf("src", cShop);
	expect(src?.rootFiles).toEqual(["src/money.h"]);
	// A prototype is exposed where its source file defines it, passed on by the header.
	expect(await namesOf("src", cShop)).toEqual([
		["money_round", "src/money.c"],
		["money_t", "src/money.h"],
	]);
	expect(src?.exposed.find((each) => each.name === "money_round")?.via).toEqual(["src/money.h"]);
	expect(src?.outside).toContain("cpp/app.cpp");
	expect(src?.outside.some((file) => file.startsWith("src/"))).toBe(false);
	// The project publishes its headers under include/.
	expect((await exposureOf("", cShop))?.rootFiles).toEqual(["include/shop/ledger.h"]);
	// Every header of built/ is in a subfolder: the module has no public header.
	expect(await exposureOf("built", cShop)).toBeUndefined();
});
