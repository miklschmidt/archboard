import { describe, expect, test } from "bun:test";
import { TEST_BOARD_INSPECTION_TERMINAL_CASE_TIMEOUT_MS } from "../../../shared/timing/timing.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { InspectionFindingSchema, inspectBoard } from "../index.js";
import { performanceBoard, terminalComparisonBoard } from "./fixtures/limit-cases.js";

describe("comparison limits", () => {
	test("pins the exact below-limit count", () => {
		const report = inspectBoard(performanceBoard(400, 1_200, 400));
		expect(report.broadPhaseComparisons).toBe(1_516_200);
		expect(report.findings.some((f) => f.code === "INSPECTION_LIMIT_EXCEEDED")).toBe(false);
	});

	test("stops on attempted comparison 2,000,001 with fixed schema", () => {
		const report = inspectBoard(performanceBoard(500, 1_500, 500));
		const limit = report.findings.find((f) => f.reason === "broad-phase-comparison-ceiling");
		expect(report.broadPhaseComparisons).toBe(2_000_001);
		expect(report.coverage).toBe("indeterminate");
		expect(limit?.details).toMatchObject({ limit: 2_000_000, attempted: 2_000_001 });
		for (const details of [
			{ limit: 2_000_001 },
			{ attempted: 2_000_002 },
			{ pass: "record-analysis" },
		])
			expect(
				InspectionFindingSchema.safeParse({ ...limit, details: { ...limit?.details, ...details } })
					.success,
			).toBe(false);
	});

	test(
		"retains completed findings before the terminal stop",
		() => {
			const report = inspectBoardDiagnostics(terminalComparisonBoard()).report;
			expect(report.broadPhaseComparisons).toBe(2_000_001);
			expect(report.findings.filter((f) => f.code === "INSPECTION_LIMIT_EXCEEDED")).toHaveLength(1);
			expect(
				report.findings.some(
					(f) => f.reason === "zero-length" && f.details.connectorId === "terminal-zero-segments",
				),
			).toBe(true);
		},
		TEST_BOARD_INSPECTION_TERMINAL_CASE_TIMEOUT_MS,
	);
});
