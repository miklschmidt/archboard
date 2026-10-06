// What a TypeScript module exposes (ADR 0044, TASK-368.10): the names its
// root files export, each followed through re-exports to its definition, or
// the files a package's `exports` names.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts, moduleExposure, moduleOf } from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

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
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * What a module exposes, read in a new pass.
 * @param directory The module.
 * @returns What it exposes.
 */
function exposureOf(directory: string) {
	return moduleExposure(facts.pass(new AbortController().signal), checkout, directory);
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
	const exposure = await exposureOf("src/passing");
	expect(exposure?.exposed.map((each) => [each.name, each.path]).toSorted()).toEqual(
		[
			["readShelf", "src/store/lib/read.ts"],
			["again", "src/store/lib/read.ts"],
			["policy.limit", "src/store/lib/rules.ts"],
			["default", "src/store/index.ts"],
		].toSorted(),
	);
});
