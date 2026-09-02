import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

function gitStatus(): string {
	return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

function fixtureDiagnostics(importSource: string): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-tsconfig-root-alias-"));
	const fixture = join(root, "fixture.ts");
	const fixtureConfig = join(root, "tsconfig.json");
	writeFileSync(fixture, `${importSource}\n`);
	writeFileSync(
		fixtureConfig,
		JSON.stringify({
			extends: configPath,
			compilerOptions: { typeRoots: [join(repoRoot, "node_modules", "@types")] },
			include: ["fixture.ts"],
		}),
	);
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

	test("does not leave disposable compiler fixtures in the checkout", () => {
		const before = gitStatus();
		expect(fixtureDiagnostics('import type { BoardIdentity } from "@/ui/types";')).toBe("");
		expect(gitStatus()).toBe(before);
	});

	test("keeps root TypeScript, frontend TypeScript, and Vite on one source target", () => {
		const rootPaths = (rootConfig().compilerOptions as JsonObject).paths;
		const frontend = tsc(join(repoRoot, "tsconfig.frontend.json"), true);
		expect(frontend.exitCode, frontend.output).toBe(0);
		const frontendPaths = (JSON.parse(frontend.output) as { compilerOptions: JsonObject })
			.compilerOptions.paths;
		const vite = readFileSync(join(repoRoot, "vite.config.js"), "utf8");

		expect(rootPaths).toEqual({ "@/*": ["./src/*"] });
		expect(frontendPaths).toEqual(rootPaths);
		expect(vite).toContain('new URL("./src", import.meta.url)');
		expect(vite).toContain('"@": sourceRoot');
	});
});
