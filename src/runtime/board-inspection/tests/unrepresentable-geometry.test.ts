import { describe, expect, test } from "bun:test";
import { applyElementInput } from "../../engine/apply-element-input.js";
import type { ServerElement } from "../../engine/types.js";
import { planBridgeCreate, validateBridgeDecorations } from "../bridge.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { InspectionReportSchema, inspectBoard, type InspectionReport } from "../index.js";
import { connector, semanticNode } from "./fixtures/elements.js";

const findingUses = (finding: InspectionReport["findings"][number], connectorId: string) =>
	finding.elements.some((element) => element.id === connectorId) ||
	("connectorId" in finding.details && finding.details.connectorId === connectorId) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === connectorId) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === connectorId);

const interactionScene = (id: string, marker: Record<string, unknown> = {}) => {
	const bridgeSources = [
		connector({ id: "bridge-over", type: "line", y: 150, index: "a0" }),
		connector({
			id: "bridge-under",
			x: 50,
			y: 100,
			width: 0,
			height: 100,
			index: "a1",
			points: [
				[0, 0],
				[0, 100],
			],
		}),
	] as unknown as ServerElement[];
	const bridgePlan = planBridgeCreate({
		elements: bridgeSources,
		bridgeId: "BridgeAux",
		overConnectorId: "bridge-over",
		underConnectorId: "bridge-under",
		background: "#ffffff",
	});
	const bridgeBoard = new Map(bridgeSources.map((element) => [element.id, element]));
	const bridgeParts = applyElementInput(bridgeBoard, {
		upserts: [...bridgePlan.inputs],
		origin: "agent",
	}).named;
	return [
		connector({ id, x: 0, y: 50, width: 100, height: 0, ...marker }),
		semanticNode("colliding-node", { x: 40, y: 40, width: 20, height: 20 }),
		{
			id: "library-obstacle",
			type: "rectangle",
			x: 70,
			y: 45,
			width: 10,
			height: 10,
			angle: 0,
			groupIds: ["library-group"],
			customData: { library: { itemId: "obstacle", source: "catalogue" } },
		},
		connector({
			id: "supported-vertical",
			x: 25,
			y: 0,
			width: 0,
			height: 100,
			points: [
				[0, 0],
				[0, 100],
			],
		}),
		connector({
			id: "supported-horizontal",
			x: 0,
			y: 25,
			width: 100,
			height: 0,
		}),
		...bridgeSources,
		...bridgeParts,
	];
};

describe("unrepresentable geometry", () => {
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

	test("closes overflow, rotation, curves, rounded, elbowed, and fixed segments", () => {
		const cases = [
			[
				connector({ x: Number.MAX_VALUE, width: Number.MAX_VALUE }),
				"unrepresentable-coordinate-span",
			],
			[connector({ angle: 1 }), "rotation"],
			[connector({ angle: "bad" }), "rotation"],
			[connector({ curve: {} }), "curve"],
			[connector({ curveKind: "bezier" }), "curve"],
			[connector({ roundness: { type: 2 } }), "rounded-or-elbowed"],
			[connector({ elbowed: true }), "rounded-or-elbowed"],
			[connector({ elbowed: "bad" }), "rounded-or-elbowed"],
			[connector({ fixedSegments: [] }), "rounded-or-elbowed"],
		] as const;
		for (const [element, reason] of cases) {
			const report = inspectBoard([element]);
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report.findings.some((finding) => finding.reason === reason)).toBe(true);
			expect(report.coverage).toBe("indeterminate");
		}
	});

	test("supported positive control executes every downstream pass and a valid bridge prerequisite", () => {
		const elements = interactionScene("candidate");
		expect(validateBridgeDecorations(elements as ServerElement[])).toMatchObject({
			valid: [{ bridgeId: "BridgeAux" }],
			invalid: [],
		});
		const diagnostics = inspectBoardDiagnostics(elements);
		expect(diagnostics.work.broadPhaseCompatibleVisits).toBeGreaterThan(0);
		for (const code of [
			"CONNECTOR_PENETRATES_NODE",
			"CONNECTOR_PENETRATES_OBSTACLE",
			"CONNECTOR_INTERSECTION_UNMARKED",
		] as const)
			expect(
				diagnostics.report.findings.some(
					(finding) => finding.code === code && findingUses(finding, "candidate"),
				),
			).toBe(true);
		expect(
			diagnostics.report.findings.some(
				(finding) =>
					finding.code === "CONNECTOR_INTERSECTION_UNMARKED" && findingUses(finding, "bridge-over"),
			),
		).toBe(false);
	});

	test("suppresses exact connector-specific downstream codes for every unsupported shape", () => {
		for (const [id, marker, reason] of [
			["rotation unsupported", { angle: 1 }, "rotation"],
			["malformed angle unsupported", { angle: "bad" }, "rotation"],
			["curve unsupported", { curve: false }, "curve"],
			["curve kind unsupported", { curveKind: "bezier" }, "curve"],
			["rounded unsupported", { roundness: { type: 2 } }, "rounded-or-elbowed"],
			["elbowed unsupported", { elbowed: true }, "rounded-or-elbowed"],
			["malformed elbowed unsupported", { elbowed: "bad" }, "rounded-or-elbowed"],
			["fixed segments unsupported", { fixedSegments: [] }, "rounded-or-elbowed"],
		] as const) {
			const elements = interactionScene(id, marker);
			expect(validateBridgeDecorations(elements as ServerElement[])).toMatchObject({
				valid: [{ bridgeId: "BridgeAux" }],
				invalid: [],
			});
			const diagnostics = inspectBoardDiagnostics(elements);
			const report = diagnostics.report;
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(diagnostics.work.broadPhaseCompatibleVisits).toBeGreaterThan(0);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" &&
						finding.reason === reason &&
						finding.elements[0]?.id === id &&
						finding.points.length === 2,
				),
			).toBe(true);
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			] as const)
				expect(
					report.findings.some((finding) => finding.code === code && findingUses(finding, id)),
				).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
						findingUses(finding, "supported-horizontal"),
				),
			).toBe(true);
		}
	});
});
