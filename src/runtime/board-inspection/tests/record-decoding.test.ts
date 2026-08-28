import { describe, expect, test } from "bun:test";
import { collectInvalidRenderGeometry } from "../../engine/geometry.js";
import { InspectionReportSchema, inspectBoard } from "../index.js";
import { connector } from "./fixtures/elements.js";

describe("inspection record decoding", () => {
	test("preserves the declared broken-reference reason order", () => {
		const invalid = connector({
			width: 10,
			points: [
				[0, 0],
				[10, 0],
			],
		});
		delete invalid.id;
		const report = inspectBoard([
			invalid,
			{ id: "dup", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
			{ id: "dup", type: "rectangle", x: 20, y: 0, width: 10, height: 10 },
		]);
		expect(
			report.findings
				.filter((finding) => finding.code === "BROKEN_REFERENCE")
				.slice(0, 2)
				.map((finding) => finding.reason),
		).toEqual(["invalid-element-identity", "duplicate-element-id"]);
	});

	test("keeps invalid identities null and source indexed", () => {
		const issues = ["missing-id", "empty-string-id", "non-string-id"] as const;
		for (const [index, rawId] of [undefined, "", 42].entries()) {
			const record = connector({ id: rawId });
			if (rawId === undefined) delete record.id;
			const report = inspectBoard([record]);
			const finding = report.findings.find((item) => item.reason === "invalid-element-identity");
			expect(finding?.elements[0]).toEqual({ id: null, type: "arrow", sourceIndex: 0 });
			expect(finding?.details.identityIssue).toBe(issues[index]);
		}
	});

	test("shares strict render prerequisites and preserves locatable evidence", () => {
		for (const fields of [
			{ x: 1, y: 2, width: 3, height: 4 },
			{},
			{ x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 3, height: 4 },
			{ x: -10, y: -20, width: -3, height: -4 },
		]) {
			const raw = { id: "render", type: "rectangle", ...fields };
			const strict = collectInvalidRenderGeometry([raw])[0]?.fields ?? [];
			const report = inspectBoard([raw]);
			const geometry = report.findings.find(
				(finding) =>
					finding.code === "INVALID_RENDER_GEOMETRY" &&
					(finding.reason === "invalid-render-fields" || finding.reason === "unlocatable-record"),
			);
			const inspected =
				geometry?.reason === "invalid-render-fields" || geometry?.reason === "unlocatable-record"
					? geometry.details.invalidFields
					: [];
			expect(inspected).toEqual(strict);
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		}
	});

	test("closes malformed path and binding shapes without throwing", () => {
		const withoutPoints = connector();
		delete withoutPoints.points;
		const pathCases = [
			[withoutPoints, "points-missing"],
			[{ points: null }, "points-not-array"],
			[{ points: [] }, "points-empty"],
			[{ points: [[0]] }, "malformed-point"],
			[{ points: [[0, 0]] }, "points-one-point"],
		] as const;
		for (const [override, reason] of pathCases) {
			const report = inspectBoard(["id" in override ? override : connector(override)]);
			expect(report.findings.some((finding) => finding.reason === reason)).toBe(true);
			expect(report.coverage).toBe("indeterminate");
		}
		for (const binding of [null, false, {}, { elementId: 1 }, { elementId: "missing" }])
			expect(() => inspectBoard([connector({ startBinding: binding })])).not.toThrow();
	});
});
