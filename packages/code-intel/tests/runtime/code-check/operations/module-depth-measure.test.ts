// The measured grounds of the module findings (TASK-651) stand only on a
// complete reading: a module of eight thin functions is shallow, and the same
// module with a file that does not parse gets no measured finding.

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

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	shop = await depthCheckout(
		{
			"src/thin/index.ts": THIN,
			"src/broken/index.ts": `${THIN}export function oops(: number {\n`,
			"src/caller/thin.ts": caller("thin"),
			"src/caller/broken.ts": caller("broken"),
		},
		{ Thin: "src/thin", Broken: "src/broken", Caller: "src/caller" },
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
