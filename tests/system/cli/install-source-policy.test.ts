import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { checkoutRoot } from "./support/package-cli.ts";

const textExtensions = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
	".css",
	".scss",
	".sass",
	".less",
	".html",
	".md",
	".json",
	".jsonc",
	".yaml",
	".yml",
	".toml",
	".svg",
]);
const binaryExtensions = new Set([
	".avif",
	".bmp",
	".gif",
	".ico",
	".jpeg",
	".jpg",
	".mp3",
	".mp4",
	".otf",
	".pdf",
	".png",
	".ttf",
	".wasm",
	".webp",
	".woff",
	".woff2",
	".zip",
]);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		if (!entry.isFile()) return [];
		const extension = extname(entry.name).toLowerCase();
		if (textExtensions.has(extension)) return [path];
		if (binaryExtensions.has(extension)) return [];
		throw new Error(`Unclassified regular file under src/: ${path}`);
	});
}

const stalePaths = (directory: string) =>
	sourceFiles(directory).filter((file) =>
		/(?:src\/core\/|frontend\/src\/)/.test(readFileSync(file, "utf8")),
	);

describe("install source policy", () => {
	test("classifies every live source file before stale-path scanning", () => {
		expect(stalePaths(join(checkoutRoot, "src"))).toEqual([]);
	});

	test("detects nested non-JavaScript stale paths", () => {
		const scratch = mkdtempSync(join(tmpdir(), "archboard-source-policy-"));
		try {
			const nested = join(scratch, "nested");
			mkdirSync(nested, { recursive: true });
			const css = join(nested, "fixture.css");
			writeFileSync(css, "/* src/core/old.css */\n");
			expect(stalePaths(scratch)).toEqual([css]);
			writeFileSync(join(nested, "fixture.unknown"), "data");
			expect(() => sourceFiles(scratch)).toThrow(/Unclassified regular file/);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("keeps live maintainer and product docs on current paths", () => {
		const docs = [
			"AGENTS.md",
			"DESIGN.md",
			"INSTALL.md",
			"TESTING.md",
			"CONTEXT.md",
			"FLIP_WHITEBOARD.md",
			"docs/agents/boundaries.md",
			"docs/agents/test-suite.md",
			...readdirSync(join(checkoutRoot, "docs/adr")).map((name) => `docs/adr/${name}`),
			"skills/archboard/SKILL.md",
			"skills/archboard-dev/SKILL.md",
		];
		for (const relative of docs)
			expect(readFileSync(join(checkoutRoot, relative), "utf8"), relative).not.toMatch(
				/(?:src\/core\/|frontend\/src\/)/,
			);
	});
});
