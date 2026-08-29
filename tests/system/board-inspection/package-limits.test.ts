import { describe, expect, test } from "bun:test";
import {
	CheckResultSchema,
	formatInspectionText,
} from "../../../src/runtime/board-inspection/index.js";
import { TEST_BOARD_INSPECTION_PACKAGE_CASE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import {
	inputLimitedScene,
	performanceBoard,
	terminalComparisonBoard,
} from "./fixtures/package-limit-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

describe("package inspection limits", () => {
	test("persists the input ceiling with strict and non-strict byte equality", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("input-limit", inputLimitedScene());
			const normal = owner.runInspection("input-limit");
			const strict = owner.runInspection("input-limit", ["--strict"]);
			expect([normal.status, strict.status]).toEqual([0, 8]);
			expect(strict.stdout).toBe(normal.stdout);
			const report = CheckResultSchema.parse(JSON.parse(normal.stdout));
			expect(
				report.findings.some(
					(f) => f.reason === "input-complexity-ceiling" && f.details.attempted === 1_000_001,
				),
			).toBe(true);
			expect(owner.runInspection("input-limit", ["--text"]).stdout).toBe(
				`${formatInspectionText(report)}\n`,
			);
		} finally {
			await owner.dispose();
		}
	});

	test(
		"persists exact comparison counts and completed findings",
		async () => {
			const owner = createPackageInspectionOwner();
			try {
				owner.startVault();
				owner.writeBoard("below", performanceBoard(400, 1_200, 400));
				expect(
					CheckResultSchema.parse(JSON.parse(owner.runInspection("below").stdout))
						.broadPhaseComparisons,
				).toBe(1_516_200);
				owner.writeBoard("terminal", terminalComparisonBoard());
				const normal = owner.runInspection("terminal");
				const strict = owner.runInspection("terminal", ["--strict"]);
				expect([normal.status, strict.status, normal.stdout === strict.stdout]).toEqual([
					0,
					8,
					true,
				]);
				const report = CheckResultSchema.parse(JSON.parse(normal.stdout));
				expect(report.broadPhaseComparisons).toBe(2_000_001);
				expect(report.findings.some((f) => f.reason === "zero-length")).toBe(true);
			} finally {
				await owner.dispose();
			}
		},
		TEST_BOARD_INSPECTION_PACKAGE_CASE_TIMEOUT_MS,
	);
});
