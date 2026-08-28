import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suffix = `${process.pid}${Date.now()}`;
const moduleNames = {
	allowedDomain: `allowed${suffix}`,
	deepImporter: `deepimporter${suffix}`,
	domainTarget: `domaintarget${suffix}`,
	forbiddenDomain: `forbidden${suffix}`,
	coLocatedTest: `colocated${suffix}`,
	otherTestModule: `othertestmodule${suffix}`,
	productImporter: `productimporter${suffix}`,
	testModule: `testmodule${suffix}`,
	shared: `shared${suffix}`,
	transformer: `transformer${suffix}`,
};
const systemRoot = `tests/system/boundary-${suffix}`;
const testModuleRoot = `src/domain/${moduleNames.testModule}`;
const otherTestModuleRoot = `src/domain/${moduleNames.otherTestModule}`;
const fixtureFiles = new Map([
	[`src/shared/${moduleNames.shared}/index.ts`, "export const sharedValue = 1;\n"],
	[`src/domain/${moduleNames.domainTarget}/index.ts`, "export const domainValue = 1;\n"],
	[`src/domain/${moduleNames.domainTarget}/lib/index.ts`, "export const privateValue = 1;\n"],
	[`src/transformers/${moduleNames.transformer}/index.ts`, "export const transformedValue = 1;\n"],
	[
		`src/domain/${moduleNames.allowedDomain}/index.ts`,
		`import { sharedValue } from "../../shared/${moduleNames.shared}/index.js";\nimport { domainValue } from "../${moduleNames.domainTarget}";\nexport const allowedValue = sharedValue + domainValue;\n`,
	],
	[
		`src/domain/${moduleNames.forbiddenDomain}/index.ts`,
		`import { transformedValue } from "../../transformers/${moduleNames.transformer}/index.js";\nexport { transformedValue };\n`,
	],
	[
		`src/domain/${moduleNames.deepImporter}/index.ts`,
		`import { privateValue } from "../${moduleNames.domainTarget}/lib";\nexport { privateValue };\n`,
	],
	[
		`src/domain/${moduleNames.deepImporter}/raw.ts`,
		`import { privateValue } from "../${moduleNames.domainTarget}/lib?raw";\nexport { privateValue };\n`,
	],
	[
		`src/domain/${moduleNames.deepImporter}/require.ts`,
		`const privateValue = require("../${moduleNames.domainTarget}/lib");\nexport { privateValue };\n`,
	],
	[
		`src/domain/${moduleNames.coLocatedTest}/widget.test.ts`,
		`import { sharedValue } from "../../shared/${moduleNames.shared}/index.js";\nexport { sharedValue };\n`,
	],
	[
		`src/domain/${moduleNames.testModule}/tests/widget.spec.ts`,
		`import { moduleValue } from "../index.js";\nimport { moduleSupport } from "./support.js";\nexport const allowed = moduleValue + moduleSupport;\n`,
	],
	[`${testModuleRoot}/index.ts`, "export const moduleValue = 1;\n"],
	[`${testModuleRoot}/lib/index.ts`, "export const privateValue = 1;\n"],
	[`${testModuleRoot}/tests/support.ts`, "export const moduleSupport = 1;\n"],
	[
		`${testModuleRoot}/tests/deep-own.test.ts`,
		`import { privateValue } from "../lib/index.js";\nexport { privateValue };\n`,
	],
	[
		`${testModuleRoot}/tests/deep-other.test.ts`,
		`import { privateValue } from "../../${moduleNames.domainTarget}/lib/index.js";\nexport { privateValue };\n`,
	],
	[`${otherTestModuleRoot}/index.ts`, "export const otherValue = 1;\n"],
	[`${otherTestModuleRoot}/tests/support.ts`, "export const otherSupport = 1;\n"],
	[
		`${testModuleRoot}/tests/cross-module.test.ts`,
		`import { otherSupport } from "../../${moduleNames.otherTestModule}/tests/support.js";\nexport { otherSupport };\n`,
	],
	[
		`${testModuleRoot}/tests/cross-system.test.ts`,
		`import { systemSupport } from "../../../../${systemRoot}/support.js";\nexport { systemSupport };\n`,
	],
	[`${testModuleRoot}/tests/untyped.js`, "export const untyped = true;\n"],
	[`${testModuleRoot}/tests/oversized.test.ts`, "// authored fixture line\n".repeat(501)],
	[`${testModuleRoot}/tests/type-error-support.ts`, "export const moduleTypeError: string = 1;\n"],
	[
		`src/domain/${moduleNames.productImporter}/index.ts`,
		`import { moduleSupport } from "../${moduleNames.testModule}/tests/support.js";\nexport { moduleSupport };\n`,
	],
	[
		`src/domain/${moduleNames.productImporter}/system.ts`,
		`import { systemSupport } from "../../../${systemRoot}/support.js";\nexport { systemSupport };\n`,
	],
	[`${systemRoot}/support.ts`, "export const systemSupport = 1;\n"],
	[
		`${systemRoot}/system.test.ts`,
		`import { moduleValue } from "../../../${testModuleRoot}/index.js";\nimport { systemSupport } from "./support.js";\nexport const allowed = moduleValue + systemSupport;\n`,
	],
	[
		`${systemRoot}/deep.spec.ts`,
		`import { privateValue } from "../../../${testModuleRoot}/lib/index.js";\nexport { privateValue };\n`,
	],
	[
		`${systemRoot}/cross-module.test.ts`,
		`import { moduleSupport } from "../../../${testModuleRoot}/tests/support.js";\nexport { moduleSupport };\n`,
	],
	[`${systemRoot}/untyped.jsx`, "export const untyped = true;\n"],
	[`${systemRoot}/oversized.test.ts`, "// authored fixture line\n".repeat(501)],
	[`${systemRoot}/type-error-support.ts`, "export const systemTypeError: string = 1;\n"],
	["tests/misplaced.spec.ts", "export const misplaced = true;\n"],
	["tests/widget_test.ts", "export const misplacedUnderscoreTest = true;\n"],
	["tests/widget_spec.ts", "export const misplacedUnderscoreSpec = true;\n"],
	[`scripts/type-error-${suffix}.ts`, "export const scriptTypeError: string = 1;\n"],
	[`tools/type-error-${suffix}.ts`, "export const toolTypeError: string = 1;\n"],
	[`src/cli/freepass${suffix}.ts`, "export const flatAreaFile = true;\n"],
]);

const createdRoots = Object.values(moduleNames).map((name) =>
	name.startsWith("shared")
		? path.join(repoRoot, "src/shared", name)
		: name.startsWith("transformer")
			? path.join(repoRoot, "src/transformers", name)
			: path.join(repoRoot, "src/domain", name),
);
createdRoots.push(path.join(repoRoot, systemRoot));
const createdFiles = [
	path.join(repoRoot, `src/cli/freepass${suffix}.ts`),
	path.join(repoRoot, "tests/misplaced.spec.ts"),
	path.join(repoRoot, "tests/widget_test.ts"),
	path.join(repoRoot, "tests/widget_spec.ts"),
	path.join(repoRoot, `scripts/type-error-${suffix}.ts`),
	path.join(repoRoot, `tools/type-error-${suffix}.ts`),
];
const serverEntrypoint = path.join(repoRoot, "src/server.ts");
const originalServerEntrypoint = fs.readFileSync(serverEntrypoint, "utf-8");

function run(cmd) {
	const result = Bun.spawnSync({
		cmd,
		cwd: repoRoot,
		stderr: "pipe",
		stdout: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function lint(relativePaths) {
	return run([
		path.join(repoRoot, "node_modules/.bin/oxlint"),
		"--config=.oxlintrc.jsonc",
		...relativePaths,
	]);
}

function expectPass(name, relativePaths) {
	const result = lint(relativePaths);
	if (result.exitCode !== 0) {
		throw new Error(`${name} should pass:\n${result.output}`);
	}
	console.log(`ok - ${name}`);
}

function expectRule(name, relativePath, rule, guidance) {
	const result = lint([relativePath]);
	if (
		result.exitCode === 0 ||
		!result.output.includes(rule) ||
		(guidance && !result.output.includes(guidance))
	) {
		throw new Error(`${name} should fail ${rule}:\n${result.output}`);
	}
	console.log(`ok - ${name} (${rule})`);
}

function expectRules(name, relativePath, rules) {
	const result = lint([relativePath]);
	const missingRules = rules.filter((rule) => !result.output.includes(rule));
	if (result.exitCode === 0 || missingRules.length > 0) {
		throw new Error(`${name} should fail ${missingRules.join(", ")}:\n${result.output}`);
	}
	console.log(`ok - ${name} (${rules.join(", ")})`);
}

function expectTypeCoverage(relativePaths) {
	const result = run(["bun", "run", "type-check"]);
	const missingPaths = relativePaths.filter(
		(relativePath) => !result.output.includes(relativePath),
	);
	if (result.exitCode === 0 || missingPaths.length > 0 || !result.output.includes("TS2322")) {
		throw new Error(
			`type-check should reject every unimported fixture; missing ${missingPaths.join(", ")}:\n${result.output}`,
		);
	}
	console.log(`ok - type-check covers ${relativePaths.length} unimported owned roots (TS2322)`);
}

function expectTypeAwareAssignment(relativePaths) {
	const result = run([
		path.join(repoRoot, "node_modules/.bin/oxlint"),
		"--config=.oxlintrc.jsonc",
		"--type-aware",
		"--debug=files",
		...relativePaths,
	]);
	const missingPaths = relativePaths.filter(
		(relativePath) => !result.output.includes(relativePath),
	);
	if (result.exitCode !== 0 || missingPaths.length > 0) {
		throw new Error(
			`Oxlint type-aware assignment should include both test owners; missing ${missingPaths.join(", ")}:\n${result.output}`,
		);
	}
	console.log(`ok - Oxlint type-aware assignment includes both test owners`);
}

try {
	for (const [relativePath, content] of fixtureFiles) {
		const absolutePath = path.join(repoRoot, relativePath);
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
		fs.writeFileSync(absolutePath, content);
	}

	expectPass("allowed root entrypoints and import directions", [
		`src/domain/${moduleNames.allowedDomain}/index.ts`,
		`src/domain/${moduleNames.domainTarget}/index.ts`,
		`src/shared/${moduleNames.shared}/index.ts`,
	]);
	fs.appendFileSync(
		serverEntrypoint,
		"\nexport function boundaryFixtureImplementation() { return 'not wiring'; }\n",
	);
	expectRule(
		"root entrypoints reject implementation",
		"src/server.ts",
		"archboard(root-implementation-modules)",
	);
	fs.writeFileSync(serverEntrypoint, originalServerEntrypoint);
	expectRule(
		"domain cannot import transformers",
		`src/domain/${moduleNames.forbiddenDomain}/index.ts`,
		"archboard(import-boundaries)",
	);
	expectRule(
		"flat area files are unmapped",
		`src/cli/freepass${suffix}.ts`,
		"archboard(mapped-source-paths)",
	);
	expectRule(
		"extensionless directory imports stay private",
		`src/domain/${moduleNames.deepImporter}/index.ts`,
		"archboard(module-entrypoints)",
	);
	expectRule(
		"Vite query imports stay private",
		`src/domain/${moduleNames.deepImporter}/raw.ts`,
		"archboard(module-entrypoints)",
	);
	expectRules(
		"CommonJS require imports are denied",
		`src/domain/${moduleNames.deepImporter}/require.ts`,
		["typescript(no-require-imports)", "archboard(module-entrypoints)"],
	);
	expectRule(
		"co-located test files are rejected",
		`src/domain/${moduleNames.coLocatedTest}/widget.test.ts`,
		"archboard(module-entrypoints)",
	);
	expectPass("tests in a module tests directory are allowed", [
		`src/domain/${moduleNames.testModule}/tests/widget.spec.ts`,
		`${testModuleRoot}/tests/support.ts`,
	]);
	expectPass("system tests use module roots and same-owner support", [
		`${systemRoot}/system.test.ts`,
		`${systemRoot}/support.ts`,
	]);
	expectTypeAwareAssignment([
		`${testModuleRoot}/tests/widget.spec.ts`,
		`${systemRoot}/system.test.ts`,
	]);
	expectPass("the temporary public runner stays explicit", [
		"src/cli/command-contract/tests/public-runner-fixture.mjs",
	]);
	expectRule(
		"module tests cannot deep-import their own implementation",
		`${testModuleRoot}/tests/deep-own.test.ts`,
		"archboard(module-entrypoints)",
		"module-root entrypoint",
	);
	expectRule(
		"module tests cannot deep-import another implementation",
		`${testModuleRoot}/tests/deep-other.test.ts`,
		"archboard(module-entrypoints)",
		"module-root entrypoint",
	);
	expectRule(
		"system tests cannot deep-import product implementation",
		`${systemRoot}/deep.spec.ts`,
		"archboard(module-entrypoints)",
		"module-root entrypoint",
	);
	expectRule(
		"product cannot import module-test support",
		`src/domain/${moduleNames.productImporter}/index.ts`,
		"archboard(module-entrypoints)",
		"must not import test-owned source",
	);
	expectRule(
		"product cannot import system-test support",
		`src/domain/${moduleNames.productImporter}/system.ts`,
		"archboard(module-entrypoints)",
		"must not import test-owned source",
	);
	for (const [name, relativePath] of [
		[
			"module tests cannot import another module owner",
			`${testModuleRoot}/tests/cross-module.test.ts`,
		],
		["module tests cannot import the system owner", `${testModuleRoot}/tests/cross-system.test.ts`],
		["system tests cannot import a module owner", `${systemRoot}/cross-module.test.ts`],
	]) {
		expectRule(name, relativePath, "archboard(module-entrypoints)", "only from its own");
	}
	expectRule(
		"dot-form tests outside an owner are misplaced",
		`src/domain/${moduleNames.coLocatedTest}/widget.test.ts`,
		"archboard(module-entrypoints)",
		"must live under",
	);
	expectRule(
		"root tests outside tests/system are misplaced",
		"tests/misplaced.spec.ts",
		"archboard(module-entrypoints)",
		"must live under",
	);
	expectRule(
		"Bun underscore test files outside an owner are misplaced",
		"tests/widget_test.ts",
		"archboard(module-entrypoints)",
		"must live under",
	);
	expectRule(
		"Bun underscore spec files outside an owner are misplaced",
		"tests/widget_spec.ts",
		"archboard(module-entrypoints)",
		"must live under",
	);
	for (const [name, relativePath] of [
		["module support must be TypeScript", `${testModuleRoot}/tests/untyped.js`],
		["system support must be TypeScript", `${systemRoot}/untyped.jsx`],
	]) {
		expectRule(name, relativePath, "archboard(module-entrypoints)", "must be a .ts file");
	}
	for (const [name, relativePath] of [
		["module test sources stop at 500 lines", `${testModuleRoot}/tests/oversized.test.ts`],
		["system test sources stop at 500 lines", `${systemRoot}/oversized.test.ts`],
	]) {
		expectRule(name, relativePath, "eslint(max-lines)", "Maximum allowed is 500");
	}
	expectTypeCoverage([
		`${testModuleRoot}/tests/type-error-support.ts`,
		`${systemRoot}/type-error-support.ts`,
		`scripts/type-error-${suffix}.ts`,
		`tools/type-error-${suffix}.ts`,
	]);
} finally {
	fs.writeFileSync(serverEntrypoint, originalServerEntrypoint);
	for (const root of createdRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
	for (const file of createdFiles) {
		fs.rmSync(file, { force: true });
	}
}
