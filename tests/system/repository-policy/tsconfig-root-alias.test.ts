import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aliasResolutions, configuredAliases } from "./support/codex-protocol-aliases.js";

const repoRoot = resolve(import.meta.dir, "../../..");
const configPath = join(repoRoot, "tsconfig.json");
const expectedIncludes = [
	"src/**/*.ts",
	"tests/system/**/*.ts",
	"scripts/**/*.ts",
	"tools/**/*.ts",
];

type JsonObject = Record<string, unknown>;

function text(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function tsc(project: string, showConfig = false): { exitCode: number; output: string } {
	const result = Bun.spawnSync(
		["bunx", "tsc", ...(showConfig ? ["--showConfig"] : []), "--pretty", "false", "-p", project],
		{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
	);
	return { exitCode: result.exitCode, output: `${text(result.stdout)}${text(result.stderr)}` };
}

function rootConfig(): JsonObject {
	const result = tsc(configPath, true);
	if (result.exitCode !== 0) throw new Error(result.output);
	return JSON.parse(result.output) as JsonObject;
}

function fixtureDiagnostics(importSource: string): string {
	const root = mkdtempSync(join(repoRoot, ".archboard-tsconfig-root-alias-"));
	const fixture = join(root, "fixture.ts");
	const fixtureConfig = join(root, "tsconfig.json");
	writeFileSync(fixture, `${importSource}\n`);
	writeFileSync(fixtureConfig, JSON.stringify({ extends: configPath, include: ["fixture.ts"] }));
	try {
		return tsc(fixtureConfig).output;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("root TypeScript source alias", () => {
	test("keeps one exact @/* mapping without changing root compiler scope", () => {
		const config = rootConfig();
		const compilerOptions = config.compilerOptions as JsonObject;

		expect(compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
		expect(Object.keys(compilerOptions.paths as JsonObject)).toEqual(["@/*"]);
		expect(compilerOptions.baseUrl).toBeUndefined();
		expect(compilerOptions.moduleResolution).toBe("bundler");
		expect(compilerOptions.noEmit).toBe(true);
		expect(config.include).toEqual(expectedIncludes);
	});

	test("resolves a public @/ module and rejects an unknown alias", () => {
		const valid = fixtureDiagnostics(
			'import type { BoardIdentity } from "@/ui/types";\nconst identity: BoardIdentity = { board: "test", variant: "default" };\nvoid identity;',
		);
		expect(valid).toBe("");

		const diagnostics = fixtureDiagnostics(
			'import type { BoardIdentity } from "~/ui/types";\nconst identity: BoardIdentity = { board: "test", variant: "default" };\nvoid identity;',
		);
		expect(diagnostics).toContain("Cannot find module '~/ui/types'");
	});

	test("keeps root TypeScript, frontend TypeScript, and Vite on one source target", async () => {
		const aliases = await configuredAliases(repoRoot);
		const sourceTarget = join(repoRoot, "src", "ui", "types");

		expect(aliases.errors).toEqual([]);
		expect(aliases.root).toEqual([
			{ find: "@/*", targets: [join(repoRoot, "src", "*")], kind: "tsconfig" },
		]);
		expect(aliases.frontend).toEqual([
			{ find: "@/*", targets: [join(repoRoot, "src", "*")], kind: "tsconfig" },
		]);
		expect(aliases.vite).toEqual([{ find: "@", targets: [join(repoRoot, "src")], kind: "vite" }]);
		expect(aliasResolutions(aliases, "src/server/index.ts", "@/ui/types")).toEqual([
			{ kind: "tsconfig", target: sourceTarget },
		]);
		expect(aliasResolutions(aliases, "src/ui/index.ts", "@/ui/types")).toEqual([
			{ kind: "tsconfig", target: sourceTarget },
			{ kind: "vite", target: sourceTarget },
		]);
	});
});
