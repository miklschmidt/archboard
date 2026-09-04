import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");

function productSources(): readonly { readonly file: string; readonly text: string }[] {
	return readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				[".ts", ".tsx"].includes(path.extname(entry.name)) &&
				!path.relative(moduleRoot, entry.parentPath).startsWith("tests"),
		)
		.map((entry) => ({
			file: path.relative(moduleRoot, path.join(entry.parentPath, entry.name)),
			text: readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
		}));
}

const SOURCES = productSources();

describe("voice context boundaries", () => {
	test("keeps every authored TypeScript file below the repository limit", () => {
		for (const source of SOURCES) {
			const lines = source.text.split(/\r?\n/u).length;
			expect(lines, `${source.file} has ${lines} physical lines`).toBeLessThanOrEqual(500);
		}
	});

	test("imports no runtime module and crosses UI modules through root entrypoints only", () => {
		for (const source of SOURCES) {
			expect(source.text, source.file).not.toMatch(/from ["'][^"']*\/runtime\//u);
			for (const specifier of [...source.text.matchAll(/from ["']([^"']+)["']/gu)].map(
				(match) => match[1]!,
			)) {
				if (!specifier.startsWith("@/ui/")) continue;
				expect(specifier, source.file).toMatch(/^@\/ui\/[^/]+$/u);
			}
		}
	});

	test("owns no raw palette, arbitrary visual utility, or second dark theme", () => {
		for (const source of SOURCES) {
			expect(source.text, source.file).not.toMatch(/#[\da-f]{3,8}\b/iu);
			expect(source.text, source.file).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/u);
			expect(source.text, source.file).not.toMatch(/\b(?:bg|text|border|outline|p|m|gap|h|w)-\[/u);
			expect(source.text, source.file).not.toMatch(/\bdark:|prefers-color-scheme|data-theme/u);
		}
	});
});
