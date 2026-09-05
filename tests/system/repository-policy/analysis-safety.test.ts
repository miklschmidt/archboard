import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
test("every typed lint invocation refuses ancestor fallback before running the analyzer or fixing files", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-lint-project-boundary-"));
	try {
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { strict: true, noEmit: true, types: [] },
				files: ["owned.ts", "nested/owned.ts"],
			}),
		);
		writeFileSync(
			join(root, ".oxlintrc.jsonc"),
			JSON.stringify({ plugins: ["typescript"], categories: { correctness: "off" } }),
		);
		writeFileSync(join(root, "owned.ts"), "export const owned = 1;\n");
		mkdirSync(join(root, "nested"));
		writeFileSync(join(root, "nested/owned.ts"), "export const nested = 1;\n");
		writeFileSync(
			join(root, "nested/tsconfig.json"),
			JSON.stringify({ compilerOptions: { strict: true, types: [] }, files: ["owned.ts"] }),
		);
		const original = "let value = 1;\nexport { value };\n";
		writeFileSync(join(root, "unclaimed.ts"), original);
		for (const flags of [
			["--type-aware", "unclaimed.ts"],
			["--type-aware", "--fix", "unclaimed.ts"],
			["--type-check", "unclaimed.ts"],
			["--type-check-only", "unclaimed.ts"],
			["--type-aware", "--debug", "timings", "--fix", "unclaimed.ts"],
			["--type-aware", "--debug=timings", "unclaimed.ts"],
			["--type-aware", "nested/owned.ts"],
		]) {
			const result = Bun.spawnSync(
				[process.execPath, join(repoRoot, "scripts/lint.ts"), ...flags],
				{ cwd: root, stdout: "pipe", stderr: "pipe" },
			);
			expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(1);
			expect(result.stderr.toString()).toContain("Type-aware lint refused before analyzer startup");
		}
		rmSync(join(root, "nested/tsconfig.json"));
		writeFileSync(join(root, "nested/jsconfig.json"), JSON.stringify({ files: ["owned.ts"] }));
		const nestedJs = Bun.spawnSync(
			[process.execPath, join(repoRoot, "scripts/lint.ts"), "--type-aware", "nested/owned.ts"],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		expect(nestedJs.exitCode, nestedJs.stderr.toString()).toBe(1);
		expect(nestedJs.stderr.toString()).toContain("nested tsconfig.json or jsconfig.json");
		for (const flags of [["--type-aware", "--fix", "--", "unclaimed.ts"], ["--lsp"]]) {
			const unsupported = Bun.spawnSync(
				[process.execPath, join(repoRoot, "scripts/lint.ts"), ...flags],
				{ cwd: root, stdout: "pipe", stderr: "pipe" },
			);
			expect(unsupported.exitCode, unsupported.stderr.toString()).toBe(1);
			expect(unsupported.stderr.toString()).toContain("Repository lint");
		}
		writeFileSync(
			join(root, ".oxlintrc.jsonc"),
			JSON.stringify({
				plugins: ["typescript"],
				options: { typeAware: true },
				categories: { correctness: "off" },
			}),
		);
		const configured = Bun.spawnSync(
			[
				process.execPath,
				join(repoRoot, "scripts/lint.ts"),
				"--config=.oxlintrc.jsonc",
				"unclaimed.ts",
			],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		expect(configured.exitCode, configured.stdout.toString() + configured.stderr.toString()).toBe(
			1,
		);
		expect(configured.stderr.toString()).toContain(
			"Type-aware lint refused before analyzer startup",
		);
		expect(readFileSync(join(root, "unclaimed.ts"), "utf8")).toBe(original);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
