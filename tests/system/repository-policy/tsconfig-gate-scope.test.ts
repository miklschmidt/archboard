import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../../..");

interface TypeScriptGateConfig {
	compilerOptions?: { noEmit?: unknown };
	include?: unknown;
}

function readCanonicalConfig(relativePath: string): TypeScriptGateConfig {
	const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
	return JSON.parse(source.replace(/^\s*\/\/.*$/gm, "")) as TypeScriptGateConfig;
}

test("keeps product sources in both TypeScript gates because tsc passes when excluded files contain errors", () => {
	const gates = [
		{
			path: "tsconfig.json",
			include: ["src/**/*.ts", "tests/system/**/*.ts", "scripts/**/*.ts", "tools/**/*.ts"],
		},
		{
			path: "tsconfig.frontend.json",
			include: [
				"frontend/main.tsx",
				"src/server/board-rendering/browser.ts",
				"src/ui/**/*.ts",
				"src/ui/**/*.tsx",
			],
		},
	] as const;

	for (const gate of gates) {
		const config = readCanonicalConfig(gate.path);
		expect(config.compilerOptions?.noEmit, gate.path).toBe(true);
		expect(config.include, gate.path).toEqual(gate.include);
	}
});

test("the renderer host enters through the browser module root", () => {
	const renderer = fs.readFileSync(path.join(repoRoot, "frontend/renderer.html"), "utf8");
	expect(renderer).toContain('src="../src/server/board-rendering/browser.ts"');
	expect(renderer).not.toContain("board-rendering/lib/");
});
