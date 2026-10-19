// The plugin holds an app (`apps/<name>`) to the rules of a package, with one difference: nothing
// imports an app. Each test lints one fixture project with the rules alone, so it names the
// rule that refuses each file. How the repository's configs route a path is ui-lint-policy.test.ts.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { diagnosticsOf, plugin, withProject } from "./support/oxlint-project.ts";

const RULES = JSON.stringify({
	categories: { correctness: "off" },
	jsPlugins: [plugin],
	rules: {
		"archboard/import-boundaries": "error",
		"archboard/module-entrypoints": "error",
		"archboard/mapped-source-paths": "error",
		"archboard/root-implementation-modules": "error",
		"archboard/no-generic-buckets": "error",
		"archboard/no-compatibility-identifiers": "error",
		"archboard/state-files-pure": "error",
	},
});

// A phrase of the message that names why a file is refused, so a file refused for another
// reason does not pass.
const NOT_EXPORTED = "exports names";
const NOT_AN_APP_IMPORT = "imports an app";
const UNRESOLVED = "must name an existing file";
const FOREIGN_TESTS = "only from its own";
const PRODUCT_TESTS = "test-owned source";
const AREA = "forbidden Archboard area";

const IMPORTS = { "#*": "./src/*", "#tests/*": "./tests/*" };
const appManifest = (name: string): string =>
	JSON.stringify({ name: `@archboard-app/${name}`, private: true, imports: IMPORTS });

const world: Record<string, string> = {
	".oxlintrc.jsonc": RULES,
	"package.json": JSON.stringify({ imports: { "#web/*": "./apps/web/src/*" } }),
	"apps/cli/package.json": appManifest("cli"),
	"apps/web/package.json": appManifest("web"),
	"apps/server/package.json": appManifest("server"),
	"apps/cli/src/runtime/clipboard.ts": "export const clip = 1;\n",
	"apps/cli/tests/support.ts": "export const cliSupport = 1;\n",
	"apps/web/src/ui/components/Card.tsx": "export const Card = () => null;\n",
	"apps/web/src/runtime/work.ts": "export const work = 1;\n",
	"apps/web/src/server/host.ts": "export const host = 1;\n",
	"apps/web/tests/support.ts": "export const webSupport = 1;\n",
	"apps/server/src/server/host.ts": "export const serverHost = 1;\n",
	"packages/alpha/package.json": JSON.stringify({
		name: "@archboard/alpha",
		imports: IMPORTS,
		exports: { ".": "./src/shared/constants/value.ts", "./testing": "./src/shared/testing.ts" },
	}),
	"packages/alpha/src/shared/constants/value.ts": "export const value = 1;\n",
	"packages/alpha/src/shared/constants/private.ts": "export const privateValue = 1;\n",
	"packages/alpha/src/shared/testing.ts": "export const fixture = 1;\n",
	"packages/alpha/tests/support.ts": "export const alphaSupport = 1;\n",
	"packages/beta/package.json": JSON.stringify({
		name: "@archboard/beta",
		imports: IMPORTS,
		exports: { ".": "./src/runtime/beta.ts" },
	}),
	"packages/beta/src/runtime/beta.ts": "export const beta = 1;\n",
};

/** Lint the files of a project, and name what each refused file earns and what passes. */
function expectJudged(
	root: string,
	refused: Record<string, string>,
	allowed: readonly string[] = [],
): void {
	const found = diagnosticsOf(root, [...Object.keys(refused), ...allowed]);
	for (const [file, phrase] of Object.entries(refused)) {
		const messages = found.filter((entry) => entry.file === file).map((entry) => entry.message);
		expect(
			messages.some((message) => message.includes(phrase)),
			`${file} should be refused for "${phrase}", got: ${JSON.stringify(messages)}`,
		).toBe(true);
	}
	expect(found.filter((entry) => allowed.includes(entry.file))).toEqual([]);
}

/** A file that imports `clip` from a specifier and re-exports it. */
function importing(from: string): string {
	return `import { clip } from "${from}";\nexport { clip };\n`;
}

function linkInto(root: string, link: string, target: string): void {
	fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
	fs.symlinkSync(path.join(root, target), path.join(root, link));
}

describe("an app is held to the rules of a package", () => {
	test("an app reaches its own files, its own tests and the exports of a package", async () => {
		// Catches an owner parser that drops apps: # imports would stop resolving, own tests
		// would be refused private access, or an export would read as private.
		await withProject(
			{
				...world,
				"apps/cli/src/cli/run.ts":
					'import { clip } from "#runtime/clipboard.ts";\nimport { value } from "@archboard/alpha";\nexport { clip, value };\n',
				"apps/cli/src/bin.ts": 'await import("#cli/run.ts");\n',
				"apps/cli/tests/own.test.ts":
					'import { run } from "#cli/run.ts";\nimport { cliSupport } from "#tests/support.ts";\nimport { fixture } from "@archboard/alpha/testing";\nexport { cliSupport, fixture, run };\n',
			},
			(root) =>
				expectJudged(root, {}, [
					"apps/cli/src/cli/run.ts",
					"apps/cli/src/bin.ts",
					"apps/cli/tests/own.test.ts",
				]),
		);
	});

	test("an app imports a package only through its exports, in every import form", async () => {
		// Catches a package-private file that an app reaches by a path, a specifier, a re-export,
		// a dynamic import, a mock or a symlink: each passes the package boundary unseen.
		const deep = "../../../../packages/alpha/src/shared/constants/private.js";
		await withProject(
			{
				...world,
				"apps/cli/src/cli/relative.ts": `import { privateValue } from "${deep}";\nexport { privateValue };\n`,
				"apps/cli/src/cli/specifier.ts":
					'import { privateValue } from "@archboard/alpha/src/shared/constants/private.ts";\nexport { privateValue };\n',
				"apps/cli/src/cli/dynamic.ts": `export const loaded = import("${deep}");\n`,
				"apps/cli/src/cli/reexport.ts": `export { privateValue } from "${deep}";\n`,
				"apps/cli/src/cli/linked.ts":
					'import { privateValue } from "../../../../node_modules/@archboard/alpha/src/shared/constants/private.js";\nexport { privateValue };\n',
				"apps/cli/tests/mock.test.ts": `import { mock } from "bun:test";\n\nmock.module("../../../packages/alpha/src/shared/constants/private.js", () => ({}));\n`,
				"apps/cli/src/cli/testing.ts":
					'import { fixture } from "@archboard/alpha/testing";\nexport { fixture };\n',
				"apps/cli/src/cli/package-tests.ts":
					'import { alphaSupport } from "../../../../packages/alpha/tests/support.js";\nexport { alphaSupport };\n',
			},
			(root) => {
				linkInto(root, "node_modules/@archboard/alpha", "packages/alpha");
				expectJudged(root, {
					"apps/cli/src/cli/relative.ts": NOT_EXPORTED,
					"apps/cli/src/cli/specifier.ts": NOT_EXPORTED,
					"apps/cli/src/cli/dynamic.ts": NOT_EXPORTED,
					"apps/cli/src/cli/reexport.ts": NOT_EXPORTED,
					"apps/cli/src/cli/linked.ts": NOT_EXPORTED,
					"apps/cli/tests/mock.test.ts": NOT_EXPORTED,
					"apps/cli/src/cli/testing.ts": PRODUCT_TESTS,
					"apps/cli/src/cli/package-tests.ts": PRODUCT_TESTS,
				});
			},
		);
	});

	test("nothing imports an app, whoever asks and however it is spelled", async () => {
		// Catches an app reached by a package, by another app, by a script or by a test: the app
		// target is judged before the package exports, and only its own owner may import it.
		const clip = "apps/cli/src/runtime/clipboard.js";
		await withProject(
			{
				...world,
				"packages/alpha/src/runtime/static.ts": `import { clip } from "../../../../${clip}";\nexport { clip };\n`,
				"packages/alpha/src/runtime/dynamic.ts": `export const loaded = import("../../../../${clip}");\n`,
				"packages/alpha/src/runtime/linked.ts":
					'import { clip } from "../../../../node_modules/@archboard-app/cli/src/runtime/clipboard.js";\nexport { clip };\n',
				"packages/alpha/tests/app.test.ts": `import { clip } from "../../../${clip}";\nexport { clip };\n`,
				"apps/web/src/ui/components/Cross.ts":
					'import { clip } from "../../../../cli/src/runtime/clipboard.js";\nexport { clip };\n',
				"apps/web/tests/mock.test.ts": `import { mock } from "bun:test";\n\nmock.module("../../cli/src/runtime/clipboard.js", () => ({}));\n`,
				"apps/server/src/server/reexport.ts":
					'export { clip } from "../../../cli/src/runtime/clipboard.js";\n',
				"scripts/consumer.ts": `import { clip } from "../${clip}";\nexport { clip };\n`,
				"src/domain/consumer/index.ts": `import { clip } from "../../../${clip}";\nexport { clip };\n`,
				"tests/system/policy/app.test.ts": `import { clip } from "../../../${clip}";\nexport { clip };\n`,
			},
			(root) => {
				linkInto(root, "node_modules/@archboard-app/cli", "apps/cli");
				expectJudged(root, {
					"packages/alpha/src/runtime/static.ts": NOT_AN_APP_IMPORT,
					"packages/alpha/src/runtime/dynamic.ts": NOT_AN_APP_IMPORT,
					"packages/alpha/src/runtime/linked.ts": NOT_AN_APP_IMPORT,
					"packages/alpha/tests/app.test.ts": NOT_AN_APP_IMPORT,
					"apps/web/src/ui/components/Cross.ts": NOT_AN_APP_IMPORT,
					"apps/web/tests/mock.test.ts": NOT_AN_APP_IMPORT,
					"apps/server/src/server/reexport.ts": NOT_AN_APP_IMPORT,
					"scripts/consumer.ts": NOT_AN_APP_IMPORT,
					"src/domain/consumer/index.ts": NOT_AN_APP_IMPORT,
					"tests/system/policy/app.test.ts": NOT_AN_APP_IMPORT,
				});
			},
		);
	});

	test("the workspace name of an app is no way in, for anyone and in every import form", async () => {
		// Catches a bare @archboard-app/<name> specifier, which Bun resolves through the workspace
		// link in node_modules, earning no diagnostic: it names the app and any subpath of it, and
		// even the owning app may not use its own name, because an app exports nothing.
		const named = "@archboard-app/cli/src/runtime/clipboard.ts";
		await withProject(
			{
				...world,
				"packages/alpha/src/runtime/static.ts": importing(named),
				"packages/alpha/src/runtime/root.ts": importing("@archboard-app/cli"),
				"packages/alpha/src/runtime/dynamic.ts": `export const loaded = import("${named}");\n`,
				"packages/alpha/src/runtime/query.ts": importing(`${named}?raw`),
				"packages/alpha/tests/app.test.ts": importing(named),
				"apps/web/src/ui/components/Cross.ts": importing(named),
				"apps/web/tests/mock.test.ts": `import { mock } from "bun:test";\n\nmock.module("${named}", () => ({}));\n`,
				"apps/server/src/server/reexport.ts": `export { clip } from "${named}";\n`,
				"apps/cli/src/cli/self.ts": importing(named),
				"apps/cli/src/cli/self-root.ts": importing("@archboard-app/cli"),
				"scripts/consumer.ts": importing(named),
				"src/domain/consumer/index.ts": importing(named),
				"tests/system/policy/app.test.ts": importing(named),
				// Not an app, and not a package: an npm name that happens to share the scope.
				"scripts/npm.ts": importing("@archboard-app/missing/src/x.ts"),
			},
			(root) =>
				expectJudged(
					root,
					{
						"packages/alpha/src/runtime/static.ts": NOT_AN_APP_IMPORT,
						"packages/alpha/src/runtime/root.ts": NOT_AN_APP_IMPORT,
						"packages/alpha/src/runtime/dynamic.ts": NOT_AN_APP_IMPORT,
						"packages/alpha/src/runtime/query.ts": NOT_AN_APP_IMPORT,
						"packages/alpha/tests/app.test.ts": NOT_AN_APP_IMPORT,
						"apps/web/src/ui/components/Cross.ts": NOT_AN_APP_IMPORT,
						"apps/web/tests/mock.test.ts": NOT_AN_APP_IMPORT,
						"apps/server/src/server/reexport.ts": NOT_AN_APP_IMPORT,
						"apps/cli/src/cli/self.ts": NOT_AN_APP_IMPORT,
						"apps/cli/src/cli/self-root.ts": NOT_AN_APP_IMPORT,
						"scripts/consumer.ts": NOT_AN_APP_IMPORT,
						"src/domain/consumer/index.ts": NOT_AN_APP_IMPORT,
						"tests/system/policy/app.test.ts": NOT_AN_APP_IMPORT,
					},
					["scripts/npm.ts"],
				),
		);
	});

	test("the tests of an app are one owner: its own support only, and no product code in them", async () => {
		// Catches an app test that borrows the support of another owner, and product code that
		// imports the tests of an app.
		await withProject(
			{
				...world,
				"apps/cli/tests/other-app.test.ts":
					'import { webSupport } from "../../web/tests/support.js";\nexport { webSupport };\n',
				"apps/cli/tests/package.test.ts":
					'import { alphaSupport } from "../../../packages/alpha/tests/support.js";\nexport { alphaSupport };\n',
				"packages/alpha/tests/app.test.ts":
					'import { cliSupport } from "../../../apps/cli/tests/support.js";\nexport { cliSupport };\n',
				"tests/system/policy/app.test.ts":
					'import { cliSupport } from "../../../apps/cli/tests/support.js";\nexport { cliSupport };\n',
				"apps/cli/src/runtime/tests.ts":
					'import { cliSupport } from "#tests/support.ts";\nexport { cliSupport };\n',
				"apps/web/src/runtime/foreign-tests.ts":
					'import { cliSupport } from "../../../cli/tests/support.js";\nexport { cliSupport };\n',
			},
			(root) =>
				expectJudged(root, {
					"apps/cli/tests/other-app.test.ts": FOREIGN_TESTS,
					"apps/cli/tests/package.test.ts": FOREIGN_TESTS,
					"packages/alpha/tests/app.test.ts": FOREIGN_TESTS,
					"tests/system/policy/app.test.ts": FOREIGN_TESTS,
					"apps/cli/src/runtime/tests.ts": PRODUCT_TESTS,
					"apps/web/src/runtime/foreign-tests.ts": PRODUCT_TESTS,
				}),
		);
	});

	test("a # import must name a file that the manifest of the importing owner maps", async () => {
		// Catches a malformed # import that passes silently because the owner is unknown: a name
		// the manifest lacks, a missing target, and a file that has no manifest of its own.
		await withProject(
			{
				...world,
				"apps/cli/src/cli/unmapped.ts": 'import { nope } from "#nope/x.ts";\nexport { nope };\n',
				"apps/cli/src/cli/missing.ts":
					'import { nope } from "#runtime/missing.ts";\nexport { nope };\n',
				"packages/alpha/src/runtime/unmapped.ts":
					'import { nope } from "#nope/x.ts";\nexport { nope };\n',
				"scripts/hash.ts": 'import { Card } from "#ui/components/Card.tsx";\nexport { Card };\n',
				"apps/cli/src/cli/other-app.ts":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
			},
			(root) =>
				expectJudged(root, {
					"apps/cli/src/cli/unmapped.ts": UNRESOLVED,
					"apps/cli/src/cli/missing.ts": UNRESOLVED,
					"packages/alpha/src/runtime/unmapped.ts": UNRESOLVED,
					"scripts/hash.ts": UNRESOLVED,
					"apps/cli/src/cli/other-app.ts": UNRESOLVED,
				}),
		);
	});

	test("the root #web/* entry is open to the root src modules and the browser entry, and to nothing else", async () => {
		// Catches the temporary transition entry widening: only files of root src/ and the browser
		// entry frontend/main.tsx reach the web source through it, and neither the web tests nor
		// any other owner do.
		await withProject(
			{
				...world,
				"src/ui/consumer/index.ts":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"src/ui/consumer/dynamic.ts":
					'export const loaded = import("#web/ui/components/Card.tsx");\n',
				"src/ui/consumer/reexport.ts": 'export { Card } from "#web/ui/components/Card.tsx";\n',
				"src/ui/consumer/tests.ts":
					'import { webSupport } from "#web/../tests/support.ts";\nexport { webSupport };\n',
				"src/ui/consumer/missing.ts":
					'import { nope } from "#web/ui/components/Missing.tsx";\nexport { nope };\n',
				"src/ui/consumer/relative.ts":
					'import { Card } from "../../../apps/web/src/ui/components/Card.js";\nexport { Card };\n',
				"frontend/main.tsx":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"frontend/other.ts":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"scripts/web.ts": 'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"tests/system/policy/web.test.ts":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"packages/alpha/src/ui/web.ts":
					'import { Card } from "#web/ui/components/Card.tsx";\nexport { Card };\n',
				"apps/web/src/ui/components/root-import.ts": importing("#web/ui/components/Card.tsx"),
				"apps/server/src/server/root-import.ts": importing("#web/ui/components/Card.tsx"),
				"src/ui/consumer/server.ts": importing("#web/../../server/src/server/host.ts"),
				"src/ui/consumer/prefix.ts": importing("#webbing/ui/components/Card.tsx"),
			},
			(root) =>
				expectJudged(
					root,
					{
						"src/ui/consumer/tests.ts": PRODUCT_TESTS,
						"src/ui/consumer/missing.ts": UNRESOLVED,
						"src/ui/consumer/relative.ts": NOT_AN_APP_IMPORT,
						"frontend/other.ts": UNRESOLVED,
						"scripts/web.ts": UNRESOLVED,
						"tests/system/policy/web.test.ts": UNRESOLVED,
						"packages/alpha/src/ui/web.ts": UNRESOLVED,
						"apps/web/src/ui/components/root-import.ts": UNRESOLVED,
						"apps/server/src/server/root-import.ts": UNRESOLVED,
						"src/ui/consumer/server.ts": NOT_AN_APP_IMPORT,
						"src/ui/consumer/prefix.ts": UNRESOLVED,
					},
					[
						"src/ui/consumer/index.ts",
						"src/ui/consumer/dynamic.ts",
						"src/ui/consumer/reexport.ts",
						"frontend/main.tsx",
					],
				),
		);
	});

	test.each([
		"#web/runtime/work.ts",
		"#web/server/host.ts",
		"#web/server/host.ts?raw",
		"@archboard/beta",
		"@/server/host/index.ts",
	])("the root browser entry refuses the server or runtime target of %s", async (source) => {
		// The temporary #web entry must preserve browser area checks for every resolved target.
		await withProject(
			{
				...world,
				"frontend/main.tsx": importing(source),
				"src/server/host/index.ts": "export const clip = 1;\n",
			},
			(root) => expectJudged(root, { "frontend/main.tsx": AREA }),
		);
	});

	test("the area directions hold inside an app, and the browser entry is browser code", async () => {
		// Catches an app ui that reaches runtime or server code of its own app or of a package,
		// and a browser entry that escapes the area rules because it sits above ui/.
		await withProject(
			{
				...world,
				"apps/web/src/ui/components/to-server.ts":
					'import { host } from "#server/host.ts";\nexport { host };\n',
				"apps/web/src/ui/components/to-package.ts":
					'import { beta } from "@archboard/beta";\nexport { beta };\n',
				"apps/web/tests/ui/to-runtime.test.ts":
					'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"apps/web/src/main.tsx": 'import { work } from "#runtime/work.ts";\nexport { work };\n',
				"apps/web/src/ui/components/to-ui.ts":
					'import { Card } from "#ui/components/Card.tsx";\nexport { Card };\n',
				"apps/server/src/server/to-package.ts":
					'import { beta } from "@archboard/beta";\nexport { beta };\n',
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/web/src/ui/components/to-server.ts": AREA,
						"apps/web/src/ui/components/to-package.ts": AREA,
						"apps/web/tests/ui/to-runtime.test.ts": AREA,
						"apps/web/src/main.tsx": AREA,
					},
					["apps/web/src/ui/components/to-ui.ts", "apps/server/src/server/to-package.ts"],
				),
		);
	});
});

describe("the layout rules cover the source of an app", () => {
	test("entries are thin, and the source of an app sits in role folders of an area", async () => {
		// Catches implementation in an app entry, flat source beside it, and a reintroduced
		// legacy root: each would escape the area rules and the module layout.
		const implementation = "export function start() { return 1; }\n";
		await withProject(
			{
				...world,
				"apps/cli/src/bin.ts": implementation,
				"apps/server/src/server.ts": implementation,
				"apps/web/src/main.tsx": implementation,
				"apps/cli/src/flat.ts": "export const flat = 1;\n",
				"apps/cli/src/server.ts": "export const other = 1;\n",
				"apps/web/frontend/main.tsx": "export const legacy = 1;\n",
				"apps/web/src/pages/page.ts": "export const page = 1;\n",
				"apps/cli/src/cli/run.ts": "export const run = 1;\n",
				"apps/cli/src/runtime/clipboard.ts": "export const clip = 1;\n",
				"apps/web/tests/unit/setup.ts": "export const setup = 1;\n",
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/cli/src/bin.ts": "startup wiring",
						"apps/server/src/server.ts": "startup wiring",
						"apps/web/src/main.tsx": "startup wiring",
						"apps/cli/src/flat.ts": "reserved for thin",
						"apps/cli/src/server.ts": "reserved for thin",
						"apps/web/frontend/main.tsx": "legacy root",
						"apps/web/src/pages/page.ts": "role folder of an area",
					},
					[
						"apps/cli/src/cli/run.ts",
						"apps/cli/src/runtime/clipboard.ts",
						"apps/web/tests/unit/setup.ts",
					],
				),
		);
	});

	test("a package or an app has no lib folder and no compat names; root modules keep lib", async () => {
		// Catches a lib bucket and a compatibility shim in the source of a package or an app. The
		// tests of an app may keep a fixture folder of that name, and root src/ modules still
		// keep their lib/ folder until they move.
		await withProject(
			{
				...world,
				"apps/cli/src/runtime/lib/impl.ts": "export const impl = 1;\n",
				"apps/cli/src/runtime/utils/impl.ts": "export const impl = 1;\n",
				"packages/alpha/src/runtime/lib/impl.ts": "export const impl = 1;\n",
				"apps/cli/src/runtime/shim.ts": "export const compat = 1;\n",
				"apps/cli/tests/lib/fixture.ts": "export const compat = 1;\n",
				"src/domain/widget/lib/impl.ts": "export const impl = 1;\n",
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/cli/src/runtime/lib/impl.ts": "buckets",
						"apps/cli/src/runtime/utils/impl.ts": "buckets",
						"packages/alpha/src/runtime/lib/impl.ts": "buckets",
						"apps/cli/src/runtime/shim.ts": "compatibility or shim",
					},
					["apps/cli/tests/lib/fixture.ts", "src/domain/widget/lib/impl.ts"],
				),
		);
	});

	test("state files stay pure in every folder below state/, in an app and in a package", async () => {
		// Catches a role or behavior folder under state/ that escapes the purity rule, which
		// matched only the files directly in state/.
		const sideEffect = 'import fs from "node:fs";\nexport const read = fs.readFileSync;\n';
		await withProject(
			{
				...world,
				"apps/web/src/ui/state/scene.ts": sideEffect,
				"apps/web/src/ui/state/canvas/scene.ts": sideEffect,
				"apps/web/src/ui/state/canvas/deeper/layers.ts": sideEffect,
				"packages/alpha/src/ui/state/canvas/scene.ts": sideEffect,
				"apps/web/src/ui/rules/scene.ts": sideEffect,
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/web/src/ui/state/scene.ts": "State files must not import",
						"apps/web/src/ui/state/canvas/scene.ts": "State files must not import",
						"apps/web/src/ui/state/canvas/deeper/layers.ts": "State files must not import",
						"packages/alpha/src/ui/state/canvas/scene.ts": "State files must not import",
					},
					["apps/web/src/ui/rules/scene.ts"],
				),
		);
	});
});
