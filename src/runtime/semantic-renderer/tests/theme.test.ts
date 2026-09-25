import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { themeColor } from "@/shared/theme/server";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";

const content = orderedFixture({
	nodes: [
		{ id: "one", name: "One", kind: "service" },
		{ id: "two", name: "Two", kind: "service" },
	],
	edges: [{ id: "edge", from: "one", to: "two", kind: "call", traffic: {} }],
});

/**
 * What a document declares on its root element.
 * @param svg The document.
 * @returns Each declared property's value, by name.
 */
function rootDeclarations(svg: string): Map<string, string> {
	const style = /^<svg [^>]*?style="([^"]*)"/u.exec(svg)?.[1] ?? "";
	return new Map(
		style
			.split(";")
			.filter((one) => one !== "")
			.map((one) => [one.slice(0, one.indexOf(":")), one.slice(one.indexOf(":") + 1)]),
	);
}

test("a page's picture is one picture for both themes, and names only the page's tokens", async () => {
	const { svg } = await renderArchitecture({ content, standing: { edge: "added" } });
	expect(rootDeclarations(svg).size).toBe(0);
	const named = new Set([...svg.matchAll(/var\((--[\w-]+)\)/gu)].map((found) => found[1]!));
	expect(named.size).toBeGreaterThan(0);
	// Every token is one the page's stylesheet defines in both themes.
	for (const name of named) {
		for (const theme of ["light", "dark"] as const) {
			expect(() => themeColor(theme, name)).not.toThrow();
		}
	}
});

test("a document that stands alone carries its theme's value of every token it names", async () => {
	for (const theme of ["light", "dark"] as const) {
		const { svg } = await renderArchitecture({ content, theme, standing: { edge: "added" } });
		const declared = rootDeclarations(svg);
		expect(declared.get("color-scheme")).toBe(theme);
		const named = new Set([...svg.matchAll(/var\((--[\w-]+)\)/gu)].map((found) => found[1]!));
		for (const name of named) {
			expect(declared.get(name)).toBe(themeColor(theme, name));
		}
		expect(svg).not.toContain("theme.css");
	}
});
