import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import {
	DARK_TOKEN_OVERRIDES,
	EXPECTED_IMPORTS,
	HARDCODED_COMPILER_CANDIDATES,
	HIGH_CONTRAST_FORBIDDEN_DECLARATIONS,
	LIGHT_TOKENS,
	OWNED_CANDIDATES,
	REDUCED_MOTION_OVERRIDES,
	REFUSED_CANDIDATES,
	SEMANTIC_ALIASES,
	TAILWIND_THEME_GROUPS,
	TOKEN_FAMILY_MUTATIONS,
} from "./theme-contract-fixture.ts";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appStylesheet = path.join(moduleRoot, "app.css");
const appSource = fs.readFileSync(appStylesheet, "utf8");
const tailwindThemePath = fileURLToPath(import.meta.resolve("tailwindcss/theme.css"));

async function loadStylesheet(
	id: string,
	base: string,
): Promise<{ path: string; base: string; content: string }> {
	const resolved = id.startsWith(".")
		? path.resolve(base, id)
		: fileURLToPath(import.meta.resolve(id));
	return {
		path: resolved,
		base: path.dirname(resolved),
		content: fs.readFileSync(resolved, "utf8"),
	};
}

async function compiledTheme(source: string, candidates: readonly string[]): Promise<string> {
	const compiler = await compile(source, { base: moduleRoot, loadStylesheet });
	return compiler.build([...candidates]);
}

function blockFrom(text: string, marker: string, anchor = marker): string | undefined {
	const anchorIndex = text.indexOf(anchor);
	if (anchorIndex < 0) return undefined;
	const start = text.lastIndexOf(marker, anchorIndex);
	if (start < 0) return undefined;
	const open = text.indexOf("{", start + marker.length);
	if (open < 0 || (anchor !== marker && open > anchorIndex)) return undefined;
	let depth = 1;
	for (let index = open + 1; index < text.length; index += 1) {
		if (text[index] === "{") depth += 1;
		if (text[index] !== "}") continue;
		depth -= 1;
		if (depth === 0) return text.slice(open + 1, index);
	}
	return undefined;
}

function normalized(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function properties(block: string | undefined): Map<string, string> {
	const result = new Map<string, string>();
	if (block === undefined) return result;
	for (const match of block.matchAll(/^\s*(--(?:\*|[\w-]+)):\s*([\s\S]*?);/gm)) {
		result.set(match[1]!, normalized(match[2]!));
	}
	return result;
}

function mapErrors(
	label: string,
	actual: Map<string, string>,
	expected: Readonly<Record<string, string>>,
): string[] {
	const errors: string[] = [];
	for (const [name, value] of Object.entries(expected)) {
		if (!actual.has(name)) errors.push(`${label} misses ${name}`);
		else if (actual.get(name) !== value) {
			errors.push(`${label} has ${name}: ${actual.get(name)} instead of ${value}`);
		}
	}
	for (const name of actual.keys()) {
		if (!(name in expected)) errors.push(`${label} has unexpected ${name}`);
	}
	return errors;
}

function sourceContractErrors(source: string): string[] {
	const errors: string[] = [];
	const expectedPrefix = `${EXPECTED_IMPORTS.join("\n")}\n\n`;
	const imports = [...source.matchAll(/^@import [^;]+;/gm)].map((match) => match[0]);
	if (!source.startsWith(expectedPrefix)) errors.push("import prefix or order changed");
	if (JSON.stringify(imports) !== JSON.stringify(EXPECTED_IMPORTS)) {
		errors.push("import inventory changed");
	}
	if (/tailwindcss\/(?:preflight|base)(?:\.css)?/.test(source)) {
		errors.push("Preflight or base reset entered the application stylesheet");
	}
	for (const declaration of HIGH_CONTRAST_FORBIDDEN_DECLARATIONS) {
		if (normalized(source).includes(declaration)) {
			errors.push(`${declaration} breaks high contrast`);
		}
	}

	errors.push(
		...mapErrors("light tokens", properties(blockFrom(source, ":root")), LIGHT_TOKENS),
		...mapErrors(
			"dark tokens",
			properties(
				blockFrom(source, '.shell[data-theme="dark"]', "--arch-color-muted-foreground: #b5b7bd"),
			),
			DARK_TOKEN_OVERRIDES,
		),
	);

	const reducedMotion = blockFrom(source, "@media (prefers-reduced-motion: reduce)");
	errors.push(
		...mapErrors(
			"reduced motion",
			properties(blockFrom(reducedMotion ?? "", ":root", "--arch-duration-control: 0.001ms")),
			REDUCED_MOTION_OVERRIDES,
		),
	);

	const expectedTheme = { "--*": "initial", ...SEMANTIC_ALIASES };
	errors.push(
		...mapErrors(
			"semantic aliases",
			properties(blockFrom(source, "@theme inline", "--color-background")),
			expectedTheme,
		),
	);
	return errors;
}

function compiledTokenErrors(css: string): string[] {
	const errors = [
		...mapErrors(
			"compiled light tokens",
			properties(blockFrom(css, ":root", '--arch-font-ui: "Archboard Onest"')),
			LIGHT_TOKENS,
		),
		...mapErrors(
			"compiled dark tokens",
			properties(
				blockFrom(css, '.shell[data-theme="dark"]', "--arch-color-muted-foreground: #b5b7bd"),
			),
			DARK_TOKEN_OVERRIDES,
		),
	];
	const reducedMotion = blockFrom(
		css,
		"@media (prefers-reduced-motion: reduce)",
		"--arch-duration-control: 0.001ms",
	);
	errors.push(
		...mapErrors(
			"compiled reduced motion",
			properties(blockFrom(reducedMotion ?? "", ":root", "--arch-duration-control: 0.001ms")),
			REDUCED_MOTION_OVERRIDES,
		),
	);
	for (const declaration of HIGH_CONTRAST_FORBIDDEN_DECLARATIONS) {
		if (normalized(css).includes(declaration)) {
			errors.push(`compiled CSS contains ${declaration}`);
		}
	}
	return errors;
}

function selectorFor(candidate: string): string {
	return `.${candidate.replaceAll(":", "\\:")}`;
}

async function completeContractErrors(source: string): Promise<string[]> {
	const errors = sourceContractErrors(source);
	try {
		const css = await compiledTheme(source, [...OWNED_CANDIDATES, ...REFUSED_CANDIDATES]);
		errors.push(...compiledTokenErrors(css));
		for (const candidate of OWNED_CANDIDATES) {
			if (!css.includes(selectorFor(candidate))) errors.push(`compiler misses ${candidate}`);
		}
		for (const candidate of REFUSED_CANDIDATES) {
			if (css.includes(selectorFor(candidate))) errors.push(`compiler emits refused ${candidate}`);
		}
	} catch (error) {
		errors.push(`compiler rejected stylesheet: ${String(error)}`);
	}
	return errors;
}

function replaceOnce(source: string, before: string, after: string): string {
	const index = source.indexOf(before);
	if (index < 0) throw new Error(`Mutation input is absent: ${before}`);
	return source.slice(0, index) + after + source.slice(index + before.length);
}

describe("Archboard semantic Tailwind theme", () => {
	test("pins the exact import prefix and every source token and semantic alias", async () => {
		expect(sourceContractErrors(appSource)).toEqual([]);
		const css = await compiledTheme(appSource, OWNED_CANDIDATES);
		expect(compiledTokenErrors(css)).toEqual([]);
		expect(css).toContain("background-color: var(--arch-color-primary)");
		expect(css).toContain("background-color: var(--arch-color-primary-foreground)");
	});

	test("classifies all 419 configurable Tailwind variables and clears their defaults", () => {
		const upstream = fs.readFileSync(tailwindThemePath, "utf8");
		const variables = [...upstream.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]!);
		expect(variables).toHaveLength(419);
		expect(new Set(variables).size).toBe(419);

		for (const group of TAILWIND_THEME_GROUPS) {
			expect(variables.filter((variable) => group.pattern.test(variable))).toHaveLength(
				group.expectedCount,
			);
		}
		for (const variable of variables) {
			expect(TAILWIND_THEME_GROUPS.filter((group) => group.pattern.test(variable))).toHaveLength(1);
		}
		expect(TAILWIND_THEME_GROUPS.flatMap((group) => group.hardcodedCandidates ?? [])).toEqual([
			...HARDCODED_COMPILER_CANDIDATES,
		]);
		expect(appSource).toContain("--*: initial;");
	});

	test("emits every owned family and refuses every configurable stock family", async () => {
		const css = await compiledTheme(appSource, [...OWNED_CANDIDATES, ...REFUSED_CANDIDATES]);
		for (const candidate of OWNED_CANDIDATES) {
			expect(css).toContain(selectorFor(candidate));
		}
		for (const candidate of REFUSED_CANDIDATES) {
			expect(css).not.toContain(selectorFor(candidate));
		}
	});

	test("records the two hardcoded compiler candidates without adopting them", async () => {
		const minimalReset = `${EXPECTED_IMPORTS.slice(0, 2).join("\n")}\n@theme { --*: initial; }`;
		const css = await compiledTheme(minimalReset, HARDCODED_COMPILER_CANDIDATES);

		expect(css).toContain(".transition {");
		expect(css).toContain("transition-timing-function: var(--tw-ease, ease)");
		expect(css).toContain("transition-duration: var(--tw-duration, 0s)");
		expect(css).toContain(".duration-150 {");
		expect(css).toContain("--tw-duration: 150ms");
		expect(css).toContain("transition-duration: 150ms");
		expect(Object.keys(SEMANTIC_ALIASES)).not.toContain("--default-transition-duration");
		expect(Object.values(SEMANTIC_ALIASES)).not.toContain("150ms");
		expect(appSource).not.toContain("duration-150");
		expect(appSource).not.toMatch(/(^|\s)\.transition\s*\{/m);
	});

	test.each([
		["removes the theme import", replaceOnce(appSource, `${EXPECTED_IMPORTS[0]}\n`, "")],
		["removes the utilities import", replaceOnce(appSource, `${EXPECTED_IMPORTS[1]}\n`, "")],
		["removes the shell import", replaceOnce(appSource, `${EXPECTED_IMPORTS[2]}\n`, "")],
		[
			"reorders theme and utilities",
			replaceOnce(
				appSource,
				`${EXPECTED_IMPORTS[0]}\n${EXPECTED_IMPORTS[1]}`,
				`${EXPECTED_IMPORTS[1]}\n${EXPECTED_IMPORTS[0]}`,
			),
		],
		["puts a declaration before imports", `:root { color: red; }\n${appSource}`],
		[
			"adds Preflight",
			replaceOnce(
				appSource,
				`${EXPECTED_IMPORTS[1]}\n`,
				`${EXPECTED_IMPORTS[1]}\n@import "tailwindcss/preflight.css" layer(base);\n`,
			),
		],
		[
			"adds the base reset spelling",
			replaceOnce(
				appSource,
				`${EXPECTED_IMPORTS[1]}\n`,
				`${EXPECTED_IMPORTS[1]}\n@import "tailwindcss/base.css" layer(base);\n`,
			),
		],
	])("rejects import mutation that %s", async (_name, source) => {
		expect(await completeContractErrors(source)).not.toEqual([]);
	});

	test.each(TOKEN_FAMILY_MUTATIONS)("rejects %s token drift", async (_name, before, after) => {
		const source = replaceOnce(appSource, before, after);
		expect(await completeContractErrors(source)).not.toEqual([]);
	});

	test("rejects forced-color opt-out and reduced-motion loss", async () => {
		const forcedColorOptOut = replaceOnce(
			appSource,
			":root {",
			":root {\n\tforced-color-adjust: none;",
		);
		const reducedMotionLoss = replaceOnce(appSource, "\t\t--arch-duration-control: 0.001ms;\n", "");
		expect(await completeContractErrors(forcedColorOptOut)).not.toEqual([]);
		expect(await completeContractErrors(reducedMotionLoss)).not.toEqual([]);
	});
});
