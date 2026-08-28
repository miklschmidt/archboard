import { describe, expect, test } from "bun:test";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import {
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	InspectionReportSchema,
	inspectBoard,
} from "../index.js";
import { connector } from "./fixtures/elements.js";
import { inputBoundaryRecord } from "./fixtures/limit-cases.js";

describe("input limits", () => {
	test("accepts 1,000,000 units and refuses 1,000,001", () => {
		const boundary = inspectBoardDiagnostics([inputBoundaryRecord(999_984)]);
		const limited = inspectBoard([inputBoundaryRecord(999_985)]);
		expect(boundary.work.inputUnits).toBe(1_000_000);
		expect(boundary.report.clean).toBe(true);
		expect(limited.findings).toContainEqual(
			expect.objectContaining({
				reason: "input-complexity-ceiling",
				details: expect.objectContaining({
					limit: 1_000_000,
					attempted: 1_000_001,
					pass: "input-scan",
					phase: "snapshot-input",
				}),
			}),
		);
		expect(limited.broadPhaseComparisons).toBe(0);
		expect(JSON.stringify(limited)).toBe(
			JSON.stringify(inspectBoard([inputBoundaryRecord(999_985)])),
		);
	});

	test("stops long identities, point arrays, and bulk arrays without semantic work", () => {
		const cases = [
			[
				{
					id: `library-${"x".repeat(1_000_000)}`,
					type: "rectangle",
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				},
			],
			[
				connector({
					id: "points",
					points: Array.from({ length: 750_000 }, (_, index) => [index, index % 2]),
				}),
			],
			Array.from({ length: 1_000_001 }, () => null),
		];
		for (const input of cases) {
			const report = inspectBoard(input);
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report.findings.some((f) => f.reason === "input-complexity-ceiling")).toBe(true);
			expect(report.broadPhaseComparisons).toBe(0);
		}
	});

	test("keeps a large supported path below the ceiling", () => {
		const diagnosed = inspectBoardDiagnostics([
			connector({
				id: "supported",
				width: 249_999,
				points: Array.from({ length: 250_000 }, (_, index) => [index, index % 2]),
			}),
		]);
		expect(diagnosed.work.inputUnits).toBeLessThan(INSPECTION_INPUT_COMPLEXITY_LIMIT);
		expect(diagnosed.report.findings.some((f) => f.reason === "input-complexity-ceiling")).toBe(
			false,
		);
	});
});
