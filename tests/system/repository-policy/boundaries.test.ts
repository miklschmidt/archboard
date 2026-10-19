// The plugin's rules about packages and tests, one fixture project per test. Apps are
// app-boundaries.test.ts. Each test names the regression it catches.
import { describe, test } from "bun:test";

import {
	expectJudged,
	expectPass,
	expectRule,
	linkInto,
	lint,
	plugin,
	withProject,
} from "./support/oxlint-project.ts";

const NOT_EXPORTED = "exports names";
const PRODUCT_TESTS = "test-owned source";
const FOREIGN_TESTS = "only from its own";
const AREA = "forbidden Archboard area";

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
	"packages/alpha/src/shared/generated/ClientRequest.ts": "export type ClientRequest = unknown;\n",
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
	"tests/system/policy/support.ts": "export const systemSupport = 1;\n",
	"tests/system/repository-policy/support/test-wall-clock.ts":
		"export function declareTestWallClockBudget() {}\n",
};

describe("Archboard boundary plugin in real Oxlint subprocesses", () => {
	test("local source uses # imports and TypeScript", async () => {
		// Catches a relative import or a JavaScript file in a package, which no other lane refuses.
		await withProject(
			{
				".oxlintrc.jsonc": JSON.stringify({
					categories: { correctness: "off" },
					jsPlugins: [plugin],
					rules: { "archboard/absolute-imports": "error", "archboard/typescript-source": "error" },
				}),
				"packages/alpha/package.json": JSON.stringify({ imports: { "#*": "./src/*" } }),
				"packages/alpha/src/shared/sibling.ts": 'import "#shared/other.ts";',
				"packages/alpha/src/shared/relative.ts": 'import "./other";',
				"packages/alpha/src/shared/escape.ts": 'import "../../../beta/src/shared/other";',
				"packages/alpha/src/shared/javascript.js": "export const value = 1;",
			},
			(root) => {
				expectPass(lint(root, ["packages/alpha/src/shared/sibling.ts"]));
				for (const file of ["escape", "relative"]) {
					expectRule(
						lint(root, [`packages/alpha/src/shared/${file}.ts`]),
						"archboard(absolute-imports)",
					);
				}
				expectRule(
					lint(root, ["packages/alpha/src/shared/javascript.js"]),
					"archboard(typescript-source)",
				);
			},
		);
	});

	test("the @/ alias is refused wherever it is spelled", async () => {
		// Catches the alias creeping back through a tsconfig `paths` entry: whatever resolves it,
		// the lint refuses the spelling in a package, an app, a script and every kind of test.
		const aliased = 'import { shared } from "@/shared/source.ts";\nexport { shared };\n';
		const files = [
			"packages/alpha/src/shared/aliased.ts",
			"packages/alpha/tests/aliased.test.ts",
			"apps/cli/src/cli/aliased.ts",
			"scripts/aliased.ts",
			"tests/system/policy/aliased.test.ts",
		];
		await withProject(
			{ ...packageFiles, ...Object.fromEntries(files.map((file) => [file, aliased])) },
			(root) => expectJudged(root, Object.fromEntries(files.map((file) => [file, "@/ alias"]))),
		);
	});

	test("source in the retired roots src/ and frontend/ is refused", async () => {
		// Catches a legacy root coming back: a module, a flat file, the browser entry and a nested
		// frontend tree each sit outside every package and app, so no other rule would judge them.
		const legacy = [
			"src/domain/widget/index.ts",
			"src/shared/value.ts",
			"src/server.ts",
			"frontend/main.tsx",
			"frontend/src/ui/pane.ts",
		];
		await withProject(
			Object.fromEntries(legacy.map((file) => [file, "export const value = 1;\n"])),
			(root) =>
				expectJudged(root, Object.fromEntries(legacy.map((file) => [file, "top-level src/"]))),
		);
	});

	test("allows the documented directions, test owners and the wall-clock declaration", async () => {
		// Catches a rule that refuses what the layout allows: a runtime file reading a shared one,
		// a test reading the private files and the support of its own package, the real-time
		// declaration every owner may use, and the root suite reading a package export.
		await withProject(
			{
				...packageFiles,
				"packages/alpha/src/runtime/ok.ts":
					'import { value } from "#shared/constants/value.ts";\nexport { value };\n',
				"packages/alpha/tests/own.test.ts":
					'import { privateValue } from "#shared/constants/private.ts";\nimport { support } from "#tests/support.ts";\nexport { privateValue, support };\n',
				"packages/alpha/tests/real-time.test.ts":
					'import { declareTestWallClockBudget } from "../../../tests/system/repository-policy/support/test-wall-clock.js";\nexport { declareTestWallClockBudget };\n',
				"packages/beta/tests/public.test.ts":
					'import { value } from "@archboard/alpha";\nimport { fixture } from "@archboard/alpha/testing";\nexport { fixture, value };\n',
				"packages/alpha/tests/own-testing.test.ts":
					'import { fixture } from "#shared/testing.ts";\nimport { fixture as exported } from "@archboard/alpha/testing";\nexport { exported, fixture };\n',
				"packages/beta/src/runtime/gamma.ts":
					'import { both } from "@archboard/gamma";\nexport { both };\n',
				"packages/beta/src/runtime/npm.ts":
					'import { elk } from "@archboard/not-a-workspace-package";\nexport { elk };\n',
				"tests/system/policy/system.test.ts":
					'import { value } from "@archboard/alpha";\nimport { systemSupport } from "./support.js";\nexport { systemSupport, value };\n',
			},
			(root) =>
				expectJudged(root, {}, [
					"packages/alpha/src/runtime/ok.ts",
					"packages/alpha/tests/own.test.ts",
					"packages/alpha/tests/real-time.test.ts",
					"packages/beta/tests/public.test.ts",
					"packages/alpha/tests/own-testing.test.ts",
					"packages/beta/src/runtime/gamma.ts",
					"packages/beta/src/runtime/npm.ts",
					"tests/system/policy/system.test.ts",
				]),
		);
	});

	test("a package refuses deep imports in every spelling, from a package and from the root suite", async () => {
		// Catches a private file of a package reached by an extensionless path, a Vite query, a
		// CommonJS require, a generated-code path, a subpath specifier, a symlink, a mock or the
		// root suite: each passes the package boundary unseen unless the resolver reads it.
		const deep = "../../../alpha/src/shared/constants/private";
		const deepFromTests = "../../alpha/src/shared/constants/private";
		await withProject(
			{
				...packageFiles,
				"packages/beta/src/runtime/relative.ts": `import { privateValue } from "${deep}.js";\nexport { privateValue };\n`,
				"packages/beta/src/runtime/extensionless.ts": `import { privateValue } from "${deep}";\nexport { privateValue };\n`,
				"packages/beta/src/runtime/raw.ts": `import { privateValue } from "${deep}?raw";\nexport { privateValue };\n`,
				"packages/beta/src/runtime/require.ts": `const privateValue = require("${deep}");\nexport { privateValue };\n`,
				"packages/beta/src/runtime/generated.ts":
					'import type { ClientRequest } from "../../../alpha/src/shared/generated/ClientRequest.js";\nexport type Request = ClientRequest;\n',
				"packages/beta/src/runtime/specifier.ts":
					'import { privateValue } from "@archboard/alpha/src/shared/constants/private.ts";\nexport { privateValue };\n',
				"packages/beta/src/runtime/linked.ts":
					'import { privateValue } from "../../../../node_modules/@archboard/alpha/src/shared/constants/private.js";\nexport { privateValue };\n',
				"packages/beta/tests/deep.test.ts": `import { privateValue } from "${deepFromTests}.js";\nexport { privateValue };\n`,
				"packages/beta/tests/mock-bun.test.ts": `import { mock } from "bun:test";\n\nmock.module("${deepFromTests}.js", () => ({}));\n`,
				"packages/beta/tests/mock-vitest.test.ts": `import { vi } from "vitest";\n\nvi.mock("${deepFromTests}.js");\n`,
				"tests/system/policy/deep.test.ts": `import { privateValue } from "../../../packages/alpha/src/shared/constants/private.js";\nexport { privateValue };\n`,
			},
			(root) => {
				linkInto(root, "node_modules/@archboard/alpha", "packages/alpha");
				expectJudged(root, {
					"packages/beta/src/runtime/relative.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/extensionless.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/raw.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/require.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/generated.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/specifier.ts": NOT_EXPORTED,
					"packages/beta/src/runtime/linked.ts": NOT_EXPORTED,
					"packages/beta/tests/deep.test.ts": NOT_EXPORTED,
					"packages/beta/tests/mock-bun.test.ts": NOT_EXPORTED,
					"packages/beta/tests/mock-vitest.test.ts": NOT_EXPORTED,
					"tests/system/policy/deep.test.ts": NOT_EXPORTED,
				});
				expectRule(
					lint(root, ["packages/beta/src/runtime/require.ts"]),
					"typescript(no-require-imports)",
				);
			},
		);
	});

	test("production never imports a tests folder or ./testing, and a test reads only its own owner's support", async () => {
		// Catches product code that borrows test support (a package's tests, the root suite's
		// support, an own `./testing` export) and a test that borrows the support of another owner.
		await withProject(
			{
				...packageFiles,
				"packages/beta/src/runtime/testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"packages/beta/src/runtime/both.ts":
					'import { both } from "@archboard/gamma/testing";\nexport { both };\n',
				"packages/beta/src/runtime/both-path.ts":
					'import { both } from "../../../gamma/src/shared/both.js";\nexport { both };\n',
				"packages/alpha/src/runtime/tests.ts":
					'import { support } from "#tests/support.ts";\nexport { support };\n',
				"packages/alpha/src/runtime/own-testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"packages/alpha/src/runtime/own-testing-path.ts":
					'import { fixture } from "#shared/testing.ts";\nexport { fixture };\n',
				"packages/beta/src/runtime/foreign-tests.ts":
					'import { support } from "../../../alpha/tests/support.js";\nexport { support };\n',
				"packages/beta/src/runtime/system.ts":
					'import { systemSupport } from "../../../../tests/system/policy/support.js";\nexport { systemSupport };\n',
				"packages/beta/tests/foreign.test.ts":
					'import { support } from "../../alpha/tests/support.js";\nexport { support };\n',
				"packages/beta/tests/linked.test.ts":
					'import { support } from "../../../node_modules/@archboard/alpha/tests/support.js";\nexport { support };\n',
				"packages/alpha/tests/cross-system.test.ts":
					'import { systemSupport } from "../../../tests/system/policy/support.js";\nexport { systemSupport };\n',
				"tests/system/policy/cross-package.test.ts":
					'import { support } from "../../../packages/alpha/tests/support.js";\nexport { support };\n',
			},
			(root) => {
				linkInto(root, "node_modules/@archboard/alpha", "packages/alpha");
				expectJudged(root, {
					"packages/beta/src/runtime/testing.ts": PRODUCT_TESTS,
					"packages/beta/src/runtime/both.ts": PRODUCT_TESTS,
					"packages/beta/src/runtime/both-path.ts": PRODUCT_TESTS,
					"packages/alpha/src/runtime/tests.ts": PRODUCT_TESTS,
					"packages/alpha/src/runtime/own-testing.ts": PRODUCT_TESTS,
					"packages/alpha/src/runtime/own-testing-path.ts": PRODUCT_TESTS,
					"packages/beta/src/runtime/foreign-tests.ts": PRODUCT_TESTS,
					"packages/beta/src/runtime/system.ts": PRODUCT_TESTS,
					"packages/beta/tests/foreign.test.ts": FOREIGN_TESTS,
					"packages/beta/tests/linked.test.ts": FOREIGN_TESTS,
					"packages/alpha/tests/cross-system.test.ts": FOREIGN_TESTS,
					"tests/system/policy/cross-package.test.ts": FOREIGN_TESTS,
				});
			},
		);
	});

	// The tests of a package's ui area are linted by the UI policy: ui-lint-policy.test.ts.
	test("the area directions hold between the folders of one package and between packages", async () => {
		// Catches an area import that the owner parser does not see: shared reaching runtime,
		// ui reaching runtime, and shared code of one package reaching the runtime export of another.
		await withProject(
			{
				...packageFiles,
				"packages/alpha/src/shared/leak.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"packages/alpha/src/ui/screen.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"packages/gamma/src/shared/screen.ts":
					'import { beta } from "@archboard/beta";\nexport { beta };\n',
			},
			(root) =>
				expectJudged(root, {
					"packages/alpha/src/shared/leak.ts": AREA,
					"packages/alpha/src/ui/screen.ts": AREA,
					"packages/gamma/src/shared/screen.ts": AREA,
				}),
		);
	});

	test("rejects every misplaced test spelling and co-located test", async () => {
		// Catches a test that Bun would run but no test owner holds: next to its source, in the
		// root tests folder, in either suffix spelling.
		const misplaced = [
			"packages/alpha/src/shared/widget.test.ts",
			"tests/misplaced.spec.ts",
			"tests/widget_test.ts",
			"tests/widget_spec.ts",
		];
		await withProject(
			Object.fromEntries(misplaced.map((file) => [file, "export const misplaced = true;\n"])),
			(root) =>
				expectJudged(root, Object.fromEntries(misplaced.map((file) => [file, "must live under"]))),
		);
	});

	test("rejects untyped test sources, and caps test files at 500 lines", async () => {
		// Catches JavaScript test support that the root tsc never sees, and a test file past the
		// cap of the tests config, in a package, in the root suite, and in TSX too.
		await withProject(
			{
				"packages/alpha/tests/runtime/untyped.js": "export const untyped = true;\n",
				"tests/system/policy/untyped.jsx": "export const untyped = true;\n",
				"packages/alpha/tests/runtime/rendered.test.tsx": "export const rendered = true;\n",
				"packages/alpha/tests/runtime/oversized.test.ts": "// fixture\n".repeat(501),
				"packages/alpha/tests/runtime/oversized.test.tsx": "// fixture\n".repeat(501),
				"tests/system/policy/oversized.test.ts": "// fixture\n".repeat(501),
			},
			(root) => {
				expectJudged(
					root,
					{
						"packages/alpha/tests/runtime/untyped.js": "must use .ts",
						"tests/system/policy/untyped.jsx": "must use .ts",
						"packages/alpha/tests/runtime/oversized.test.ts": "too many lines",
						"packages/alpha/tests/runtime/oversized.test.tsx": "too many lines",
						"tests/system/policy/oversized.test.ts": "too many lines",
					},
					["packages/alpha/tests/runtime/rendered.test.tsx"],
				);
			},
		);
	});
});
