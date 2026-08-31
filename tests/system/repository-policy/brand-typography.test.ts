import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	renderWordmarkSvg,
	WORDMARK_SOURCE_SHA256,
	WORDMARK_TRACKING_EM,
} from "../../../scripts/generate-wordmark.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assetRoot = path.join(repoRoot, "src/ui/shell/assets");
const fontRoot = path.join(assetRoot, "fonts");

const pinnedFiles = new Map([
	["Onest-wght-v1.000.ttf", "3faa4b905661849b2332e394b42f91b5bf5575e553c516caa81811e868a4d589"],
	["Onest-Medium-v1.000.ttf", WORDMARK_SOURCE_SHA256],
	["DMMono-Regular-v1.000.ttf", "55b4c98f123daebb3ed27947ba47b2af00554fc6284d639a540bcef5e6258ad2"],
	["DMMono-Medium-v1.000.ttf", "fd327daf461db87b44a87def475d251bf03b997f7c07d9680592d75dbbfaad0b"],
	["OFL-Onest-1.1.txt", "7805ccc507e6dc0c0796f1afa4f03ad413a9d302a30a24f8dbeb1aeef07a6c17"],
	["OFL-DMMono-1.1.txt", "f5898de81851415b71431c1a8ea527c88a4e79caeb23936483428d2e911af40c"],
]);

function sha256(filename: string): string {
	return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

const typeAliases = new Map([
	["--font-ui", "var(--arch-font-ui)"],
	["--font-mono", "var(--arch-font-technical)"],
	["--weight-regular", "var(--arch-weight-regular)"],
	["--weight-medium", "var(--arch-weight-medium)"],
	["--weight-semibold", "var(--arch-weight-semibold)"],
	["--weight-bold", "var(--arch-weight-bold)"],
	["--wordmark-tracking", "var(--arch-wordmark-tracking)"],
	["--type-kicker", "var(--arch-text-kicker-size)/var(--arch-text-kicker-line)"],
	["--type-tech", "var(--arch-text-technical-size)/var(--arch-text-technical-line)"],
	["--type-body", "var(--arch-text-body-size)/var(--arch-text-body-line)"],
	["--type-control", "var(--arch-text-control-size)/var(--arch-text-control-line)"],
	["--type-title", "var(--arch-text-title-size)/var(--arch-text-title-line)"],
	["--type-primary", "var(--arch-text-primary-size)/var(--arch-text-primary-line)"],
]);

const colorAliases = new Map([
	["--selection", "var(--arch-color-selection)"],
	["--status", "var(--arch-color-status)"],
	["--ink", "var(--arch-color-foreground)"],
	["--muted", "var(--arch-color-muted-foreground)"],
	["--faint", "var(--arch-color-faint-foreground)"],
	["--border", "var(--arch-color-border)"],
	["--soft-border", "var(--arch-color-border-subtle)"],
	["--paper", "var(--arch-color-background)"],
	["--surface", "var(--arch-color-surface)"],
	["--surface-raised", "var(--arch-color-surface-raised)"],
	["--surface-soft", "var(--arch-color-surface-subtle)"],
	["--surface-hover", "var(--arch-color-surface-hover)"],
	["--accent", "var(--arch-color-primary)"],
	["--accent-hover", "var(--arch-color-primary-hover)"],
	["--accent-soft", "var(--arch-color-primary-subtle)"],
	["--accent-ink", "var(--arch-color-primary-foreground)"],
	["--danger", "var(--arch-color-destructive)"],
	["--danger-soft", "var(--arch-color-destructive-subtle)"],
	["--warn", "var(--arch-color-warning)"],
	["--warn-soft", "var(--arch-color-warning-subtle)"],
	["--live", "var(--arch-color-status)"],
	["--live-ink", "var(--arch-color-status-foreground)"],
	["--live-soft", "var(--arch-color-status-subtle)"],
	["--dead", "var(--arch-color-offline)"],
	["--path-focus-dim", "var(--arch-color-path-focus-dim)"],
]);

function declarationsFor(source: string, selector: string): Map<string, string> {
	const marker = `${selector} {`;
	const start = source.indexOf(marker);
	if (start < 0) return new Map();
	const open = source.indexOf("{", start);
	let depth = 1;
	let end = open + 1;
	for (; end < source.length && depth > 0; end += 1) {
		if (source[end] === "{") depth += 1;
		if (source[end] === "}") depth -= 1;
	}
	const body = source
		.slice(open + 1, end - 1)
		.replaceAll(/\/\*[\s\S]*?\*\//g, "");
	const declarations = new Map<string, string>();
	for (const item of body.split(";")) {
		const colon = item.indexOf(":");
		if (colon < 0) continue;
		declarations.set(item.slice(0, colon).trim(), item.slice(colon + 1).trim().replaceAll(/\s+/g, " "));
	}
	return declarations;
}

const curatedShellDeclarations = [
	[".shell", "grid-template", "var(--arch-size-header) minmax(0, 1fr) 34px / minmax(0, 1fr)"],
	[".bar", "border-bottom", "var(--arch-space-rule) solid var(--border)"],
	[".bar-board-meta", "gap", "12px"],
	[".chip", "padding", "0 var(--arch-space-control-inline)"],
	[".board-group", "border-radius", "var(--arch-radius-panel)"],
	[".btn", "border-radius", "4px"],
	[".icon-btn,\n.notice-dismiss,\n.modal-close", "border-radius", "4px"],
	[".board-preview-control", "border-radius", "4px"],
	[".present-button", "border-radius", "4px"],
	[".take-back", "border-radius", "4px"],
	[".field input,\n.field select", "border-radius", "4px"],
	[".pane-tab.focused", "border-bottom", "2px solid var(--accent)"],
	[
		".claim-copy",
		"font",
		"var(--arch-weight-regular) var(--arch-text-body-size) / 18px var(--font-ui)",
	],
	[
		".btn:disabled,\n.icon-btn:disabled,\n.name-button:disabled",
		"opacity",
		"var(--arch-opacity-disabled-control)",
	],
	[
		".btn,\n.icon-btn,\n.notice-dismiss,\n.modal-close,\n.name-button",
		"transition",
		"border-color var(--arch-duration-control) var(--arch-ease-control), background var(--arch-duration-control) var(--arch-ease-control)",
	],
	[".claim-beacon", "animation", "var(--arch-animation-status)"],
] as const;

function shellTokenErrors(source: string): string[] {
	const errors: string[] = [];
	const shellAliases = new Map(
		[...declarationsFor(source, ".shell")].filter(([property]) => property.startsWith("--")),
	);
	const expectedShellAliases = new Map([...typeAliases, ...colorAliases]);
	if (JSON.stringify([...shellAliases]) !== JSON.stringify([...expectedShellAliases])) {
		errors.push("the .shell legacy bridge does not exactly match the canonical alias map");
	}
	const darkAliases = new Map(
		[...declarationsFor(source, '.shell[data-theme="dark"]')].filter(([property]) =>
			property.startsWith("--"),
		),
	);
	if (JSON.stringify([...darkAliases]) !== JSON.stringify([...colorAliases])) {
		errors.push("the dark shell bridge does not exactly match the canonical color alias map");
	}
	for (const [selector, property, expected] of curatedShellDeclarations) {
		const actual = declarationsFor(source, selector).get(property);
		if (actual !== expected) errors.push(`${selector} ${property} maps to ${actual ?? "nothing"}`);
	}
	return errors;
}

function replaceOnce(source: string, from: string, to: string): string {
	if (!source.includes(from)) throw new Error(`hostile policy fixture could not find ${from}`);
	return source.replace(from, to);
}

describe("brand typography assets", () => {
	test("pins the exact redistributable font and license bytes", () => {
		for (const [filename, expectedHash] of pinnedFiles) {
			expect(sha256(path.join(fontRoot, filename))).toBe(expectedHash);
		}
		for (const filename of ["OFL-Onest-1.1.txt", "OFL-DMMono-1.1.txt"]) {
			expect(fs.readFileSync(path.join(fontRoot, filename), "utf8")).toContain(
				"SIL OPEN FONT LICENSE Version 1.1",
			);
		}

		const provenance = fs.readFileSync(path.join(fontRoot, "README.md"), "utf8");
		for (const expectedHash of pinnedFiles.values()) expect(provenance).toContain(expectedHash);
		expect(provenance).toContain("d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8");
		expect(provenance).toContain("57fadabfb200a77de2812540026c249dc3013077");
		expect(provenance).toContain("ade3d1533e06b2b1462ffcde8e08b129627ca360");
		expect(provenance).toContain("opentype.js` 1.3.4");
	});

	test("keeps the generated mark deterministic and path-only", () => {
		const generated = renderWordmarkSvg();
		expect(renderWordmarkSvg()).toBe(generated);
		expect(fs.readFileSync(path.join(assetRoot, "archboard-wordmark.svg"), "utf8")).toBe(generated);
		expect(generated).toContain(`tracking ${WORDMARK_TRACKING_EM}em`);
		expect(generated).toContain('viewBox="0 0 85.7815 13.209"');
		expect(generated.match(/<path\b/g)).toHaveLength(1);
		expect(generated.match(/<metadata>/g)).toHaveLength(1);
		expect(generated).toContain('fill="currentColor"');
		expect(generated).not.toMatch(
			/<(?:script|style|text|image|use|foreignObject|iframe)\b|\bon\w+\s*=|\b(?:href|src)\s*=/i,
		);
	});

	test("loads only the pinned application families and supported weights", () => {
		const css = fs.readFileSync(path.join(repoRoot, "src/ui/shell/shell.css"), "utf8");
		expect(css).toContain("--font-ui: var(--arch-font-ui);");
		expect(css).toContain("--font-mono: var(--arch-font-technical);");
		expect(css).toContain("font-synthesis: none;");
		expect(css).toContain("font-weight: 400 700;");
		expect(css).toContain("font-weight: 400;");
		expect(css).toContain("font-weight: 500;");
		expect(css).toContain("--wordmark-tracking: var(--arch-wordmark-tracking);");
		expect(css).toContain('mask: url("./assets/archboard-wordmark.svg")');
		expect(css).not.toMatch(/\b(?:Inter|Geist|Manrope|ui-monospace|SFMono|Consolas)\b/);
		expect(css).not.toContain("Onest-Medium-v1.000.ttf");
		expect([...css.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((match) => match[1])).toEqual([
			"./assets/fonts/Onest-wght-v1.000.ttf",
			"./assets/fonts/DMMono-Regular-v1.000.ttf",
			"./assets/fonts/DMMono-Medium-v1.000.ttf",
		]);

		const boardBar = fs.readFileSync(path.join(repoRoot, "src/ui/shell/BoardBar.tsx"), "utf8");
		expect(boardBar).toContain('<svg className="wordmark" aria-label="archboard">');
		expect(boardBar).toContain("<title>archboard</title>");
		expect(boardBar).not.toContain("dangerouslySetInnerHTML");

		const productRules = css.slice(css.indexOf(".shell {"));
		const declaredWeightRoles = [
			...[...productRules.matchAll(/font-weight:\s*var\(--arch-weight-([a-z]+)\)/g)].map(
				(match) => match[1],
			),
			...[...productRules.matchAll(/font:\s*var\(--arch-weight-([a-z]+)\)/g)].map(
				(match) => match[1],
			),
		];
		expect(declaredWeightRoles.length).toBeGreaterThan(20);
		expect(
			declaredWeightRoles.every((weight) =>
				["regular", "medium", "semibold", "bold"].includes(weight!),
			),
		).toBe(true);
		expect(productRules).not.toMatch(/(?:font|font-weight):\s*(?:400|500|600|700)\b/);

		const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};
		expect(pkg.devDependencies["opentype.js"]).toBe("1.3.4");
		expect(pkg.scripts["generate:wordmark"]).toBe("bun scripts/generate-wordmark.ts");
	});

	test("maps the legacy shell bridge and curated roles to exact canonical tokens", () => {
		const css = fs.readFileSync(path.join(repoRoot, "src/ui/shell/shell.css"), "utf8");
		expect(shellTokenErrors(css)).toEqual([]);

		const hostileSwaps = [
			[
				"color",
				"--ink: var(--arch-color-foreground);",
				"--ink: var(--arch-color-muted-foreground);",
			],
			[
				"typography",
				"--type-control: var(--arch-text-control-size)/var(--arch-text-control-line);",
				"--type-control: var(--arch-text-control-size)/var(--arch-text-body-line);",
			],
			[
				"radius",
				"border-radius: var(--arch-radius-panel);",
				"border-radius: var(--arch-radius-control);",
			],
			["spacing", "gap: 12px;", "gap: var(--arch-space-control-inline);"],
			[
				"state",
				"opacity: var(--arch-opacity-disabled-control);",
				"opacity: var(--arch-opacity-disabled-item);",
			],
			[
				"motion",
				"animation: var(--arch-animation-status);",
				"animation: var(--arch-duration-control);",
			],
		] as const;
		for (const [family, from, to] of hostileSwaps) {
			expect(shellTokenErrors(replaceOnce(css, from, to)), family).not.toEqual([]);
		}
	});
});
