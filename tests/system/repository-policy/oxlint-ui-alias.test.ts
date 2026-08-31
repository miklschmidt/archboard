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
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-oxlint-ui-alias-"));
	try {
		fs.writeFileSync(path.join(root, ".oxlintrc.jsonc"), repositoryOxlintConfig());
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

function lint(root: string, relativePath: string): CommandResult {
	return run(root, [oxlint, "--config=.oxlintrc.jsonc", "--format=default", relativePath]);
}

function expectPass(result: CommandResult): void {
	expect(result.exitCode, result.output).toBe(0);
}

function expectRule(result: CommandResult, message: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain("archboard(module-entrypoints)");
	expect(result.output).toContain(message);
}

describe("Oxlint canonical UI source alias", () => {
	test("resolves one @/ spelling through the existing module rules", async () => {
		await withProject(
			{
				"src/ui/public/index.ts":
					"export type PublicValue = number;\nexport const publicValue = 1;\n",
				"src/ui/consumer/index.ts": [
					'import { publicValue } from "@/ui/public/index.js";',
					'import type { PublicValue } from "@/ui/public/index.js";',
					'export { publicValue } from "@/ui/public/index.js?raw";',
					'void import("@/ui/public/index.js?raw");',
					"export type TypedValue = PublicValue;\nexport const value = publicValue;",
				].join("\n"),
			},
			(root) => expectPass(lint(root, "src/ui/consumer/index.ts")),
		);
	});

	test("applies deep and cross-area rules after alias resolution", async () => {
		await withProject(
			{
				"src/ui/public/index.ts": "export const publicValue = 1;\n",
				"src/ui/public/lib/private.ts": "export const privateValue = 1;\n",
				"src/ui/consumer/deep.ts":
					'import { privateValue } from "@/ui/public/lib/private.js";\nexport { privateValue };\n',
				"src/domain/consumer/index.ts":
					'import { publicValue } from "@/ui/public/index.js";\nexport { publicValue };\n',
			},
			(root) => {
				const deep = lint(root, "src/ui/consumer/deep.ts");
				expectRule(deep, "through one of its root entrypoint files");

				const crossArea = lint(root, "src/domain/consumer/index.ts");
				expect(crossArea.exitCode, crossArea.output).not.toBe(0);
				expect(crossArea.output).toContain("archboard(import-boundaries)");
				expect(crossArea.output).toContain("forbidden Archboard area dependency");
			},
		);
	});

	test("rejects unknown and escaping aliases through the module rule", async () => {
		await withProject(
			{
				"src/ui/consumer/unknown.ts":
					'import type { Missing } from "@/ui/missing/index.js?raw";\nexport type Value = Missing;\n',
				"src/ui/consumer/escape.ts":
					'import type { Outside } from "@/../../outside/index.js";\nexport type Value = Outside;\n',
			},
			(root) => {
				expectRule(lint(root, "src/ui/consumer/unknown.ts"), "must resolve to a source module");
				expectRule(lint(root, "src/ui/consumer/escape.ts"), "stay inside src/");
			},
		);
	});

	test("applies the same rule to type, dynamic, require, and query spellings", async () => {
		await withProject(
			{
				"src/ui/public/index.ts": "export const publicValue = 1;\n",
				"src/ui/public/lib/private.ts": "export const privateValue = 1;\n",
				"src/ui/consumer/type.ts":
					'import type { privateValue } from "@/ui/public/lib/private.js?raw";\nexport type Value = typeof privateValue;\n',
				"src/ui/consumer/dynamic.ts": 'void import("@/ui/public/lib/private.js?raw");\n',
				"src/ui/consumer/require.ts":
					'const privateValue = require("@/ui/public/lib/private.js?raw");\nexport { privateValue };\n',
			},
			(root) => {
				for (const file of ["type.ts", "dynamic.ts", "require.ts"]) {
					const result = lint(root, `src/ui/consumer/${file}`);
					expectRule(result, "through one of its root entrypoint files");
				}
				const required = lint(root, "src/ui/consumer/require.ts");
				expect(required.output).toContain("typescript(no-require-imports)");
			},
		);
	});
});
