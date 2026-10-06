// Where imports lead (ADR 0046): through `tsconfig.json` paths, `extends` and
// `baseUrl`, and through re-exports to the file that defines a symbol. And
// the cache: one entry per file, keyed on its bytes, read again on a pass over
// unchanged files and parsed again after an edit, with one parse in each turn
// of the event loop.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts, definitionSite, type SyntaxFacts } from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureCheckout({
	"tsconfig.base.json": [
		"{",
		"\t// The alias every source file uses.",
		'\t"compilerOptions": { "paths": { "@/*": ["./src/*"], "@lib": ["./src/lib/y.ts"] } },',
		"}",
	].join("\n"),
	"tsconfig.json": '{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }\n',
	"src/lib/y.ts": "export const y = 1;\n",
	"src/lib/z.ts": "export const z = 1;\n",
	"src/dir/index.ts": "export const d = 1;\n",
	"src/app/x.ts": [
		'import { y } from "@/lib/y";',
		'import { z } from "@/lib/z.js";',
		'import { d } from "@/dir";',
		'import { y as again } from "../lib/y";',
		'import { y as exact } from "@lib";',
		'import React from "react";',
		'import fs from "node:fs";',
		'const later = await import("@/lib/z");',
		"",
	].join("\n"),
	"tools/tsconfig.json": '{ "compilerOptions": { "baseUrl": "./src" } }\n',
	"tools/src/util.ts": "export const util = 1;\n",
	"tools/main.ts": 'import { util } from "util";\n',
	"exact/tsconfig.json":
		'{ "compilerOptions": { "paths": { "*": ["./shadow/*"], "lib": ["./real/lib.ts"] } } }\n',
	"exact/shadow/lib.ts": "export const lib = 0;\n",
	"exact/real/lib.ts": "export const lib = 1;\n",
	"exact/main.ts": 'import { lib } from "lib";\n',
	"src/store/lib/write.ts":
		"export function settle(): void {}\nexport class Ledger { post(): void {} }\n",
	"src/store/lib/all.ts": "export function everything(): void {}\n",
	"src/store/lib/main.ts": "class Main { run(): void {} }\nexport { Main as default };\n",
	"src/store/index.ts": [
		'export { settle } from "@/store/lib/write";',
		'export { Ledger as Book } from "./lib/write";',
		'export * from "./lib/all";',
		'export { default as Main } from "./lib/main";',
		"",
	].join("\n"),
	"src/route.ts": [
		'import { settle, Book, everything, Main } from "@/store/index";',
		'import * as store from "@/store/index";',
		"export function own(): void {}",
		"settle(); everything(); new Book().post(); store.settle(); own(); new Main().run();",
		"external.call(); external.settle();",
		"",
	].join("\n"),
});

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file a grammar reads, in a pass of its own.
 * @param relative The file.
 * @returns Its facts.
 */
async function syntax(relative: string): Promise<SyntaxFacts> {
	const read = await createCodeFacts().pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "typescript") throw new Error(`${relative} was not parsed`);
	return read;
}

test("imports resolve through tsconfig paths and their extends, written extensions and directory indexes, and a package resolves to no file", async () => {
	const x = await syntax("src/app/x.ts");
	expect(Object.fromEntries(x.imports.map((found) => [found.specifier, found.resolved]))).toEqual({
		"@/lib/y": "src/lib/y.ts",
		"@/lib/z.js": "src/lib/z.ts",
		"@/dir": "src/dir/index.ts",
		"../lib/y": "src/lib/y.ts",
		"@lib": "src/lib/y.ts",
		react: undefined,
		"node:fs": undefined,
		"@/lib/z": "src/lib/z.ts",
	});
});

test("the nearest tsconfig.json governs a file: its baseUrl resolves a bare specifier, and a paths pattern that names the specifier exactly comes before a star", async () => {
	const tools = await syntax("tools/main.ts");
	expect(tools.imports.map((found) => found.resolved)).toEqual(["tools/src/util.ts"]);
	const exact = await syntax("exact/main.ts");
	expect(exact.imports.map((found) => found.resolved)).toEqual(["exact/real/lib.ts"]);
});

test("a symbol is defined in the file itself or where its import and every re-export on the way lead", async () => {
	const pass = createCodeFacts().pass(new AbortController().signal);
	const site = (symbol: string) => definitionSite(pass, checkout, "src/route.ts", symbol);
	expect(await site("own")).toMatchObject({ path: "src/route.ts", via: [] });
	expect(await site("settle")).toMatchObject({
		path: "src/store/lib/write.ts",
		definition: { symbol: "settle", start: 1 },
		via: ["src/store/index.ts"],
	});
	expect(await site("everything")).toMatchObject({
		path: "src/store/lib/all.ts",
		via: ["src/store/index.ts"],
	});
	// Imported as Book, which the index passes on from Ledger.
	expect(await site("Book.post")).toMatchObject({
		path: "src/store/lib/write.ts",
		definition: { symbol: "Ledger.post", start: 2 },
	});
	expect(await site("store.settle")).toMatchObject({ path: "src/store/lib/write.ts" });
	// The index passes on the default export of main.ts, which names Main.
	expect(await site("Main.run")).toMatchObject({
		path: "src/store/lib/main.ts",
		definition: { symbol: "Main.run" },
	});
	// A name reached only through a value names no file, even where an import shares its last name.
	expect(await site("external.call")).toBeUndefined();
	expect(await site("external.settle")).toBeUndefined();
	expect(await site("post")).toBeUndefined();
});

test("a second pass over unchanged files reads the cache, and an edit is parsed again", async () => {
	const facts = createCodeFacts();
	const files = ["src/lib/y.ts", "src/lib/z.ts", "src/app/x.ts"];
	/**
	 * Read the files in a pass of their own.
	 * @returns The pass's counts and the facts of y.ts.
	 */
	const run = async () => {
		const pass = facts.pass(new AbortController().signal);
		const read = await Promise.all(files.map((file) => pass.read(checkout, file)));
		return { stats: { ...pass.stats }, y: read[0] };
	};
	const first = await run();
	expect(first.stats).toMatchObject({ read: 3, parsed: 3, cached: 0 });
	const second = await run();
	expect(second.stats).toMatchObject({ read: 3, parsed: 0, cached: 3 });
	expect(second.y).toEqual(first.y);
	checkout.write("src/lib/y.ts", "export const y = 2;\nexport const added = 3;\n");
	const third = await run();
	expect(third.stats).toMatchObject({ read: 3, parsed: 1, cached: 2 });
	expect(
		third.y?.adapter === "typescript" && third.y.definitions.map((each) => each.symbol),
	).toEqual(["y", "added"]);
});

test("files read together parse one at a time, with a turn of the event loop between two parses", async () => {
	const facts = createCodeFacts();
	const signal = new AbortController().signal;
	// The grammars load once per process; load them before counting.
	await facts.pass(signal).read(checkout, "src/lib/y.ts");
	const pass = facts.pass(signal);
	const files = [...checkout.files].filter(
		(file) => file.endsWith(".ts") && file !== "src/lib/y.ts",
	);
	let reading = true;
	let counted = 0;
	let most = 0;
	/** Count the parses since the last turn of the loop, once a turn. */
	const sample = (): void => {
		most = Math.max(most, pass.stats.parsed - counted);
		counted = pass.stats.parsed;
		if (reading) setImmediate(sample);
	};
	setImmediate(sample);
	await Promise.all(files.map((file) => pass.read(checkout, file)));
	reading = false;
	sample();
	expect(pass.stats.parsed).toBe(files.length);
	expect(most).toBe(1);
});

test("a cancelled pass reads nothing more", async () => {
	const controller = new AbortController();
	const pass = createCodeFacts().pass(controller.signal);
	controller.abort();
	await expect(pass.read(checkout, "src/lib/y.ts")).rejects.toThrow();
});
