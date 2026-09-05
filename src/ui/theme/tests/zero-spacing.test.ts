import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";

test("the semantic theme emits zero spacing resets used by shared UI", async () => {
	const source = readFileSync(new URL("../app.css", import.meta.url), "utf8");
	const compiler = await compile(
		`${source.slice(source.indexOf("@theme inline"))}\n@tailwind utilities;`,
	);
	const css = compiler.build(["m-0", "p-0", "gap-0", "min-h-0", "min-w-0", "p-1"]);
	for (const [selector, property] of [
		["m-0", "margin"],
		["p-0", "padding"],
		["gap-0", "gap"],
		["min-h-0", "min-height"],
		["min-w-0", "min-width"],
	]) {
		expect(css).toContain(`.${selector} {\n  ${property}: 0px;\n}`);
	}
	expect(css).not.toContain(".p-1 {");
});
