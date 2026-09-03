import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { inspectWorkflow } from "./support/test-inventory.js";

const repoRoot = path.resolve(import.meta.dir, "../../..");

test("hosted CI reaches only the normal check graph", () => {
	const source = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
	expect(inspectWorkflow(source)).toEqual([]);
	const workflow = Bun.YAML.parse(source) as {
		jobs?: { suite?: { steps?: Array<{ run?: string; env?: Record<string, string> }> } };
	};
	const check = workflow.jobs?.suite?.steps?.find((step) => step.run === "bun run check");
	expect(check?.env).toEqual({
		CI: "true",
		ARCHBOARD_CI_EXCLUDED_BROWSER_OWNERS: "all",
		ARCHBOARD_CI_EXCLUDED_SYSTEM_OWNER: "tests/system/code-targets/opener-persistence.test.ts",
	});
});

test("hosted CI cannot invoke an opt-in package command beside check", () => {
	const workflow = [
		"jobs:",
		"  suite:",
		"    steps:",
		"      - run: bun run test:opt-in:tooling",
		"      - run: bun run check",
		"",
	].join("\n");
	expect(inspectWorkflow(workflow)).toContain(
		"the workflow invokes package script `test:opt-in:tooling` directly; `bun run check` must be its only package-script invocation.",
	);
});
