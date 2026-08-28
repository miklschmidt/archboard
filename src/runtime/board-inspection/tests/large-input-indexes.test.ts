import { describe, expect, test } from "bun:test";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { InspectionReportSchema } from "../index.js";
import {
	boundLabel,
	connector,
	labelContainer,
	libraryBody,
	semanticNode,
} from "./fixtures/elements.js";

const driftIdentities = (input: Record<string, unknown>[]) =>
	inspectBoardDiagnostics(input)
		.report.findings.filter((f) => f.reason === "drift")
		.map((f) => `${f.details.containerId}\0${f.details.textId}`)
		.toSorted();

const groupMeteringBody = (groupIds: unknown[]) => ({
	id: "group-metering",
	type: "rectangle",
	x: 0,
	y: 60_000,
	width: 10,
	height: 10,
	angle: 0,
	groupIds,
	customData: { library: { itemId: "group-metering", source: "catalogue" } },
});

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

describe("large inspection indexes", () => {
	test("preserves all duplicate refs in stable source order", () => {
		const report = inspectBoardDiagnostics(
			Array.from({ length: 32 }, (_, sourceIndex) => ({
				id: "duplicate-ref-order",
				type: "rectangle",
				x: sourceIndex * 20,
				y: 0,
				width: 10,
				height: 10,
				angle: 0,
			})),
		).report;
		const duplicate = report.findings.find((finding) => finding.reason === "duplicate-element-id");
		expect(duplicate?.elements.map((element) => element.sourceIndex)).toEqual(
			Array.from({ length: 32 }, (_, sourceIndex) => sourceIndex),
		);
	});

	test("indexes large boundElements and rejected groups without changing semantics", () => {
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
		expect(report.findings.some((f) => f.reason === "malformed-bound-elements")).toBe(false);
	});

	test("meters every rejected group entry and preserves mapped classification", () => {
		const emptyWork = inspectBoardDiagnostics([groupMeteringBody([])]).work.inputUnits;
		for (const count of [1, 7]) {
			const diagnosed = inspectBoardDiagnostics([groupMeteringBody(Array(count).fill(null))]);
			expect(diagnosed.work.inputUnits - emptyWork).toBe(count);
			expect(diagnosed.report).toMatchObject({ clean: true, coverage: "complete" });
		}
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

	test("keeps label pair identity injective and reverse ownership deterministic", () => {
		const pairs = [
			["a b", "c"],
			["a", "b c"],
			["a\0", "b\u001f"],
			["a\u001f", "b\0"],
		] as const;
		const records = pairs.flatMap(([containerId, textId], index) => [
			labelContainer({
				id: containerId,
				x: index * 100,
				boundElements: [{ id: textId, type: "text" }],
			}),
			boundLabel({ id: textId, containerId, x: 500 + index * 100 }),
		]);
		expect(driftIdentities(records)).toEqual(driftIdentities(records.toReversed()));
		expect(new Set(driftIdentities(records)).size).toBe(pairs.length);
	});

	test("preserves hierarchy inventory, aggregate failure, and obstacle attribution", () => {
		const hierarchy = Array.from({ length: 64 }, (_, index) =>
			semanticNode(`node-${index}`, {
				x: index,
				y: index,
				width: (64 - index) * 20,
				height: (64 - index) * 20,
			}),
		);
		expect(
			inspectBoardDiagnostics(hierarchy).report.findings.some((f) => f.code === "NODE_OVERLAP"),
		).toBe(false);
		const aggregate = inspectBoardDiagnostics([
			semanticNode("overflow", { id: "positive", x: Number.MAX_VALUE, width: 0 }),
			semanticNode("overflow", { id: "negative", x: -Number.MAX_VALUE, width: 0 }),
			...Array.from({ length: 64 }, (_, index) =>
				semanticNode("overflow", { id: `local-${index}`, x: index }),
			),
		]).report;
		expect(aggregate.findings.some((f) => f.reason === "unrepresentable-coordinate-span")).toBe(
			true,
		);
		const obstacles = Array.from({ length: 64 }, (_, index) => ({
			...libraryBody(`body-${index}`, index * 20, ["shared"]),
			customData: undefined,
		}));
		expect(
			inspectBoardDiagnostics(obstacles).report.findings.some(
				(f) => f.reason === "invalid-library-attribution",
			),
		).toBe(false);
	});

	test("retains multi-point finding evidence", () => {
		const report = inspectBoardDiagnostics([
			connector({
				id: "curve",
				curveKind: "bezier",
				points: Array.from({ length: 5 }, (_, index) => [index, 0]),
			}),
		]).report;
		expect(report.findings.some((finding) => finding.points.length >= 5)).toBe(true);
	});
});
