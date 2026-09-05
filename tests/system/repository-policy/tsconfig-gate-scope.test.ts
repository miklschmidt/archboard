import { expect, test } from "bun:test";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const archiveName = ["leg", "acy"].join("");
const ignored = new Set(["node_modules", "dist", archiveName, ".git"]);

function retainedTypeScript(): readonly string[] {
	return [...new Bun.Glob("**/*.{ts,tsx,mts,cts}").scanSync({ cwd: repoRoot, dot: true })]
		.filter((file) => !ignored.has(file.split("/")[0] ?? ""))
		.map((file) => realpathSync(join(repoRoot, file)));
}

test("retained TypeScript is compiler checked and both lint scopes cover their owned source", () => {
	const configs = ["tsconfig.json", "tsconfig.frontend.json"].map((project) => {
		const compiler = Bun.spawnSync(
			[join(repoRoot, "node_modules/.bin/tsc"), "--showConfig", "-p", project],
			{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
		);
		expect(compiler.exitCode, compiler.stderr.toString()).toBe(0);
		return JSON.parse(compiler.stdout.toString()) as {
			files: string[];
			compilerOptions: Record<string, unknown>;
		};
	});
	const roots = new Set(
		configs.flatMap((config) => config.files.map((file) => realpathSync(resolve(repoRoot, file)))),
	);
	const lintScopes = ["lint:repository", "lint:ui"].map((script) => {
		const lint = Bun.spawnSync([process.execPath, "run", script, "--debug", "files"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(lint.exitCode, lint.stderr.toString()).toBe(0);
		return new Set(
			lint.stdout
				.toString()
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((file) => resolve(repoRoot, file)),
		);
	});
	const [repositoryLint, uiLint] = lintScopes;
	const linted = new Set(
		lintScopes.flatMap((scope) => Array.from(scope, (file) => realpathSync(file))),
	);
	const uiRoot = join(repoRoot, "src/ui") + "/";
	const declaredPaths = new Set(configs[0]?.files.map((file) => resolve(repoRoot, file)));
	// tsgolint matches normalized paths, not realpaths. Alias-only membership is insufficient.
	for (const file of uiLint ?? []) {
		expect(
			declaredPaths.has(resolve(repoRoot, file)),
			`UI target would require fallback project discovery: ${file}`,
		).toBe(true);
	}
	for (const file of repositoryLint ?? []) expect(file.startsWith(uiRoot), file).toBe(false);
	for (const file of uiLint ?? []) expect(file.startsWith(uiRoot), file).toBe(true);
	for (const file of retainedTypeScript()) {
		expect(roots.has(file), `Missing TypeScript program root: ${file}`).toBe(true);
		// TASK-151 owns adoption of generated declarations; keep their pre-task lint exclusion.
		if (!file.startsWith(join(repoRoot, "src/shared/codex-app-server-contract/generated") + "/")) {
			expect(linted.has(file), `Missing ordinary lint input: ${file}`).toBe(true);
		}
	}
	for (const option of [
		"strict",
		"noEmit",
		"noImplicitReturns",
		"noUncheckedIndexedAccess",
		"exactOptionalPropertyTypes",
		"noImplicitOverride",
		"noUnusedLocals",
		"noUnusedParameters",
		"noPropertyAccessFromIndexSignature",
	]) {
		for (const config of configs) {
			expect(config.compilerOptions[option], option).toBe(true);
		}
	}
	for (const config of configs) {
		expect(config.compilerOptions["skipLibCheck"]).toBe(false);
	}
	const frontend: { extends: string; include: string[] } = JSON.parse(
		readFileSync(join(repoRoot, "tsconfig.frontend.json"), "utf8"),
	);
	expect(frontend.extends).toBe("./tsconfig.json");
	expect(frontend.include).toContain("src/server/board-rendering/browser.ts");
	expect(configs[0]?.compilerOptions["types"]).toEqual(["node", "bun"]);
	expect(configs[1]?.compilerOptions["types"]).toEqual(["node", "vite/client"]);
	const uiTest = realpathSync(join(repoRoot, "src/ui/board-preview/tests/board-preview.test.ts"));
	expect(configs[0]?.files.map((file) => realpathSync(resolve(repoRoot, file)))).toContain(uiTest);
	expect(configs[1]?.files.map((file) => realpathSync(resolve(repoRoot, file)))).not.toContain(
		uiTest,
	);
});

test("the renderer host enters through the browser module root", () => {
	const renderer = readFileSync(join(repoRoot, "frontend/renderer.html"), "utf8");
	expect(renderer).toContain('src="../src/server/board-rendering/browser.ts"');
	expect(renderer).not.toContain("board-rendering/lib/");
});
