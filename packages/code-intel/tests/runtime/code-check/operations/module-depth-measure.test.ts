// The measured grounds of the module findings (TASK-651). A module of eight
// thin functions is shallow. The same module with a file that does not parse
// gets no measured shallow verdict and a skip that names the file, while a wide
// interface stays wide, since its exports are known. A manifest such as a
// `Cargo.toml` holds no logic and leaves the reading complete.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { depthCheckout, depthFindings } from "#tests/runtime/support/code-check/depth-checkout.ts";

/** Eight exported functions with one piece of logic each. */
const THIN = [..."abcdefgh"]
	.map((name) => `export function ${name}(n: number): number {\n\treturn n + 1;\n}\n`)
	.join("");

/**
 * A caller of each of the eight functions of a module.
 * @param module The module's directory.
 * @returns The caller's code.
 */
function caller(module: string): string {
	const names = [..."abcdefgh"].join(", ");
	return `import { ${names} } from "../${module}/index.ts";\nexport const all = [${names}];\n`;
}

/** Twenty-one exported functions with plenty of logic each. */
const WIDE = Array.from(
	{ length: 21 },
	(_, index) =>
		`export function w${index}(n: number): number {\n\treturn n * n + n - 1 + f(n) + g(n);\n}\n`,
).join("");

/** Eight public Rust functions with one piece of logic each. */
const THIN_RUST = [..."abcdefgh"]
	.map((name) => `pub fn ${name}(n: u32) -> u32 {\n    n + 1\n}\n`)
	.join("");

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	shop = await depthCheckout(
		{
			"src/thin/index.ts": THIN,
			"src/broken/index.ts": `${THIN}export function oops(: number {\n`,
			"src/caller/thin.ts": caller("thin"),
			"src/caller/broken.ts": caller("broken"),
			"src/wide/index.ts": `${WIDE}export function oops(: number {\n`,
			"crate/Cargo.toml": '[package]\nname = "thin"\nversion = "0.1.0"\n',
			"crate/src/lib.rs": THIN_RUST,
		},
		{
			Thin: "src/thin",
			Broken: "src/broken",
			Caller: "src/caller",
			Wide: "src/wide",
			Crate: "crate",
		},
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

test("eight names with fewer than four pieces of logic each are shallow, and a file that does not parse leaves no measured finding", () => {
	expect(depthFindings(answer, "Thin")).toContain("(module) MODULE_SHALLOW warning");
	expect(depthFindings(answer, "Broken")).not.toContain("(module) MODULE_SHALLOW warning");
});

test("a file that does not parse names itself in a skip on the module whose shallow verdict it withholds", () => {
	const skip = answer.skipped.find(
		(each) => each.reason === "logic-unparsed" && each.subject?.name === "Broken",
	);
	expect(skip?.detail).toContain("src/broken/index.ts");
	expect(answer.skipped.filter((each) => each.reason === "logic-unparsed")).toHaveLength(1);
});

test("a module with a file that does not parse keeps its wide interface", () => {
	expect(depthFindings(answer, "Wide")).toContain("(module) INTERFACE_WIDE warning");
});

test("a crate's manifest leaves its module's reading complete", () => {
	expect(depthFindings(answer, "Crate")).toContain("(module) MODULE_SHALLOW warning");
});
