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
	for (const contract of [
		{ id: 5, path: "tests/system/canvas-state/branch-compare.test.ts" },
		{ id: 7, path: "tests/system/canvas-state/side-by-side.test.ts" },
	] as const) {
		test(`eval ${contract.id} names its final native behavioral owner`, () => {
			const evaluation = evals.find(({ id }) => id === contract.id);
			expect(evaluation).toBeDefined();
			expect(evaluation?.graded_by).toBe(contract.path);
			expect(evaluation?.files).toEqual([]);
			expect(evaluation?.expected_output).toContain(contract.path);
			expect(evaluation?.expected_output).not.toMatch(
				/scripts\/check-(?:branch-compare|side-by-side)\.mjs/,
			);
		});
	}
});
