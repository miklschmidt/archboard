import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { themeColor } from "#runtime/store/theme/source.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

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

/**
 * Every token a document names: what it reads with `var()`, less the properties
 * it sets on its own elements, such as where a card's chip stands near and far.
 * @param svg The document.
 * @returns The tokens' names.
 */
function namedTokens(svg: string): Set<string> {
	const own = new Set([...svg.matchAll(/[";](--[\w-]+):/gu)].map((found) => found[1]!));
	return new Set(
		[...svg.matchAll(/var\((--[\w-]+)\)/gu)]
			.map((found) => found[1]!)
			.filter((name) => !own.has(name)),
	);
}

test("a page's picture is one picture for both themes, and names only the page's tokens", async () => {
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		standing: { edge: "added" },
	});
	expect(rootDeclarations(svg).size).toBe(0);
	const named = namedTokens(svg);
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
		const { svg } = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme,
			standing: { edge: "added" },
		});
		const declared = rootDeclarations(svg);
		expect(declared.get("color-scheme")).toBe(theme);
		// The root declares the tokens, so they are read from what it holds.
		const named = namedTokens(body(svg));
		expect(named.size).toBeGreaterThan(0);
		for (const name of named) {
			expect(declared.get(name)).toBe(themeColor(theme, name));
		}
		expect(svg).not.toContain("theme.css");
	}
});

/**
 * A document without its root element's opening tag, which is where it declares its tokens.
 * @param svg The document.
 * @returns Everything after that tag.
 */
function body(svg: string): string {
	return svg.slice(svg.indexOf(">") + 1);
}

test("a document drawn auto carries both themes, and the reader's colour scheme chooses", async () => {
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "auto",
		standing: { edge: "added" },
	});
	const declared = rootDeclarations(svg);
	expect(declared.get("color-scheme")).toBe("light dark");
	const named = namedTokens(body(svg));
	expect(named.size).toBeGreaterThan(0);
	for (const name of named) {
		const light = themeColor("light", name);
		const dark = themeColor("dark", name);
		expect(declared.get(name)).toBe(light === dark ? light : `light-dark(${light}, ${dark})`);
	}
	// The drawing itself is the one the two grounds draw: only the root's declarations differ.
	const { svg: lightSvg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		standing: { edge: "added" },
	});
	expect(body(svg)).toBe(body(lightSvg));
});
