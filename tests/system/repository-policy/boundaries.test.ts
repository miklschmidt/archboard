import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const plugin = path.join(repoRoot, "tools/oxlint-plugin-archboard.ts");

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
	const authored = fs.readFileSync(path.join(repoRoot, ".oxlintrc.tests.jsonc"), "utf8");
	const relativePlugin = '"./tools/oxlint-plugin-archboard.ts"';
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
				"packages/alpha/package.json": JSON.stringify({ imports: { "#*": "./src/*" } }),
				"packages/alpha/src/shared/sibling.ts": 'import "#shared/other.ts";',
				"packages/alpha/src/shared/relative.ts": 'import "./other";',
				"packages/alpha/src/shared/escape.ts": 'import "../../../beta/src/shared/other";',
			},
			(root) => {
				expectPass(
					lint(root, ["src/ui/source/allowed.ts", "packages/alpha/src/shared/sibling.ts"]),
				);
				for (const file of ["escape", "relative"]) {
					expectRule(
						lint(root, [`packages/alpha/src/shared/${file}.ts`]),
						"archboard(absolute-imports)",
					);
				}
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
				"tests/system/repository-policy/support/test-wall-clock.ts":
					"export function declareTestWallClockBudget() {}\n",
				"src/domain/tested/tests/real-time.test.ts":
					'import { declareTestWallClockBudget } from "../../../../tests/system/repository-policy/support/test-wall-clock.js";\nexport { declareTestWallClockBudget };\n',
			},
			(root) =>
				expectPass(
					lint(root, [
						"src/domain/allowed/index.ts",
						"src/domain/tested/tests/widget.spec.ts",
						"src/domain/tested/tests/real-time.test.ts",
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
				"src/shared/wire-contract/index.ts": "export type ClientRequest = unknown;\n",
				"src/shared/wire-contract/generated/ClientRequest.ts":
					"export type ClientRequest = unknown;\n",
				"src/runtime/codex-session/index.ts":
					'import type { ClientRequest } from "../../shared/wire-contract/generated/ClientRequest.js";\nexport type Request = ClientRequest;\n',
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
	// src/ui is owned by the separate UI policy (600 physical lines), so the
	// tests configuration's 500-line cap is proven on a non-UI area.
	test("accepts compiler-covered TSX owners and still caps them", async () => {
		await withProject(
			{
				"src/domain/widget/index.ts": "export const value = 1;\n",
				"src/domain/widget/tests/rendered.test.tsx": "export const rendered = true;\n",
				"src/domain/widget/tests/oversized.test.tsx": "// fixture\n".repeat(501),
			},
			(root) => {
				expectPass(lint(root, ["src/domain/widget/tests/rendered.test.tsx"]));
				expectRule(
					lint(root, ["src/domain/widget/tests/oversized.test.tsx"]),
					"eslint(max-lines)",
					"Maximum allowed is 500",
				);
			},
		);
	});

	// A package states its interface in `exports`: the area rules hold between the folders of
	// one package, only an export is public, and `./testing` is for tests alone.
	const IMPORTS = { "#*": "./src/*", "#tests/*": "./tests/*" };
	const packageFiles = {
		"packages/alpha/package.json": JSON.stringify({
			name: "@archboard/alpha",
			imports: IMPORTS,
			exports: {
				".": "./src/shared/constants/value.ts",
				"./testing": "./src/shared/testing.ts",
			},
		}),
		"packages/alpha/src/shared/constants/value.ts": "export const value = 1;\n",
		"packages/alpha/src/shared/constants/private.ts": "export const privateValue = 1;\n",
		"packages/alpha/src/shared/testing.ts": "export const fixture = 1;\n",
		"packages/alpha/src/runtime/work.ts": "export const work = 1;\n",
		"packages/alpha/tests/support.ts": "export const support = 1;\n",
		"packages/gamma/package.json": JSON.stringify({
			name: "@archboard/gamma",
			imports: IMPORTS,
			exports: { ".": "./src/shared/both.ts", "./testing": "./src/shared/both.ts" },
		}),
		"packages/gamma/src/shared/both.ts": "export const both = 1;\n",
		"packages/beta/package.json": JSON.stringify({
			name: "@archboard/beta",
			imports: IMPORTS,
			exports: { ".": "./src/runtime/beta.ts" },
		}),
		"packages/beta/src/runtime/beta.ts": "export const beta = 1;\n",
	};

	test("a package exposes its exports, and a test reaches the private files of its own package", async () => {
		await withProject(
			{
				...packageFiles,
				"packages/alpha/src/runtime/ok.ts":
					'import { value } from "#shared/constants/value.ts";\nexport { value };\n',
				"packages/alpha/tests/own.test.ts":
					'import { privateValue } from "#shared/constants/private.ts";\nimport { support } from "#tests/support.ts";\nexport { privateValue, support };\n',
				"packages/beta/tests/public.test.ts":
					'import { value } from "@archboard/alpha";\nimport { fixture } from "@archboard/alpha/testing";\nexport { fixture, value };\n',
				"packages/alpha/tests/own-testing.test.ts":
					'import { fixture } from "#shared/testing.ts";\nimport { fixture as exported } from "@archboard/alpha/testing";\nexport { exported, fixture };\n',
				"packages/beta/src/runtime/gamma.ts":
					'import { both } from "@archboard/gamma";\nexport { both };\n',
				"src/domain/consumer/index.ts":
					'import { value } from "@archboard/alpha";\nimport { elk } from "@archboard/not-a-workspace-package";\nexport { elk, value };\n',
			},
			(root) =>
				expectPass(
					lint(root, [
						"packages/alpha/src/runtime/ok.ts",
						"packages/alpha/tests/own.test.ts",
						"packages/beta/tests/public.test.ts",
						"packages/alpha/tests/own-testing.test.ts",
						"packages/beta/src/runtime/gamma.ts",
						"src/domain/consumer/index.ts",
					]),
				),
		);
	});

	test("a package refuses deep imports, and production never imports tests or ./testing", async () => {
		await withProject(
			{
				...packageFiles,
				"src/domain/deep/relative.ts":
					'import { privateValue } from "../../../packages/alpha/src/shared/constants/private.js";\nexport { privateValue };\n',
				"src/domain/deep/specifier.ts":
					'import { privateValue } from "@archboard/alpha/src/shared/constants/private.ts";\nexport { privateValue };\n',
				"packages/beta/tests/deep.test.ts":
					'import { privateValue } from "../../alpha/src/shared/constants/private.js";\nexport { privateValue };\n',
				"src/domain/product/testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"packages/beta/src/runtime/testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"packages/alpha/src/runtime/tests.ts":
					'import { support } from "#tests/support.ts";\nexport { support };\n',
				"packages/beta/tests/foreign.test.ts":
					'import { support } from "../../alpha/tests/support.js";\nexport { support };\n',
				"packages/alpha/src/runtime/own-testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"packages/alpha/src/runtime/own-testing-path.ts":
					'import { fixture } from "#shared/testing.ts";\nexport { fixture };\n',
				"src/domain/product/both.ts":
					'import { both } from "@archboard/gamma/testing";\nexport { both };\n',
				"packages/beta/src/runtime/both-path.ts":
					'import { both } from "../../../gamma/src/shared/both.js";\nexport { both };\n',
				"src/domain/deep/linked.ts":
					'import { privateValue } from "../../../node_modules/@archboard/alpha/src/shared/constants/private.js";\nexport { privateValue };\n',
				"packages/beta/tests/linked.test.ts":
					'import { support } from "../../../node_modules/@archboard/alpha/tests/support.js";\nexport { support };\n',
				"packages/beta/tests/mock-bun.test.ts":
					'import { mock } from "bun:test";\n\nmock.module("../../alpha/src/shared/constants/private.js", () => ({}));\n',
				"packages/beta/tests/mock-vitest.test.ts":
					'import { vi } from "vitest";\n\nvi.mock("../../alpha/src/shared/constants/private.js");\n',
			},
			(root) => {
				fs.mkdirSync(path.join(root, "node_modules/@archboard"), { recursive: true });
				fs.symlinkSync(
					path.join(root, "packages/alpha"),
					path.join(root, "node_modules/@archboard/alpha"),
				);
				for (const file of [
					"src/domain/deep/relative.ts",
					"src/domain/deep/specifier.ts",
					"packages/beta/tests/deep.test.ts",
					"src/domain/deep/linked.ts",
					"packages/beta/tests/mock-bun.test.ts",
					"packages/beta/tests/mock-vitest.test.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "exports names");
				}
				for (const file of [
					"src/domain/product/testing.ts",
					"packages/beta/src/runtime/testing.ts",
					"packages/alpha/src/runtime/tests.ts",
					"packages/alpha/src/runtime/own-testing.ts",
					"packages/alpha/src/runtime/own-testing-path.ts",
					"src/domain/product/both.ts",
					"packages/beta/src/runtime/both-path.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "test-owned source");
				}
				for (const file of [
					"packages/beta/tests/foreign.test.ts",
					"packages/beta/tests/linked.test.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(module-entrypoints)", "only from its own");
				}
			},
		);
	});

	test("the area directions hold between the folders of one package", async () => {
		await withProject(
			{
				...packageFiles,
				"packages/alpha/src/shared/leak.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"packages/alpha/src/ui/screen.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"packages/alpha/tests/ui/screen.test.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"src/shared/screen/index.ts": 'import { beta } from "@archboard/beta";\nexport { beta };\n',
			},
			(root) => {
				for (const file of [
					"packages/alpha/src/shared/leak.ts",
					"packages/alpha/src/ui/screen.ts",
					"packages/alpha/tests/ui/screen.test.ts",
					"src/shared/screen/index.ts",
				]) {
					expectRule(lint(root, [file]), "archboard(import-boundaries)");
				}
			},
		);
	});
});
