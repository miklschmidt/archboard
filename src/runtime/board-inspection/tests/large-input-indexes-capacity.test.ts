import { describe, expect, test } from "bun:test";

import { inspectBoardDiagnostics } from "../diagnostics.js";
import { InspectionReportSchema } from "../index.js";
import { boundLabel, labelContainer } from "./fixtures/elements.js";

const groupClassificationBoard = (count: number, mode: "identity" | "coverage") => [
	{
		...(mode === "coverage" ? { id: "group-coverage" } : {}),
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: mode === "coverage" ? 0.5 : 0,
		groupIds: Array.from({ length: count }, (_, index) => (index === 0 ? "g" : null)),
	},
];

const labelMembershipBoard = (missingCount: number, textCount: number) => [
	{
		id: "o",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 20,
		height: 20,
		angle: 0,
		groupIds: ["label-membership"],
		boundElements: Array.from({ length: missingCount }, (_, index) => ({
			id: `m${index.toString(36)}`,
			type: "text",
		})),
	},
	...Array.from({ length: textCount }, (_, index) => ({
		id: `t${index.toString(36)}`,
		type: "text",
		x: 9,
		y: 9,
		width: 2,
		height: 2,
		angle: 0,
		fontFamily: 5,
		text: "x",
		containerId: "o",
	})),
];

describe("large inspection index capacity", () => {
	test("indexes thousands of bound elements without changing semantics", () => {
		const owner = labelContainer({
			boundElements: Array.from({ length: 2_000 }, (_, index) => ({
				id: `label-${index}`,
				type: "text",
			})),
		});
		const labels = Array.from({ length: 2_000 }, (_, index) =>
			boundLabel({ id: `label-${index}`, text: `${index}` }),
		);
		const report = inspectBoardDiagnostics([owner, ...labels]).report;
		expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		expect(report.findings.some((finding) => finding.reason === "malformed-bound-elements")).toBe(
			false,
		);
	});

	test("meters a thousand rejected group entries without changing classification", () => {
		for (const mode of ["identity", "coverage"] as const) {
			const one = inspectBoardDiagnostics(groupClassificationBoard(1, mode));
			const thousand = inspectBoardDiagnostics(groupClassificationBoard(1_000, mode));
			expect(thousand.work.inputUnits - one.work.inputUnits).toBe(999);
			expect(thousand.report.coverage).toBe("indeterminate");
			if (mode === "identity") {
				expect(
					thousand.report.findings.some(
						(finding) =>
							finding.reason === "invalid-element-identity" &&
							(finding.details.intendedRoles as readonly string[]).includes(
								"qualifying-group-body",
							),
					),
				).toBe(true);
			} else {
				expect(
					thousand.report.findings.some(
						(finding) => finding.reason === "rotation" && finding.affectsCoverage,
					),
				).toBe(true);
			}
		}
	});

	test("indexes the 600-by-600 label membership and repair control", () => {
		const report = inspectBoardDiagnostics(labelMembershipBoard(600, 600)).report;
		expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		expect(report.findings.some((finding) => finding.reason === "duplicate")).toBe(true);
		expect(
			report.findings.filter((finding) => finding.reason === "dangling-bound-text"),
		).toHaveLength(600);
	});
});
