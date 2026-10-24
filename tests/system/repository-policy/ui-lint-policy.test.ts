import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const vp = path.join(repoRoot, "node_modules/.bin/vp");
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
		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ name: "lint-fixture", private: true }),
		);
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
		cmd: [vp, "lint", `--config=${config}`, "--disable-nested-config", "--format=default", file],
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

describe("the lint configs split package tests the way they split ui tests", () => {
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

describe("the UI rules cover the ui area and the browser entry of an app", () => {
	const fixtures = {
		"apps/alpha/src/ui/components/Card.tsx":
			'import React from "react";\nexport const Card = () => <div />;\nexport const kind = React.version;\n',
		"apps/alpha/tests/ui/components/card.test.tsx":
			'import * as React from "react";\nexport const kind = React.version;\n',
		"apps/alpha/src/ui/state/use-thing.ts": HOOK,
		"apps/alpha/src/ui/hooks/use-thing.ts": HOOK,
		"apps/alpha/src/ui/api/thing.ts": 'export { useThing } from "#ui/hooks/use-thing.ts";\n',
		"apps/alpha/src/ui/lib/helper.ts": "export const helper = 1;\n",
		"apps/alpha/src/ui/index.ts": "export const root = 1;\n",
		"apps/alpha/src/ui/rules/Widget.tsx": "export const Widget = () => <div />;\n",
	};

	test("refuses a React namespace import in the source and in the tests of an app", () => {
		// Catches an app ui that keeps the ambient React namespace: the guard skipped apps.
		withProject({ "oxlint.json": UI_RULES_CONFIG }, fixtures, (root) => {
			for (const file of [
				"apps/alpha/src/ui/components/Card.tsx",
				"apps/alpha/tests/ui/components/card.test.tsx",
			]) {
				refused(lint(root, "oxlint.json", file), "archboard(named-react-imports)");
			}
		});
	});

	test("keeps hooks, components and names in the role folder that owns them", () => {
		// Catches an app ui with no placement policy: a hook in state, a lib or root folder, and
		// markup in a rules file.
		withProject({ "oxlint.json": UI_RULES_CONFIG }, fixtures, (root) => {
			for (const file of [
				"apps/alpha/src/ui/state/use-thing.ts",
				"apps/alpha/src/ui/lib/helper.ts",
				"apps/alpha/src/ui/index.ts",
				"apps/alpha/src/ui/rules/Widget.tsx",
			]) {
				refused(lint(root, "oxlint.json", file), "archboard(ui-concern-placement)");
			}
			for (const file of [
				"apps/alpha/src/ui/hooks/use-thing.ts",
				"apps/alpha/src/ui/api/thing.ts",
			]) {
				const result = lint(root, "oxlint.json", file);
				expect(result.exitCode, result.output).toBe(0);
			}
		});
	});

	test("the browser entry sits above ui/ with markup, and takes only named React imports", () => {
		// Catches a browser entry that placement refuses because it has no concern folder, and
		// one that escapes the named import guard because it is not in ui/.
		const main = "apps/web/src/main.tsx";
		withProject(
			{ "oxlint.json": UI_RULES_CONFIG },
			{ [main]: 'import { StrictMode } from "react";\nexport const root = <StrictMode />;\n' },
			(root) => expect(lint(root, "oxlint.json", main).exitCode).toBe(0),
		);
		withProject(
			{ "oxlint.json": UI_RULES_CONFIG },
			{ [main]: 'import React from "react";\nexport const kind = React.version;\n' },
			(root) => refused(lint(root, "oxlint.json", main), "archboard(named-react-imports)"),
		);
	});
});

describe("the lint configs split app tests the way they split package tests", () => {
	// More than the 500-line cap of the tests config, less than the 600-line limit of the UI policy.
	const between = "// pad\n".repeat(550);
	const files = {
		"apps/alpha/tests/ui/components/long.test.tsx": `${between}export const value = 1;\n`,
		"apps/alpha/tests/runtime/long.test.tsx": `${between}export const value = 1;\n`,
		"apps/alpha/src/runtime/long.ts": `${"// pad\n".repeat(601)}export const value = 1;\n`,
		"apps/alpha/package.json": JSON.stringify({
			name: "@archboard-app/alpha",
			imports: { "#*": "./src/*" },
		}),
		"apps/alpha/src/runtime/work.ts": "export const work = 1;\n",
		"apps/alpha/tests/ui/screen.test.ts":
			'import { work } from "#runtime/work.ts";\nexport { work };\n',
	};
	const configs = {
		".oxlintrc.jsonc": repositoryConfig(".oxlintrc.jsonc"),
		".oxlintrc.tests.jsonc": repositoryConfig(".oxlintrc.tests.jsonc"),
	};

	test("holds the tests of an app's ui area to the UI policy and caps its other tests", () => {
		// Catches an app test routed to the wrong config: its ui tests get the 600-line UI limit
		// from the main config, and its other tests the 500-line cap from the tests config.
		withProject(configs, files, (root) => {
			const ui = "apps/alpha/tests/ui/components/long.test.tsx";
			expect(lint(root, ".oxlintrc.jsonc", ui).exitCode).toBe(0);
			ignored(lint(root, ".oxlintrc.tests.jsonc", ui));
			const other = "apps/alpha/tests/runtime/long.test.tsx";
			refused(lint(root, ".oxlintrc.tests.jsonc", other), "eslint(max-lines)");
			ignored(lint(root, ".oxlintrc.jsonc", other));
		});
	});

	test("holds the source of an app to the 600-line limit of the policy config", () => {
		// Catches app source that no config lints.
		withProject(configs, files, (root) => {
			refused(lint(root, ".oxlintrc.jsonc", "apps/alpha/src/runtime/long.ts"), "eslint(max-lines)");
		});
	});

	test("keeps the area directions for the tests of an app's ui area", () => {
		// Catches an app ui test that imports runtime code, which no config would then judge.
		withProject(configs, files, (root) => {
			refused(
				lint(root, ".oxlintrc.jsonc", "apps/alpha/tests/ui/screen.test.ts"),
				"archboard(import-boundaries)",
			);
		});
	});
});

describe("the frame clock rule follows the board canvas into apps/web", () => {
	// A frame-clocked file reads the browser's clock directly, which a recording cannot step.
	const CLOCK_READ = "export const stamp = [Date.now(), requestAnimationFrame];\n";
	const canvas = [
		"apps/web/src/ui/api/semantic-board-canvas/stamp.ts",
		"apps/web/src/ui/clients/semantic-board-canvas/stamp.ts",
		"apps/web/src/ui/components/semantic-board-canvas/Stamp.tsx",
		"apps/web/src/ui/constants/semantic-board-canvas/stamp.ts",
		"apps/web/src/ui/hooks/semantic-board-canvas/use-stamp.ts",
		"apps/web/src/ui/rules/semantic-board-canvas/stamp.ts",
		"apps/web/src/ui/state/semantic-board-canvas/stamp.ts",
		"apps/web/src/ui/workers/semantic-board-canvas/stamp.ts",
	];
	const tests = canvas.map((file) => file.replace("/src/", "/tests/"));
	const sibling = [
		"apps/web/src/ui/components/shell/Stamp.tsx",
		"apps/web/src/ui/hooks/semantic-board-canvasx/use-stamp.ts",
	];
	const files = Object.fromEntries(
		[...canvas, ...tests, ...sibling].map((file) => [file, CLOCK_READ]),
	);

	test("restricts the clocks at a canvas path of apps/web and leaves its sibling behaviors alone", () => {
		// Catches the restriction vanishing when the canvas moves: the override named only
		// the old paths. A sibling behavior stays free to read the clock, so it was not widened.
		withProject({ ".oxlintrc.jsonc": repositoryConfig(".oxlintrc.jsonc") }, files, (root) => {
			for (const file of canvas) {
				const result = lint(root, ".oxlintrc.jsonc", file);
				refused(result, "eslint(no-restricted-properties)");
				refused(result, "eslint(no-restricted-globals)");
			}
			// Sibling behaviors and canvas tests keep their browser clocks.
			for (const file of [...sibling, ...tests]) {
				const result = lint(root, ".oxlintrc.jsonc", file);
				expect(result.output, file).not.toContain("no-restricted-properties");
				expect(result.exitCode, result.output).toBe(0);
			}
		});
	});
});
