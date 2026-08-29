import { describe, expect, test } from "bun:test";
import { InspectionReportSchema, inspectBoard } from "../index.js";
import { connector, semanticNode } from "./fixtures/elements.js";

describe("finding evidence", () => {
	test("keeps affected evidence and exact 16px focus padding", () => {
		const normal = inspectBoard([
			{
				id: "font",
				type: "text",
				x: 10,
				y: 20,
				width: 30,
				height: 40,
				fontFamily: 1,
			},
		]).findings.find((finding) => finding.reason === "disallowed-font-family");
		expect(normal?.affectedBBox).toEqual({
			x: 10,
			y: 20,
			width: 30,
			height: 40,
		});
		expect(normal?.focusBBox).toEqual({ x: -6, y: 4, width: 62, height: 72 });
		for (const [x, width, delta] of [
			[Number.MAX_VALUE, 0, "x-minus-16"],
			[-Number.MAX_VALUE, 0, "x-minus-16"],
			[0, Number.MAX_VALUE, "width-plus-32"],
		] as const) {
			const report = inspectBoard([
				{
					id: "extreme",
					type: "text",
					x,
					y: 0,
					width,
					height: 0,
					fontFamily: 1,
				},
			]);
			expect(report.coverage).toBe("indeterminate");
			expect(report.findings).toContainEqual(
				expect.objectContaining({
					reason: "unrepresentable-focus-padding",
					focusBBox: null,
					details: expect.objectContaining({
						failedDeltas: expect.arrayContaining([delta]),
					}),
				}),
			);
		}
	});

	test("closes absolute path overflow with exact affected and focus evidence", () => {
		const report = inspectBoard([
			connector({
				id: "overflow-path",
				x: Number.MAX_VALUE,
				width: 10,
				points: [
					[0, 0],
					[Number.MAX_VALUE, 0],
				],
			}),
		]);
		expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		expect(report.coverage).toBe("indeterminate");
		expect(report.findings).toContainEqual(
			expect.objectContaining({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "absolute-point-overflow",
				elements: [{ id: "overflow-path", type: "arrow", sourceIndex: 0 }],
				points: [{ x: Number.MAX_VALUE, y: 0 }],
				affectedBBox: { x: Number.MAX_VALUE, y: 0, width: 0, height: 0 },
				focusBBox: null,
				details: expect.objectContaining({ connectorId: "overflow-path", pointIndex: 1 }),
			}),
		);
		expect(report.findings).toContainEqual(
			expect.objectContaining({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "unrepresentable-focus-padding",
				affectedBBox: { x: Number.MAX_VALUE, y: 0, width: 0, height: 0 },
				focusBBox: null,
				details: expect.objectContaining({ failedDeltas: ["x-minus-16"] }),
			}),
		);
	});

	test("closes semantic-node and obstacle aggregate spans with exact scopes", () => {
		const semantic = inspectBoard([
			semanticNode("aggregate-node", {
				id: "aggregate-positive",
				x: Number.MAX_VALUE,
				width: 0,
			}),
			semanticNode("aggregate-node", {
				id: "aggregate-negative",
				x: -Number.MAX_VALUE,
				width: 0,
			}),
		]);
		expect(semantic.coverage).toBe("indeterminate");
		expect(semantic.findings).toContainEqual(
			expect.objectContaining({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "unrepresentable-coordinate-span",
				elements: [
					{ id: "aggregate-negative", type: "rectangle", sourceIndex: 1 },
					{ id: "aggregate-positive", type: "rectangle", sourceIndex: 0 },
				],
				affectedBBox: { x: -Number.MAX_VALUE, y: 0, width: 0, height: 10 },
				focusBBox: null,
				details: expect.objectContaining({ scope: "semantic-node-body" }),
			}),
		);
		expect(
			semantic.findings.some(
				(finding) =>
					finding.reason === "unrepresentable-focus-padding" && finding.focusBBox === null,
			),
		).toBe(true);

		for (const kind of ["grouped", "library"] as const) {
			const groupId = kind === "grouped" ? "aggregate-group" : "aggregate-library-group";
			const report = inspectBoard([
				{
					id: `${kind}-positive`,
					type: "rectangle",
					x: Number.MAX_VALUE,
					y: 0,
					width: 1,
					height: 10,
					groupIds: [groupId],
					...(kind === "library"
						? { customData: { library: { itemId: "aggregate-library" } } }
						: {}),
				},
				{
					id: `${kind}-negative`,
					type: "rectangle",
					x: -Number.MAX_VALUE,
					y: 0,
					width: 1,
					height: 10,
					groupIds: [groupId],
				},
			]);
			expect(report.coverage).toBe("indeterminate");
			expect(report.findings).toContainEqual(
				expect.objectContaining({
					code: "AMBIGUOUS_GEOMETRY",
					reason: "unrepresentable-coordinate-span",
					elements: [
						{ id: `${kind}-negative`, type: "rectangle", sourceIndex: 1 },
						{ id: `${kind}-positive`, type: "rectangle", sourceIndex: 0 },
					],
					affectedBBox: { x: -Number.MAX_VALUE, y: 0, width: 1, height: 10 },
					focusBBox: null,
					details: expect.objectContaining({ scope: "obstacle-component" }),
				}),
			);
			expect(
				report.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_OBSTACLE"),
			).toBe(false);
		}
	});

	test("closes duplicate finding affected unions without dropping local evidence", () => {
		const report = inspectBoard([
			semanticNode("duplicate-positive", {
				id: "aggregate-duplicate",
				x: Number.MAX_VALUE,
				width: 0,
			}),
			semanticNode("duplicate-negative", {
				id: "aggregate-duplicate",
				x: -Number.MAX_VALUE,
				width: 0,
			}),
		]);
		expect(report.findings).toContainEqual(
			expect.objectContaining({
				code: "BROKEN_REFERENCE",
				reason: "duplicate-element-id",
				affectedBBox: { x: -Number.MAX_VALUE, y: 0, width: 0, height: 10 },
				focusBBox: null,
			}),
		);
		expect(report.findings).toContainEqual(
			expect.objectContaining({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "unrepresentable-coordinate-span",
				elements: [
					{ id: "aggregate-duplicate", type: "rectangle", sourceIndex: 0 },
					{ id: "aggregate-duplicate", type: "rectangle", sourceIndex: 1 },
				],
				affectedBBox: { x: -Number.MAX_VALUE, y: 0, width: 0, height: 10 },
				focusBBox: null,
				details: expect.objectContaining({
					scope: "finding-affected-union",
					sourceIndexes: [0, 1],
				}),
			}),
		);
	});
});
