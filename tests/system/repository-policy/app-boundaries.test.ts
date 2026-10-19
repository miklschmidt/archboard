// The plugin holds an app (`apps/<name>`) to the rules of a package, with one difference: nothing
// imports an app. Each test lints one fixture project with the rules alone, so it names the
// rule that refuses each file. How the repository's configs route a path is ui-lint-policy.test.ts.
import { describe, test } from "bun:test";

import {
	expectJudged,
	importing,
	linkInto,
	plugin,
	withProject,
} from "./support/oxlint-project.ts";

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

// Stable rule codes distinguish boundary failures without depending on diagnostic wording.
const ENTRYPOINT = "archboard(module-entrypoints)";
const AREA = "archboard(import-boundaries)";

const IMPORTS = { "#*": "./src/*", "#tests/*": "./tests/*" };
const appManifest = (name: string): string =>
	JSON.stringify({ name: `@archboard-app/${name}`, private: true, imports: IMPORTS });

const world: Record<string, string> = {
	".oxlintrc.jsonc": RULES,
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
					"apps/cli/src/cli/relative.ts": ENTRYPOINT,
					"apps/cli/src/cli/specifier.ts": ENTRYPOINT,
					"apps/cli/src/cli/dynamic.ts": ENTRYPOINT,
					"apps/cli/src/cli/reexport.ts": ENTRYPOINT,
					"apps/cli/src/cli/linked.ts": ENTRYPOINT,
					"apps/cli/tests/mock.test.ts": ENTRYPOINT,
					"apps/cli/src/cli/testing.ts": ENTRYPOINT,
					"apps/cli/src/cli/package-tests.ts": ENTRYPOINT,
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
				"tests/system/policy/app.test.ts": `import { clip } from "../../../${clip}";\nexport { clip };\n`,
			},
			(root) => {
				linkInto(root, "node_modules/@archboard-app/cli", "apps/cli");
				expectJudged(root, {
					"packages/alpha/src/runtime/static.ts": ENTRYPOINT,
					"packages/alpha/src/runtime/dynamic.ts": ENTRYPOINT,
					"packages/alpha/src/runtime/linked.ts": ENTRYPOINT,
					"packages/alpha/tests/app.test.ts": ENTRYPOINT,
					"apps/web/src/ui/components/Cross.ts": ENTRYPOINT,
					"apps/web/tests/mock.test.ts": ENTRYPOINT,
					"apps/server/src/server/reexport.ts": ENTRYPOINT,
					"scripts/consumer.ts": ENTRYPOINT,
					"tests/system/policy/app.test.ts": ENTRYPOINT,
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
				"tests/system/policy/app.test.ts": importing(named),
				// Not an app, and not a package: an npm name that happens to share the scope.
				"scripts/npm.ts": importing("@archboard-app/missing/src/x.ts"),
			},
			(root) =>
				expectJudged(
					root,
					{
						"packages/alpha/src/runtime/static.ts": ENTRYPOINT,
						"packages/alpha/src/runtime/root.ts": ENTRYPOINT,
						"packages/alpha/src/runtime/dynamic.ts": ENTRYPOINT,
						"packages/alpha/src/runtime/query.ts": ENTRYPOINT,
						"packages/alpha/tests/app.test.ts": ENTRYPOINT,
						"apps/web/src/ui/components/Cross.ts": ENTRYPOINT,
						"apps/web/tests/mock.test.ts": ENTRYPOINT,
						"apps/server/src/server/reexport.ts": ENTRYPOINT,
						"apps/cli/src/cli/self.ts": ENTRYPOINT,
						"apps/cli/src/cli/self-root.ts": ENTRYPOINT,
						"scripts/consumer.ts": ENTRYPOINT,
						"tests/system/policy/app.test.ts": ENTRYPOINT,
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
					"apps/cli/tests/other-app.test.ts": ENTRYPOINT,
					"apps/cli/tests/package.test.ts": ENTRYPOINT,
					"packages/alpha/tests/app.test.ts": ENTRYPOINT,
					"tests/system/policy/app.test.ts": ENTRYPOINT,
					"apps/cli/src/runtime/tests.ts": ENTRYPOINT,
					"apps/web/src/runtime/foreign-tests.ts": ENTRYPOINT,
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
					'import { Card } from "#ui/components/Card.tsx";\nexport { Card };\n',
			},
			(root) =>
				expectJudged(root, {
					"apps/cli/src/cli/unmapped.ts": ENTRYPOINT,
					"apps/cli/src/cli/missing.ts": ENTRYPOINT,
					"packages/alpha/src/runtime/unmapped.ts": ENTRYPOINT,
					"scripts/hash.ts": ENTRYPOINT,
					"apps/cli/src/cli/other-app.ts": ENTRYPOINT,
				}),
		);
	});

	test.each(["#runtime/work.ts", "#server/host.ts", "#server/host.ts?raw", "@archboard/beta"])(
		"the browser entry refuses the server or runtime target of %s",
		async (source) => {
			// Keeps the browser-entry boundary after the retired frontend/#web fixtures disappear:
			// its own runtime, its own server (with a resource query too) and a package's runtime.
			await withProject({ ...world, "apps/web/src/main.tsx": importing(source) }, (root) =>
				expectJudged(root, { "apps/web/src/main.tsx": AREA }),
			);
		},
	);

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
	test("entries are thin, app source sits in areas, and packages keep their own layout", async () => {
		// Catches implementation in an app entry, flat source beside it, a reintroduced legacy
		// root and an app folder that is no area. Package folders keep the documented shared
		// types layout and their own names, including folders beside src/ such as assets.
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
				"packages/alpha/src/domain/widget.ts": "export const widget = 1;\n",
				"packages/alpha/src/types/widget.ts": "export type Widget = { value: number };\n",
				"packages/alpha/assets/fonts/readme.ts": "export const assets = 1;\n",
				"apps/cli/src/cli/run.ts": "export const run = 1;\n",
				"apps/cli/src/runtime/clipboard.ts": "export const clip = 1;\n",
				"apps/web/tests/unit/setup.ts": "export const setup = 1;\n",
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/cli/src/bin.ts": "archboard(root-implementation-modules)",
						"apps/server/src/server.ts": "archboard(root-implementation-modules)",
						"apps/web/src/main.tsx": "archboard(root-implementation-modules)",
						"apps/cli/src/flat.ts": "archboard(root-implementation-modules)",
						"apps/cli/src/server.ts": "archboard(root-implementation-modules)",
						"apps/web/frontend/main.tsx": "archboard(mapped-source-paths)",
						"apps/web/src/pages/page.ts": "archboard(mapped-source-paths)",
					},
					[
						"apps/cli/src/cli/run.ts",
						"apps/cli/src/runtime/clipboard.ts",
						"apps/web/tests/unit/setup.ts",
						"packages/alpha/assets/fonts/readme.ts",
						"packages/alpha/src/types/widget.ts",
						"packages/alpha/src/domain/widget.ts",
					],
				),
		);
	});

	test("a package or an app has no lib folder and no compat names", async () => {
		// Catches a lib bucket and a compatibility shim in the source of a package or an app. The
		// tests of an app may keep a fixture folder of that name.
		await withProject(
			{
				...world,
				"apps/cli/src/runtime/lib/impl.ts": "export const impl = 1;\n",
				"apps/cli/src/runtime/utils/impl.ts": "export const impl = 1;\n",
				"packages/alpha/src/runtime/lib/impl.ts": "export const impl = 1;\n",
				"apps/cli/src/runtime/shim.ts": "export const compat = 1;\n",
				"apps/cli/tests/lib/fixture.ts": "export const compat = 1;\n",
			},
			(root) =>
				expectJudged(
					root,
					{
						"apps/cli/src/runtime/lib/impl.ts": "archboard(no-generic-buckets)",
						"apps/cli/src/runtime/utils/impl.ts": "archboard(no-generic-buckets)",
						"packages/alpha/src/runtime/lib/impl.ts": "archboard(no-generic-buckets)",
						"apps/cli/src/runtime/shim.ts": "archboard(no-compatibility-identifiers)",
					},
					["apps/cli/tests/lib/fixture.ts"],
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
						"apps/web/src/ui/state/scene.ts": "archboard(state-files-pure)",
						"apps/web/src/ui/state/canvas/scene.ts": "archboard(state-files-pure)",
						"apps/web/src/ui/state/canvas/deeper/layers.ts": "archboard(state-files-pure)",
						"packages/alpha/src/ui/state/canvas/scene.ts": "archboard(state-files-pure)",
					},
					["apps/web/src/ui/rules/scene.ts"],
				),
		);
	});
});
