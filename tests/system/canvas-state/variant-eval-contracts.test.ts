import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface EvalContract {
	id: number;
	graded_by: string;
	expected_output: string;
	files: string[];
}

const repoRoot = resolve(import.meta.dir, "../../..");
const evals = (
	JSON.parse(readFileSync(join(repoRoot, "skills/archboard/evals/evals.json"), "utf8")) as {
		evals: EvalContract[];
	}
).evals;

describe("variant eval contracts", () => {
	test("eval 5 names its native branch-comparison owner", () => {
		const evaluation = evals.find(({ id }) => id === 5);
		expect(evaluation).toBeDefined();
		expect(evaluation?.graded_by).toBe("tests/system/canvas-state/branch-compare.test.ts");
		expect(evaluation?.files).toEqual([]);
		expect(evaluation?.expected_output).toContain(
			"tests/system/canvas-state/branch-compare.test.ts",
		);
		expect(evaluation?.expected_output).not.toContain("scripts/check-branch-compare.mjs");
	});

	test("eval 7 keeps human grading backed by the live-session owners", () => {
		const evaluation = evals.find(({ id }) => id === 7);
		expect(evaluation).toBeDefined();
		expect(evaluation?.graded_by).toBe("human");
		expect(evaluation?.files).toEqual([
			"tests/system/browser/selection-inspector.test.ts",
			"tests/system/browser/server-update-ordering.test.ts",
		]);
		expect(evaluation?.expected_output).toContain("browser show payments@option-a --pane right");
		expect(evaluation?.expected_output).not.toContain("scripts/check-side-by-side.mjs");
	});
});
