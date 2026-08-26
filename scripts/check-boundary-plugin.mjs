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
	testModule: `testmodule${suffix}`,
	shared: `shared${suffix}`,
	transformer: `transformer${suffix}`,
};
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
		`import { sharedValue } from "../../shared/${moduleNames.shared}/index.js";\nexport { sharedValue };\n`,
	],
	[`src/cli/freepass${suffix}.ts`, "export const flatAreaFile = true;\n"],
]);

const createdRoots = Object.values(moduleNames).map((name) =>
	name.startsWith("shared")
		? path.join(repoRoot, "src/shared", name)
		: name.startsWith("transformer")
			? path.join(repoRoot, "src/transformers", name)
			: path.join(repoRoot, "src/domain", name),
);
const flatFixture = path.join(repoRoot, `src/cli/freepass${suffix}.ts`);
const serverEntrypoint = path.join(repoRoot, "src/server.ts");
const originalServerEntrypoint = fs.readFileSync(serverEntrypoint, "utf-8");

function lint(relativePaths) {
	const result = Bun.spawnSync({
		cmd: [
			path.join(repoRoot, "node_modules/.bin/oxlint"),
			"--config=.oxlintrc.jsonc",
			...relativePaths,
		],
		cwd: repoRoot,
		stderr: "pipe",
		stdout: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function expectPass(name, relativePaths) {
	const result = lint(relativePaths);
	if (result.exitCode !== 0) {
		throw new Error(`${name} should pass:\n${result.output}`);
	}
	console.log(`ok - ${name}`);
}

function expectRule(name, relativePath, rule) {
	return expectRules(name, relativePath, [rule]);
}

function expectRules(name, relativePath, rules) {
	const result = lint([relativePath]);
	const missingRules = rules.filter((rule) => !result.output.includes(rule));
	if (result.exitCode === 0 || missingRules.length > 0) {
		throw new Error(`${name} should fail ${missingRules.join(", ")}:\n${result.output}`);
	}
	console.log(`ok - ${name} (${rules.join(", ")})`);
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
	]);
} finally {
	fs.writeFileSync(serverEntrypoint, originalServerEntrypoint);
	for (const root of createdRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
	fs.rmSync(flatFixture, { force: true });
}
