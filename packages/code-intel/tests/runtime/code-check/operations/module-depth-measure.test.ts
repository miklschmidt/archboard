// The measured ground of `MODULE_SHALLOW` (TASK-651, TASK-659, ADR 0082): W > 0
// names with fewer than 4W pieces of logic behind them, at any width. The same
// 30 operations are shallow or deep alike as one module, as two, and behind
// one key: a cut leaves a shallow part, and a switchboard counts one name for
// each operation it picks, in TypeScript and Rust, with what only picks left
// out of its logic. A key typed by a type the check cannot close withholds a
// verdict it would flip, and a file that does not parse withholds the verdict
// its counted logic would give.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import {
	depthByModule,
	depthCheckout,
	depthFindings,
} from "#tests/runtime/support/code-check/depth-checkout.ts";

/**
 * Operations `o<from>` to `o<to - 1>`, four pieces of logic each, or three
 * for `o0` when the whole is just below four per name.
 * @param from The first.
 * @param to The end.
 * @param below Whether `o0` has three.
 * @param exported Whether each is exported.
 * @returns The code.
 */
function operations(from: number, to: number, below: boolean, exported = true): string {
	return Array.from({ length: to - from }, (_, index) => {
		const at = from + index;
		const math = below && at === 0 ? "n * 2 + n - 1" : "n * 2 + n - 1 + n";
		return `${exported ? "export " : ""}function o${at}(n: number): number {\n\treturn ${math};\n}\n`;
	}).join("");
}

/**
 * The 30 operations behind one exported function that picks by a closed key.
 * @param below Whether the logic is just below four per name.
 * @returns The code.
 */
function selector(below: boolean): string {
	const keys = Array.from({ length: 30 }, (_, at) => `"o${at}"`);
	const cases = keys.map((key, at) => `\t\tcase ${key}:\n\t\t\treturn o${at}(n);\n`).join("");
	return [
		`type Op = ${keys.join(" | ")};`,
		`export function run(op: Op, n: number): number {\n\tswitch (op) {\n${cases}\t}\n}`,
		operations(0, 30, below, false),
	].join("\n");
}

/** Three private operations of two pieces of logic each, picked by `kind`. */
const PICKED = [
	"export function pick(kind: Kind, n: number): number {",
	'\tif (kind === "a") return one(n);',
	'\tif (kind === "b") return two(n);',
	"\treturn three(n);",
	"}",
	"function one(n: number): number {\n\treturn n + 1 + 1;\n}",
	"function two(n: number): number {\n\treturn n + 2 + 2;\n}",
	"function three(n: number): number {\n\treturn n + 3 + 3;\n}",
	"",
].join("\n");

/** Eight public Rust functions with one piece of logic each. */
const THIN_RUST = [..."abcdefgh"]
	.map((name) => `pub fn ${name}(n: u32) -> u32 {\n    n + 1\n}\n`)
	.join("");

/** A Rust function that picks one of two operations by an enum. */
const RUST_PICK = [
	"pub enum Part {\n    Card,\n    Frame { wide: bool },\n}",
	"pub fn measure(part: Part, n: u32) -> u32 {",
	"    match part {",
	"        Part::Card => card(n),",
	"        Part::Frame { wide } => frame(n, wide),",
	"    }",
	"}",
	"fn card(n: u32) -> u32 {\n    n * 2 + n * 3 + n * 4 + n * 5 + 1\n}",
	"fn frame(n: u32, wide: bool) -> u32 {\n    if wide { n * 2 + n * 3 + n * 4 } else { n + 1 }\n}",
	"",
].join("\n");

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	const files: Record<string, string> = {
		"src/thin/index.ts": operations(0, 4, false).replaceAll("n * 2 + n - 1 + n", "n + 1"),
		"src/broken/index.ts": `${operations(0, 4, false).replaceAll("n * 2 + n - 1 + n", "n + 1")}export function oops(: number {\n`,
		"src/kinds/index.ts": 'export type Kind = "a" | "b" | "c";\n',
		"src/keys/index.ts": `import type { Kind } from "../kinds/index.ts";\n${PICKED}`,
		"src/aliases/pick.ts": `import type { Kind } from "../kinds/index.ts";\n${PICKED}`,
		"src/aliases/index.ts": 'export { pick, pick as choose } from "./pick.ts";\n',
		"src/barrel/index.ts": 'export { pick } from "../keys/index.ts";\n',
		"src/unclosed/index.ts": `import type { Kind } from "elsewhere";\n${PICKED}`,
		"crate/Cargo.toml": '[package]\nname = "thin"\nversion = "0.1.0"\n',
		"crate/src/lib.rs": THIN_RUST,
		"picker/Cargo.toml": '[package]\nname = "picker"\nversion = "0.1.0"\n',
		"picker/src/lib.rs": RUST_PICK,
	};
	const modules: Record<string, string> = {
		Thin: "src/thin",
		Broken: "src/broken",
		Kinds: "src/kinds",
		Keys: "src/keys",
		Aliases: "src/aliases",
		Barrel: "src/barrel",
		Unclosed: "src/unclosed",
		Crate: "crate",
		Picker: "picker",
	};
	for (const [shape, below] of [
		["Lo", true],
		["At", false],
	] as const) {
		files[`src/whole${shape}/index.ts`] = operations(0, 30, below);
		files[`src/first${shape}/index.ts`] = operations(0, 15, below);
		files[`src/second${shape}/index.ts`] = operations(15, 30, below);
		files[`src/picked${shape}/index.ts`] = selector(below);
		for (const each of ["whole", "first", "second", "picked"]) {
			modules[`${each}${shape}`] = `src/${each}${shape}`;
		}
	}
	shop = await depthCheckout(files, modules);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

/**
 * Whether the check finds a module shallow.
 * @param name The module.
 * @returns True when it does.
 */
function shallow(name: string): boolean {
	return depthFindings(answer, name).includes("(module) MODULE_SHALLOW warning");
}

test("the same 30 operations are shallow just below four per name, as one module, cut in two, or behind one key", () => {
	expect(["wholeLo", "pickedLo"].map(shallow)).toEqual([true, true]);
	// A cut leaves a shallow part.
	expect(["firstLo", "secondLo"].map(shallow)).toEqual([true, false]);
	const depth = depthByModule(answer);
	expect([depth.get("wholeLo")?.width, depth.get("wholeLo")?.logic]).toEqual([30, 119]);
	expect([depth.get("pickedLo")?.width, depth.get("pickedLo")?.logic]).toEqual([30, 119]);
});

test("the same 30 operations at four per name pass, as one module, cut in two, or behind one key", () => {
	expect(["wholeAt", "firstAt", "secondAt", "pickedAt"].map(shallow)).toEqual([
		false,
		false,
		false,
		false,
	]);
});

test("no width exempts a module: four thin names are shallow", () => {
	expect(shallow("Thin")).toBe(true);
});

test("a switchboard whose key an imported type closes counts each operation it picks, and the finding names them", () => {
	const keys = depthByModule(answer).get("Keys");
	expect(keys?.width).toBe(3);
	expect(keys?.switchboards).toEqual([
		{
			name: "pick",
			path: "src/keys/index.ts",
			key: "kind",
			operations: [
				{ keys: ["a"], line: 3 },
				{ keys: ["b"], line: 4 },
				{ keys: ["c"], line: 5 },
			],
		},
	]);
	const finding = answer.findings.find(
		(each) => each.subject?.name === "Keys" && each.code === "MODULE_SHALLOW",
	);
	expect(finding?.message).toContain("pick picks 3 by its key (a, b, c)");
});

test("switchboard re-exports add width and discount a counted body only once", () => {
	const depth = depthByModule(answer);
	const aliases = depth.get("Aliases");
	const barrel = depth.get("Barrel");
	expect(aliases?.width).toBe(6);
	expect(aliases?.logic).toBe(depth.get("Keys")?.logic);
	expect(barrel?.width).toBe(3);
	expect(barrel?.logic).toBe(0);
});

test("a key no type closes counts one name, and withholds the shallow verdict counting its operations would give", () => {
	const unclosed = depthByModule(answer).get("Unclosed");
	expect(unclosed?.width).toBe(1);
	expect(unclosed?.switchboards[0]?.open).toBe("Kind");
	expect(shallow("Unclosed")).toBe(false);
	const skip = answer.skipped.find(
		(each) => each.reason === "key-unclosed" && each.subject?.name === "Unclosed",
	);
	expect(skip?.detail).toBe("pick: Kind");
});

test("a Rust function that matches an enum parameter counts each variant's operation", () => {
	const picker = depthByModule(answer).get("Picker");
	expect(picker?.width).toBe(2);
	expect(
		picker?.switchboards.map((each) => each.operations.map((operation) => operation.keys)),
	).toEqual([[["Card"], ["Frame"]]]);
	expect(shallow("Picker")).toBe(false);
});

test("a file that does not parse names itself in a skip on the module whose shallow verdict it withholds", () => {
	expect(shallow("Broken")).toBe(false);
	const skip = answer.skipped.find(
		(each) => each.reason === "logic-unparsed" && each.subject?.name === "Broken",
	);
	expect(skip?.detail).toContain("src/broken/index.ts");
	expect(answer.skipped.filter((each) => each.reason === "logic-unparsed")).toHaveLength(1);
});

test("a crate's manifest leaves its module's reading complete", () => {
	expect(shallow("Crate")).toBe(true);
});
