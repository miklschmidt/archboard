import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	discoverNativeTests,
	inspectTestInventory,
	inspectWorkflow,
	type InventoryInput,
} from "./support/test-inventory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
	return {
		repoRoot,
		scripts: {
			check: "bun run lint && bun run test",
			lint: "bun run lint:skills",
			"lint:skills": "bun test tests/system/repository-policy/skills.test.ts",
			test: "bun run test:inventory && bun run test:legacy",
			"test:inventory": "bun test tests/system/repository-policy/test-inventory.test.ts",
			"test:legacy": "bun scripts/check-example.mjs",
		},
		nativeTests: [
			"tests/system/repository-policy/skills.test.ts",
			"tests/system/repository-policy/test-inventory.test.ts",
		],
		...overrides,
	};
}

describe("test inventory policy", () => {
	test("accepts a mixed native and legacy checkout", () => {
		const fixture = input();
		fixture.scripts["test:legacy"] = "bun scripts/check-fixed-point.mjs";
		expect(inspectTestInventory(fixture).errors).toEqual([]);
	});

	test("rejects a package test lane absent from the push chain", () => {
		const fixture = input();
		fixture.scripts.test = "bun run test:inventory";
		expect(inspectTestInventory(fixture).errors).toContain(
			"package test lane `test:legacy` is absent from `check`",
		);
	});

	test("rejects a native test owned by no lane", () => {
		const fixture = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/orphan.test.ts` belongs to no package lane",
		);
	});

	test("rejects a native test reachable through multiple lanes", () => {
		const fixture = input();
		fixture.scripts["test:duplicate"] =
			"bun test tests/system/repository-policy/test-inventory.test.ts";
		fixture.scripts.test += " && bun run test:duplicate";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/repository-policy/test-inventory.test.ts` runs 2 times from `check` through package lanes: test:inventory (1), test:duplicate (1)",
		);
	});

	test("rejects a native test selected only by an unreachable verify script", () => {
		const fixture = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		fixture.scripts["verify:orphan"] = "bun test tests/system/orphan.test.ts";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/orphan.test.ts` runs zero times from `check`; matching package lanes: verify:orphan",
		);
	});

	test("rejects a reachable non-test owner invoked twice", () => {
		const fixture = input({ nativeTests: ["tests/system/verify.test.ts"] });
		fixture.scripts.check = "bun run verify:native && bun run verify:native";
		fixture.scripts["verify:native"] = "bun test tests/system/verify.test.ts";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/verify.test.ts` runs 2 times from `check` through package lanes: verify:native (2)",
		);
	});

	test("rejects a missing transitional legacy check", () => {
		const fixture = input();
		expect(inspectTestInventory(fixture).errors).toContain(
			"legacy package lane `test:legacy` names missing `scripts/check-example.mjs`",
		);
	});

	test("the real checkout reaches every native test exactly once", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		const result = inspectTestInventory({
			repoRoot,
			scripts: pkg.scripts,
			nativeTests: discoverNativeTests(repoRoot),
		});
		expect(result.errors).toEqual([]);
	});
});

describe("CI workflow policy", () => {
	const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

	test("the real workflow runs the complete check gate", () => {
		expect(inspectWorkflow(workflow).filter((error) => error.includes("does not run"))).toEqual([]);
	});

	test("the real workflow does not name test lanes directly", () => {
		expect(inspectWorkflow(workflow).filter((error) => error.includes("by name"))).toEqual([]);
	});

	test("reports the predecessor workflow diagnostics exactly", () => {
		expect(inspectWorkflow("run: bun run test:browser\n")).toEqual([
			"the workflow does not run `bun run check`, so lint, format, and the suite are not a push gate.",
			"the workflow runs `test:browser` by name, and the chain already runs it. Naming suites one at a time in the workflow is how it fell behind before.",
		]);
	});
});
