import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const tsc = path.join(repoRoot, "node_modules/.bin/tsc");
const plugin = path.join(repoRoot, "tools/oxlint-plugin-archboard.js");

interface CommandResult {
	exitCode: number;
	output: string;
}

function run(cwd: string, cmd: string[]): CommandResult {
	const result = Bun.spawnSync({
		cmd,
		cwd,
		env: {
			...process.env,
			PATH: `${path.join(repoRoot, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function repositoryOxlintConfig(): string {
	const authored = fs.readFileSync(path.join(repoRoot, ".oxlintrc.jsonc"), "utf8");
	const relativePlugin = '"./tools/oxlint-plugin-archboard.js"';
	if (!authored.includes(relativePlugin))
		throw new Error("repository Oxlint plugin path is missing");
	return authored.replace(relativePlugin, JSON.stringify(plugin));
}

async function withProject<T>(
	files: Record<string, string>,
	check: (root: string) => T | Promise<T>,
): Promise<T> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-boundaries-"));
	try {
		fs.writeFileSync(path.join(root, ".oxlintrc.jsonc"), repositoryOxlintConfig());
		fs.copyFileSync(path.join(repoRoot, "tsconfig.json"), path.join(root, "tsconfig.json"));
		fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
		for (const [relative, content] of Object.entries(files)) {
			const target = path.join(root, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
		return await check(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function lint(root: string, relativePaths: string[], extra: string[] = []): CommandResult {
	return run(root, [oxlint, "--config=.oxlintrc.jsonc", ...extra, ...relativePaths]);
}

function expectPass(result: CommandResult): void {
	expect(result.exitCode, result.output).toBe(0);
}

function expectRule(result: CommandResult, rule: string, guidance?: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain(rule);
	if (guidance) expect(result.output).toContain(guidance);
}

describe("Archboard boundary plugin in real Oxlint subprocesses", () => {
	test("uses the repository-owned Oxlint and TypeScript configurations", async () => {
		await withProject({}, (root) => {
			const actualOxlint = fs
				.readFileSync(path.join(root, ".oxlintrc.jsonc"), "utf8")
				.replace(JSON.stringify(plugin), '"./tools/oxlint-plugin-archboard.js"');
			expect(actualOxlint).toBe(fs.readFileSync(path.join(repoRoot, ".oxlintrc.jsonc"), "utf8"));
			expect(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8")).toBe(
				fs.readFileSync(path.join(repoRoot, "tsconfig.json"), "utf8"),
			);
		});
	});

	test("allows root entrypoints, documented dependency directions, and flat test owners", async () => {
		await withProject(
			{
				"src/shared/common/index.ts": "export const sharedValue = 1;\n",
				"src/domain/target/index.ts": "export const domainValue = 1;\n",
				"src/domain/allowed/index.ts":
					'import { sharedValue } from "../../shared/common/index.js";\nimport { domainValue } from "../target";\nexport const value = sharedValue + domainValue;\n',
				"src/domain/tested/index.ts": "export const moduleValue = 1;\n",
				"src/domain/tested/tests/support.ts": "export const support = 1;\n",
				"src/domain/tested/tests/widget.spec.ts":
					'import { moduleValue } from "../index.js";\nimport { support } from "./support.js";\nexport const value = moduleValue + support;\n',
				"tests/system/policy/support.ts": "export const support = 1;\n",
				"tests/system/policy/system.test.ts":
					'import { moduleValue } from "../../../src/domain/tested/index.js";\nimport { support } from "./support.js";\nexport const value = moduleValue + support;\n',
				"src/cli/command-contract/tests/public-runner-fixture.ts":
					"export const publicRunnerFixture = true;\n",
			},
			(root) =>
				expectPass(
					lint(root, [
						"src/domain/allowed/index.ts",
						"src/domain/tested/tests/widget.spec.ts",
						"tests/system/policy/system.test.ts",
						"src/cli/command-contract/tests/public-runner-fixture.ts",
					]),
				),
		);
	});

	test("rejects root implementation, forbidden directions, and unmapped flat source", async () => {
		await withProject(
			{
				"src/server.ts": "export function implementation() { return true; }\n",
				"src/transformers/target/index.ts": "export const transformed = 1;\n",
				"src/domain/forbidden/index.ts":
					'import { transformed } from "../../transformers/target/index.js";\nexport { transformed };\n',
				"src/cli/freepass.ts": "export const flat = true;\n",
			},
			(root) => {
				expectRule(lint(root, ["src/server.ts"]), "archboard(root-implementation-modules)");
				expectRule(lint(root, ["src/domain/forbidden/index.ts"]), "archboard(import-boundaries)");
				expectRule(lint(root, ["src/cli/freepass.ts"]), "archboard(mapped-source-paths)");
			},
		);
	});

	test("rejects extensionless, Vite raw, CommonJS, and cross-module deep imports", async () => {
		await withProject(
			{
				"src/domain/target/index.ts": "export const value = 1;\n",
				"src/domain/target/lib/index.ts": "export const privateValue = 1;\n",
				"src/domain/importer/extensionless.ts":
					'import { privateValue } from "../target/lib";\nexport { privateValue };\n',
				"src/domain/importer/raw.ts":
					'import { privateValue } from "../target/lib?raw";\nexport { privateValue };\n',
				"src/domain/importer/require.ts":
					'const privateValue = require("../target/lib");\nexport { privateValue };\n',
			},
			(root) => {
				for (const file of ["extensionless.ts", "raw.ts"]) {
					expectRule(lint(root, [`src/domain/importer/${file}`]), "archboard(module-entrypoints)");
				}
				const required = lint(root, ["src/domain/importer/require.ts"]);
				expectRule(required, "archboard(module-entrypoints)");
				expect(required.output).toContain("typescript(no-require-imports)");
			},
		);
	});

	test("rejects deep product imports and imports across test owners", async () => {
		await withProject(
			{
				"src/domain/target/index.ts": "export const value = 1;\n",
				"src/domain/target/lib/index.ts": "export const privateValue = 1;\n",
				"src/domain/target/tests/support.ts": "export const moduleSupport = 1;\n",
				"src/domain/other/index.ts": "export const value = 1;\n",
				"src/domain/other/lib/index.ts": "export const privateValue = 1;\n",
				"src/domain/other/tests/support.ts": "export const otherSupport = 1;\n",
				"src/domain/target/tests/deep-own.test.ts":
					'import { privateValue } from "../lib/index.js";\nexport { privateValue };\n',
				"src/domain/target/tests/deep-other.test.ts":
					'import { privateValue } from "../../other/lib/index.js";\nexport { privateValue };\n',
				"src/domain/target/tests/cross-module.test.ts":
					'import { otherSupport } from "../../other/tests/support.js";\nexport { otherSupport };\n',
				"src/domain/target/tests/cross-system.test.ts":
					'import { systemSupport } from "../../../../tests/system/policy/support.js";\nexport { systemSupport };\n',
				"tests/system/policy/support.ts": "export const systemSupport = 1;\n",
				"tests/system/policy/deep.spec.ts":
					'import { privateValue } from "../../../src/domain/target/lib/index.js";\nexport { privateValue };\n',
				"tests/system/policy/cross-module.test.ts":
					'import { moduleSupport } from "../../../src/domain/target/tests/support.js";\nexport { moduleSupport };\n',
				"src/domain/product/index.ts":
					'import { moduleSupport } from "../target/tests/support.js";\nexport { moduleSupport };\n',
				"src/domain/product/system.ts":
					'import { systemSupport } from "../../../tests/system/policy/support.js";\nexport { systemSupport };\n',
			},
			(root) => {
				for (const file of [
					"src/domain/target/tests/deep-own.test.ts",
					"src/domain/target/tests/deep-other.test.ts",
					"tests/system/policy/deep.spec.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "module-root entrypoint");
				}
				for (const file of [
					"src/domain/target/tests/cross-module.test.ts",
					"src/domain/target/tests/cross-system.test.ts",
					"tests/system/policy/cross-module.test.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "only from its own");
				}
				for (const file of ["src/domain/product/index.ts", "src/domain/product/system.ts"]) {
					expectRule(
						lint(root, [file]),
						"archboard(module-entrypoints)",
						"must not import test-owned source",
					);
				}
			},
		);
	});

	test("rejects every misplaced test spelling and co-located test", async () => {
		await withProject(
			{
				"src/domain/widget/widget.test.ts": "export const misplaced = true;\n",
				"tests/misplaced.spec.ts": "export const misplaced = true;\n",
				"tests/widget_test.ts": "export const misplaced = true;\n",
				"tests/widget_spec.ts": "export const misplaced = true;\n",
			},
			(root) => {
				for (const file of [
					"src/domain/widget/widget.test.ts",
					"tests/misplaced.spec.ts",
					"tests/widget_test.ts",
					"tests/widget_spec.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "must live under");
				}
			},
		);
	});

	test("rejects untyped support and test sources over 500 lines", async () => {
		await withProject(
			{
				"src/domain/widget/index.ts": "export const value = 1;\n",
				"src/domain/widget/tests/untyped.js": "export const untyped = true;\n",
				"tests/system/policy/untyped.jsx": "export const untyped = true;\n",
				"src/domain/widget/tests/oversized.test.ts": "// fixture\n".repeat(501),
				"tests/system/policy/oversized.test.ts": "// fixture\n".repeat(501),
			},
			(root) => {
				for (const file of [
					"src/domain/widget/tests/untyped.js",
					"tests/system/policy/untyped.jsx",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "must be a .ts file");
				}
				for (const file of [
					"src/domain/widget/tests/oversized.test.ts",
					"tests/system/policy/oversized.test.ts",
				]) {
					expectRule(lint(root, [file]), "eslint(max-lines)", "Maximum allowed is 500");
				}
			},
		);
	});

	test("assigns both test owners to type-aware lint and TypeScript", async () => {
		await withProject(
			{
				"src/domain/widget/index.ts": "export const value = 1;\n",
				"src/domain/widget/tests/widget.test.ts": "export const moduleError: string = 1;\n",
				"src/domain/widget/tests/support.ts": "export const moduleSupportError: string = 1;\n",
				"tests/system/policy/system.test.ts": "export const systemError: string = 1;\n",
				"tests/system/policy/support.ts": "export const systemSupportError: string = 1;\n",
				"scripts/error.ts": "export const scriptError: string = 1;\n",
				"tools/error.ts": "export const toolError: string = 1;\n",
			},
			(root) => {
				const assigned = lint(
					root,
					["src/domain/widget/tests/widget.test.ts", "tests/system/policy/system.test.ts"],
					["--type-aware", "--debug=files"],
				);
				expectPass(assigned);
				expect(assigned.output).toContain("src/domain/widget/tests/widget.test.ts");
				expect(assigned.output).toContain("tests/system/policy/system.test.ts");

				const typed = run(root, [tsc, "--noEmit", "-p", "tsconfig.json"]);
				expect(typed.exitCode, typed.output).not.toBe(0);
				for (const file of [
					"src/domain/widget/tests/widget.test.ts",
					"src/domain/widget/tests/support.ts",
					"tests/system/policy/system.test.ts",
					"tests/system/policy/support.ts",
					"scripts/error.ts",
					"tools/error.ts",
				]) {
					expect(typed.output).toContain(file);
				}
				expect(typed.output).toContain("TS2322");
			},
		);
	});
});
