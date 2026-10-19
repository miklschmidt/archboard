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

/** The two UI rules alone, so a fixture is judged on placement and React imports only. */
const UI_RULES_CONFIG = JSON.stringify({
	jsPlugins: [plugin],
	rules: { "archboard/ui-concern-placement": "error", "archboard/named-react-imports": "error" },
});

/** The repository's own configs, with the plugin and the plugins' packages found from the checkout. */
function repositoryConfig(name: string): string {
	return fs
		.readFileSync(path.join(repoRoot, name), "utf8")
		.replace('"./tools/oxlint-plugin-archboard.ts"', JSON.stringify(plugin))
		.replace('"./node_modules/oxlint/configuration_schema.json"', '""');
}

function withProject<T>(
	config: Record<string, string>,
	files: Record<string, string>,
	check: (root: string) => T,
): T {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-ui-policy-"));
	try {
		fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
		for (const [relative, content] of Object.entries({ ...config, ...files })) {
			const target = path.join(root, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
		return check(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function lint(root: string, config: string, file: string): CommandResult {
	const result = Bun.spawnSync({
		cmd: [oxlint, `--config=${config}`, "--disable-nested-config", "--format=default", file],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function ignored(result: CommandResult): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).not.toContain("max-lines");
}

function refused(result: CommandResult, rule: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain(rule);
}

const HOOK =
	'import { useState } from "react";\nexport function useThing() { return useState(0); }\n';
const NAMED_IMPORT = 'import { useState } from "react";\nexport const value = useState;\n';

describe("the UI rules cover the ui area of a package", () => {
	const fixtures = {
		"packages/alpha/src/ui/components/Card.tsx":
			'import React from "react";\nexport const Card = () => <div />;\nexport const kind = React.version;\n',
		"packages/alpha/tests/ui/components/card.test.tsx":
			'import * as React from "react";\nexport const kind = React.version;\n',
		"packages/alpha/src/ui/components/Named.tsx": NAMED_IMPORT,
		"packages/alpha/src/ui/state/use-thing.ts": HOOK,
		"packages/alpha/src/ui/hooks/use-thing.ts": HOOK,
		"packages/alpha/src/ui/api/thing.ts": 'export { useThing } from "#ui/hooks/use-thing.ts";\n',
		"packages/alpha/src/ui/api/actual-hook.ts": HOOK,
		"packages/alpha/src/ui/components/helper.ts": "export const helper = 1;\n",
		"packages/alpha/src/ui/rules/helper.ts": "export const helper = 1;\n",
		"packages/alpha/src/ui/index.ts": "export const root = 1;\n",
		"packages/alpha/src/ui/rules/Widget.tsx": "export const Widget = () => <div />;\n",
	};

	test("refuses a React namespace import in the source and in the tests of a package", () => {
		withProject({ "oxlint.json": UI_RULES_CONFIG }, fixtures, (root) => {
			for (const file of [
				"packages/alpha/src/ui/components/Card.tsx",
				"packages/alpha/tests/ui/components/card.test.tsx",
			]) {
				refused(lint(root, "oxlint.json", file), "archboard(named-react-imports)");
			}
			expect(lint(root, "oxlint.json", "packages/alpha/src/ui/components/Named.tsx").exitCode).toBe(
				0,
			);
		});
	});

	test("keeps hooks, components and names in the role folder that owns them", () => {
		withProject({ "oxlint.json": UI_RULES_CONFIG }, fixtures, (root) => {
			for (const file of [
				"packages/alpha/src/ui/state/use-thing.ts",
				"packages/alpha/src/ui/api/actual-hook.ts",
				"packages/alpha/src/ui/components/helper.ts",
				"packages/alpha/src/ui/index.ts",
				"packages/alpha/src/ui/rules/Widget.tsx",
			]) {
				refused(lint(root, "oxlint.json", file), "archboard(ui-concern-placement)");
			}
			for (const file of [
				"packages/alpha/src/ui/hooks/use-thing.ts",
				"packages/alpha/src/ui/api/thing.ts",
				"packages/alpha/src/ui/rules/helper.ts",
			]) {
				const result = lint(root, "oxlint.json", file);
				expect(result.exitCode, result.output).toBe(0);
			}
		});
	});
});

describe("the lint configs split package tests the way they split src/ui", () => {
	const longTest = "// pad\n".repeat(601);
	const files = {
		"packages/alpha/tests/ui/components/long.test.tsx": `${longTest}export const value = 1;\n`,
		"packages/alpha/tests/runtime/long.test.tsx": `${longTest}export const value = 1;\n`,
		"packages/alpha/package.json": JSON.stringify({
			name: "@archboard/alpha",
			imports: { "#*": "./src/*" },
		}),
		"packages/alpha/src/runtime/work.ts": "export const work = 1;\n",
		"packages/alpha/tests/ui/screen.test.ts":
			'import { work } from "#runtime/work.ts";\nexport { work };\n',
	};
	const configs = {
		".oxlintrc.jsonc": repositoryConfig(".oxlintrc.jsonc"),
		".oxlintrc.tests.jsonc": repositoryConfig(".oxlintrc.tests.jsonc"),
	};

	test("holds the tests of a package's ui area to the UI policy and caps its other tests", () => {
		withProject(configs, files, (root) => {
			const ui = "packages/alpha/tests/ui/components/long.test.tsx";
			refused(lint(root, ".oxlintrc.jsonc", ui), "eslint(max-lines)");
			ignored(lint(root, ".oxlintrc.tests.jsonc", ui));
			const other = "packages/alpha/tests/runtime/long.test.tsx";
			refused(lint(root, ".oxlintrc.tests.jsonc", other), "eslint(max-lines)");
			ignored(lint(root, ".oxlintrc.jsonc", other));
		});
	});

	test("keeps the area directions for the tests of a package's ui area", () => {
		withProject(configs, files, (root) => {
			refused(
				lint(root, ".oxlintrc.jsonc", "packages/alpha/tests/ui/screen.test.ts"),
				"archboard(import-boundaries)",
			);
		});
	});
});
