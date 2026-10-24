// The code facts of TypeScript and TSX files (ADR 0046): definitions with
// their visibility, references with their evidence kind, imports, the strings
// that count as names, and code that did not parse.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { type FileFacts, type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";
import { asValueOf } from "#tests/runtime/support/code-facts/uses.ts";

const checkout = fixtureCheckout({
	"src/ledger.ts": [
		"export class Ledger {",
		"\tpost(): void {}",
		"\tprivate hidden = 1;",
		"\t#secret = 2;",
		"\tprotected guarded(): void {}",
		"}",
		"class Hidden { open(): void {} }",
		"export function settle() { function inner() {} const local = 1; return inner() + local; }",
		"const api = { read() {}, write: () => 1 };",
		"export { api };",
		"export default function main() {}",
		"export interface Port { send(): void }",
		"enum Color { Red }",
		"export namespace Ns { export function inner() {} function secret() {} }",
		"export type Entry = { amount: number };",
		"",
	].join("\n"),
	"src/types.ts": "export interface OnlyTypes { readonly at: string }\n",
	"src/money.ts": "export function round(value: number): number { return value; }\n",
	"src/ports.ts": "export interface Port { send(): void }\n",
	"tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
	"src/api.ts": [
		'import { Ledger, type Entry } from "./ledger";',
		'import type { Port } from "@/ports";',
		'import { OnlyTypes } from "./types";',
		'import * as money from "./money";',
		"// postInComment",
		'const message = "postInString";',
		"export function pay(entry: Entry, port: Port, at: OnlyTypes): string {",
		"\tnew Ledger().post();",
		"\tmoney.round(entry.amount);",
		"\tprocess.env.QUEUE_URL;",
		'\tprocess.env["DEAD_LETTERS"];',
		'\tbus.emit("payment-settled", port);',
		'\twindow.addEventListener("resize", () => at);',
		"\treturn message;",
		"}",
		"",
	].join("\n"),
	"src/barrel.ts": [
		'import { Ledger } from "./ledger";',
		'import { round } from "./money";',
		"export { Ledger, round as rounded };",
		"export default Ledger;",
		"",
	].join("\n"),
	"src/entry.ts": [
		'const { round } = await import("./money");',
		'const ledger = require("./ledger");',
		'const { ...everything } = await import("./types");',
		"round(1);",
		"ledger.settle(everything);",
		"",
	].join("\n"),
	"src/panel.tsx": [
		'import { Badge } from "./badge";',
		'export function Panel() { return <div><Badge tone="calm" /></div>; }',
		"",
	].join("\n"),
	"src/badge.tsx":
		"export function Badge(props: { tone: string }) { return <span>{props.tone}</span>; }\n",
	"src/broken.ts":
		"export function before() {}\nconst a = 1 @ onlyHere @;\nexport function after() {}\n",
	"README.md": "The ledger posts.\n",
	"infra/terraform.tfstate": '{ "secret": "post" }\n',
});
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string): Promise<FileFacts | undefined> {
	return facts.pass(new AbortController().signal).read(checkout, relative);
}

/**
 * Read one file a grammar reads.
 * @param relative The file.
 * @returns Its facts.
 */
async function syntax(relative: string): Promise<SyntaxFacts> {
	const parsed = await read(relative);
	if (parsed?.adapter !== "typescript") throw new Error(`${relative} was not parsed`);
	return parsed;
}

test("a TypeScript file defines its module-level declarations and their members, with TypeScript's visibility", async () => {
	const { definitions } = await syntax("src/ledger.ts");
	const visible = Object.fromEntries(
		definitions.map((definition) => [
			definition.symbol,
			[definition.visibility, definition.exposed],
		]),
	);
	expect(visible).toEqual({
		Ledger: ["export", true],
		"Ledger.post": ["public", true],
		"Ledger.hidden": ["private", false],
		"Ledger.#secret": ["#private", false],
		"Ledger.guarded": ["protected", false],
		Hidden: ["module", false],
		"Hidden.open": ["public", false],
		settle: ["export", true],
		api: ["export", true],
		"api.read": ["public", true],
		"api.write": ["public", true],
		main: ["export default", true],
		Port: ["export", true],
		"Port.send": ["public", true],
		Color: ["module", false],
		"Color.Red": ["public", false],
		Ns: ["export", true],
		"Ns.inner": ["export", true],
		"Ns.secret": ["module", false],
		Entry: ["export", true],
		"Entry.amount": ["public", true],
	});
	expect(definitions.find((definition) => definition.symbol === "Ledger.post")).toMatchObject({
		start: 2,
		end: 2,
	});
});

test("a use at run time is call evidence, a use only as a type is import evidence, and the names an import brings in say which", async () => {
	const api = await syntax("src/api.ts");
	const reference = (symbol: string) => api.references.find((each) => each.symbol === symbol);
	expect(reference("Ledger")).toMatchObject({ kind: "call", typeOnly: false, line: 8 });
	expect(reference("Ledger")?.target).toEqual({ path: "src/ledger.ts", symbol: "Ledger" });
	expect(reference("Entry")).toMatchObject({ kind: "import", typeOnly: true });
	expect(reference("money.round")?.target).toEqual({ path: "src/money.ts", symbol: "round" });
	const imports = Object.fromEntries(api.imports.map((found) => [found.specifier, found]));
	expect(imports["./ledger"]?.names).toEqual([
		{ imported: "Ledger", local: "Ledger", typeOnly: false },
		{ imported: "Entry", local: "Entry", typeOnly: true },
	]);
	expect(imports["./ledger"]?.typeOnly).toBe(false);
	// Written as a value import, used only as a type.
	expect(imports["./types"]?.typeOnly).toBe(true);
	expect(imports["@/ports"]).toMatchObject({ typeOnly: true, resolved: "src/ports.ts" });
	expect(imports["./money"]).toMatchObject({ typeOnly: false, resolved: "src/money.ts" });
});

test("a call, also through a member or a subscript, a construction, a component, a decorator and a base class run what they name, and a constant read, an instanceof test and a name passed on use it as a value", async () => {
	const asValue = await asValueOf("uses.tsx", [
		'import { Base, Failure, LIMIT, call, passed, decorate, api, handlers, Shown } from "./runs";',
		"@decorate",
		"export class Child extends Base {}",
		"export function use(error: unknown) {",
		"\tcall();",
		"\tapi.read();",
		'\thandlers["kind"]();',
		"\tqueueMicrotask(passed);",
		"\tif (error instanceof Failure) return LIMIT;",
		"\treturn <Shown />;",
		"}",
	]);
	expect(asValue).toMatchObject({
		decorate: false,
		Base: false,
		call: false,
		api: false,
		"api.read": false,
		handlers: false,
		Shown: false,
		passed: true,
		Failure: true,
		LIMIT: true,
	});
});

test("an export passes a name on and never uses it, also a name an import brought in, as export ... from does", async () => {
	const barrel = await syntax("src/barrel.ts");
	expect(barrel.references).toEqual([]);
	const ledger = await syntax("src/ledger.ts");
	expect(ledger.references.some((reference) => reference.symbol === "api")).toBe(false);
});

test("a declaration that takes names from import() or require() imports them and declares none, and one with a rest loads the whole file", async () => {
	const entry = await syntax("src/entry.ts");
	const target = (symbol: string) =>
		entry.references.find((each) => each.symbol === symbol)?.target;
	expect(target("round")).toEqual({ path: "src/money.ts", symbol: "round" });
	expect(target("ledger.settle")).toEqual({ path: "src/ledger.ts", symbol: "settle" });
	expect(entry.definitions).toEqual([]);
	expect(entry.imports.find((found) => found.specifier === "./types")?.names).toEqual([]);
});

test("a name in a comment or an ordinary string is no use, and the names of environment values and events are", async () => {
	const api = await syntax("src/api.ts");
	expect(findSymbol(api, "postInComment", "definition-or-reference").status).toBe("absent");
	expect(findSymbol(api, "postInString", "definition-or-reference").status).toBe("absent");
	expect(findSymbol(api, "Ledger.post", "definition-or-reference")).toMatchObject({
		status: "found",
		line: 8,
	});
	const strings = api.references
		.filter((reference) => reference.via !== "code")
		.map((reference) => [reference.via, reference.symbol, reference.kind]);
	expect(strings.toSorted()).toEqual(
		[
			["environment", "QUEUE_URL", undefined],
			["environment", "DEAD_LETTERS", undefined],
			["event", "payment-settled", undefined],
			["event", "resize", undefined],
		].toSorted(),
	);
});

test("a binding symbol must be a definition, and an anchor may be a definition or a reference", async () => {
	const ledger = await syntax("src/ledger.ts");
	const api = await syntax("src/api.ts");
	expect(findSymbol(ledger, "post", "definition")).toMatchObject({ status: "found", line: 2 });
	expect(findSymbol(ledger, "Ledger.post", "definition").status).toBe("found");
	// A local of a function body is no definition of the file.
	expect(findSymbol(ledger, "local", "definition").status).toBe("absent");
	expect(findSymbol(api, "Ledger", "definition").status).toBe("absent");
	expect(findSymbol(api, "Ledger", "definition-or-reference").status).toBe("found");
});

test("a TSX file references the components it renders and not the elements of the host", async () => {
	const panel = await syntax("src/panel.tsx");
	expect(panel.definitions.map((definition) => definition.symbol)).toEqual(["Panel"]);
	expect(panel.references.find((reference) => reference.symbol === "Badge")?.target).toEqual({
		path: "src/badge.tsx",
		symbol: "Badge",
	});
	expect(panel.references.some((reference) => reference.symbol === "div")).toBe(false);
});

test("code that did not parse holds no facts, a name found only there is unparsed, and the rest of the file keeps its facts", async () => {
	const broken = await syntax("src/broken.ts");
	expect(broken.unparsed).toEqual([
		{ start: 2, end: 2, names: expect.arrayContaining(["onlyHere"]) },
	]);
	expect(findSymbol(broken, "onlyHere", "definition-or-reference")).toMatchObject({
		status: "unparsed",
		unparsed: { start: 2, end: 2 },
	});
	expect(findSymbol(broken, "after", "definition")).toMatchObject({ status: "found", line: 3 });
	expect(findSymbol(broken, "missing", "definition-or-reference").status).toBe("absent");
});

test("a regular expression tree-sitter-typescript 0.23.2 cannot parse leaves the rest of its file its facts", async () => {
	// The character class of raw control characters that the grammar failed
	// on in this repository's former SVG writer (ADR 0046).
	const file = "src/primitives.ts";
	const text = [
		"const FORBIDDEN_IN_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\\uD800-\\uDFFF\ufffe\uffff]/gu;",
		"type Attributes = Readonly<Record<string, string>>;",
		"function escapeXml(value: string): string {",
		'\treturn value.replace(FORBIDDEN_IN_XML, "").replace(/&/g, "&amp;");',
		"}",
		"function lines(fragments: readonly string[]): string {",
		'\treturn fragments.join(" ");',
		"}",
		"export { type Attributes, escapeXml, lines };",
		"",
	].join("\n");
	const own = fixtureCheckout({ [file]: text });
	try {
		const primitives = await createCodeFacts().pass(new AbortController().signal).read(own, file);
		if (primitives?.adapter !== "typescript") throw new Error("primitives.ts was not parsed");
		expect(primitives.unparsed.length).toBeGreaterThan(0);
		const unparsedLines = primitives.unparsed.reduce(
			(sum, part) => sum + part.end - part.start + 1,
			0,
		);
		expect(unparsedLines).toBeLessThanOrEqual(2);
		const exported = text
			.match(/^export \{([^}]*)\}/mu)?.[1]
			?.split(",")
			.map((name) => name.replace(/^\s*type\s+/u, "").trim());
		for (const name of exported ?? []) {
			expect(findSymbol(primitives, name, "definition").status).toBe("found");
		}
		expect(exported?.length).toBeGreaterThan(0);
	} finally {
		own.remove();
	}
});

test("a file no grammar reads is read as text, and a file the check never reads is not read", async () => {
	const readme = await read("README.md");
	expect(readme?.adapter).toBe("text");
	if (readme === undefined) throw new Error("README.md was not read");
	expect(findSymbol(readme, "Ledger.posts", "definition").status).toBe("found");
	expect(findSymbol(readme, "post", "definition").status).toBe("absent");
	expect(await read("infra/terraform.tfstate")).toBeUndefined();
	expect(await read("src/unlisted.ts")).toBeUndefined();
});
