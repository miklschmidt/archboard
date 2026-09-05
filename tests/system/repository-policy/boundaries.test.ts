import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
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
			PATH: `${path.join(repoRoot, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`,
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
	if (!authored.includes(relativePlugin)) {
		throw new Error("repository Oxlint plugin path is missing");
	}
	return authored.replace(relativePlugin, JSON.stringify(plugin));
}

async function withProject<T>(
	files: Record<string, string>,
	check: (root: string) => T | Promise<T>,
): Promise<T> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-boundaries-"));
	try {
		fs.writeFileSync(path.join(root, ".oxlintrc.jsonc"), repositoryOxlintConfig());
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

function lintCommand(relativePaths: string[]): string[] {
	return [oxlint, "--config=.oxlintrc.jsonc", "--format=default", ...relativePaths];
}

function lint(root: string, relativePaths: string[]): CommandResult {
	return run(root, lintCommand(relativePaths));
}

function expectPass(result: CommandResult): void {
	expect(result.exitCode, result.output).toBe(0);
}

function expectRule(result: CommandResult, rule: string, guidance?: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain(rule);
	if (guidance) {
		expect(result.output).toContain(guidance);
	}
}

describe("Archboard boundary plugin in real Oxlint subprocesses", () => {
	test("local source uses aliases and TypeScript", async () => {
		await withProject(
			{
				".oxlintrc.jsonc": JSON.stringify({
					categories: { correctness: "off" },
					jsPlugins: [plugin],
					rules: { "archboard/absolute-imports": "error", "archboard/typescript-source": "error" },
				}),
				"src/ui/source/allowed.ts": 'import "@/shared/source";',
				"src/ui/source/relative.ts": 'import "./allowed";',
				"src/ui/source/javascript.js": "export const value = 1;",
			},
			(root) => {
				expectPass(lint(root, ["src/ui/source/allowed.ts"]));
				expectRule(lint(root, ["src/ui/source/relative.ts"]), "archboard(absolute-imports)");
				expectRule(lint(root, ["src/ui/source/javascript.js"]), "archboard(typescript-source)");
			},
		);
	});

	test("allows root entrypoints, documented dependency directions, and flat test owners", async () => {
		await withProject(
			{
				"src/shared/common/index.ts": "export const sharedValue = 1;\n",
				"src/domain/target/index.ts": "export const domainValue = 1;\n",
				"src/domain/allowed/index.ts":
					'import { sharedValue } from "../../shared/common/index.js";\nimport { domainValue } from "../target";\n\nexport const value = sharedValue + domainValue;\n',
				"src/domain/tested/index.ts": "export const moduleValue = 1;\n",
				"src/domain/tested/tests/support.ts": "export const support = 1;\n",
				"src/domain/tested/tests/widget.spec.ts":
					'import { moduleValue } from "../index.js";\nimport { support } from "./support.js";\n\nexport const value = moduleValue + support;\n',
				"tests/system/policy/support.ts": "export const support = 1;\n",
				"tests/system/policy/system.test.ts":
					'import { moduleValue } from "../../../src/domain/tested/index.js";\nimport { support } from "./support.js";\n\nexport const value = moduleValue + support;\n',
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
				"src/shared/codex-app-server-contract/index.ts": "export type ClientRequest = unknown;\n",
				"src/shared/codex-app-server-contract/generated/ClientRequest.ts":
					"export type ClientRequest = unknown;\n",
				"src/runtime/codex-session/index.ts":
					'import type { ClientRequest } from "../../shared/codex-app-server-contract/generated/ClientRequest.js";\nexport type Request = ClientRequest;\n',
			},
			(root) => {
				for (const file of ["extensionless.ts", "raw.ts"]) {
					expectRule(lint(root, [`src/domain/importer/${file}`]), "archboard(module-entrypoints)");
				}
				const required = lint(root, ["src/domain/importer/require.ts"]);
				expectRule(required, "archboard(module-entrypoints)");
				expect(required.output).toContain("typescript(no-require-imports)");
				expectRule(
					lint(root, ["src/runtime/codex-session/index.ts"]),
					"archboard(module-entrypoints)",
					"root entrypoint",
				);
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
					expectRule(
						lint(root, [file]),
						"archboard(module-entrypoints)",
						"must use .ts, .tsx, .mts or .cts",
					);
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

	// The root compiler now covers every retained TypeScript source extension.
	test("accepts compiler-covered TSX owners and still caps them", async () => {
		await withProject(
			{
				"src/ui/widget/index.ts": "export const value = 1;\n",
				"src/ui/widget/tests/rendered.test.tsx": "export const rendered = true;\n",
				"src/ui/widget/tests/oversized.test.tsx": "// fixture\n".repeat(501),
				"src/domain/widget/index.ts": "export const value = 1;\n",
				"src/domain/widget/tests/rendered.test.tsx": "export const rendered = true;\n",
			},
			(root) => {
				expectPass(lint(root, ["src/ui/widget/tests/rendered.test.tsx"]));
				expectPass(lint(root, ["src/domain/widget/tests/rendered.test.tsx"]));
				expectRule(
					lint(root, ["src/ui/widget/tests/oversized.test.tsx"]),
					"eslint(max-lines)",
					"Maximum allowed is 500",
				);
			},
		);
	});
});
