import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const EvalContractSchema = z.object({
	id: z.number(),
	graded_by: z.string(),
	expected_output: z.string(),
	files: z.array(z.string()),
});
type EvalContract = z.infer<typeof EvalContractSchema>;
const repoRoot = path.resolve(import.meta.dir, "../../..");
const evalPath = path.join(repoRoot, "skills/archboard/evals/evals.json");
const evalBytes = readFileSync(evalPath, "utf8");
const parsedEvalBytes: unknown = JSON.parse(evalBytes);
const { evals } = z.object({ evals: z.array(EvalContractSchema) }).parse(parsedEvalBytes);

function evaluationById(id: number): EvalContract | undefined {
	for (const evaluation of evals) {
		if (evaluation.id === id) {
			return evaluation;
		}
	}
	return undefined;
}

describe("variant eval contracts", () => {
	test("eval 5 names its native branch-comparison owner", () => {
		const evaluation = evaluationById(5);
		expect(evaluation).toBeDefined();
		expect(evaluation?.graded_by).toBe("tests/system/canvas-state/branch-compare.test.ts");
		expect(evaluation?.files).toEqual([]);
		expect(evaluation?.expected_output).toContain(
			"tests/system/canvas-state/branch-compare.test.ts",
		);
		expect(evaluation?.expected_output).not.toContain("scripts/check-branch-compare.mjs");
	});

	test("eval 7 keeps human grading backed by the live-session owners", () => {
		const evaluation = evaluationById(7);
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
