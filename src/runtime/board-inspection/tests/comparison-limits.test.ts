import { describe, expect, test } from "bun:test";
import { diagnoseComparisonBudget } from "../diagnostics.js";
import { BROAD_PHASE_COMPARISON_LIMIT, InspectionFindingSchema } from "../index.js";
import { performanceBoard, terminalComparisonBoard } from "./fixtures/limit-cases.js";

const REPRESENTATIVE_COMPARISON_LIMIT = 2_000;

function detectWithRepresentativeLimit(records: ReturnType<typeof performanceBoard>) {
	return diagnoseComparisonBudget(records, REPRESENTATIVE_COMPARISON_LIMIT);
}

describe("comparison limits", () => {
	test("keeps a smaller comparison matrix below its representative limit", () => {
		const detection = detectWithRepresentativeLimit(performanceBoard(10, 30, 10));
		expect(detection.broadPhaseComparisons).toBeLessThanOrEqual(REPRESENTATIVE_COMPARISON_LIMIT);
		expect(detection.findings.some((f) => f.code === "INSPECTION_LIMIT_EXCEEDED")).toBe(false);
	});

	test("stops on the first comparison beyond the representative limit deterministically", () => {
		const input = performanceBoard(20, 60, 20);
		const first = detectWithRepresentativeLimit(input);
		const second = detectWithRepresentativeLimit(input);
		const limit = first.findings.find((f) => f.reason === "broad-phase-comparison-ceiling");
		expect(first.broadPhaseComparisons).toBe(REPRESENTATIVE_COMPARISON_LIMIT + 1);
		expect(limit?.affectsCoverage).toBe(true);
		expect(second).toEqual(first);
		expect(BROAD_PHASE_COMPARISON_LIMIT).toBe(2_000_000);
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

	test("retains completed findings before the representative terminal stop", () => {
		const detection = detectWithRepresentativeLimit(terminalComparisonBoard());
		expect(detection.broadPhaseComparisons).toBe(REPRESENTATIVE_COMPARISON_LIMIT + 1);
		expect(detection.findings.filter((f) => f.code === "INSPECTION_LIMIT_EXCEEDED")).toHaveLength(
			1,
		);
		expect(
			detection.findings.some(
				(f) => f.reason === "zero-length" && f.details.connectorId === "terminal-zero-segments",
			),
		).toBe(true);
	});
});
