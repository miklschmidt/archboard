import { describe, expect, test } from "bun:test";
import { applyElementInput } from "../../engine/apply-element-input.js";
import type { ServerElement } from "../../engine/types.js";
import { planBridgeCreate } from "../bridge.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { InspectionReportSchema, inspectBoard, type InspectionReport } from "../index.js";
import { connector, libraryBody, semanticNode } from "./fixtures/elements.js";

const findingUses = (finding: InspectionReport["findings"][number], connectorId: string) =>
	finding.elements.some((element) => element.id === connectorId) ||
	("connectorId" in finding.details && finding.details.connectorId === connectorId) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === connectorId) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === connectorId);

const segmentIndexFor = (finding: InspectionReport["findings"][number], connectorId: string) => {
	if ("segmentIndex" in finding.details) return finding.details.segmentIndex;
	if (finding.code !== "CONNECTOR_INTERSECTION_UNMARKED") return null;
	return finding.details.firstConnectorId === connectorId
		? finding.details.firstSegmentIndex
		: finding.details.secondSegmentIndex;
};

const elbowConnector = (id: string, overrides: Record<string, unknown> = {}) =>
	connector({
		id,
		x: 10,
		y: 20,
		width: 80,
		height: 40,
		points: [
			[0, 0],
			[40, 0],
			[40, 40],
			[80, 40],
		],
		elbowed: true,
		fixedSegments: [],
		...overrides,
	});

const verticalConnector = (id: string, x: number, y = 0, height = 100) =>
	connector({
		id,
		x,
		y,
		width: 0,
		height,
		points: [
			[0, 0],
			[0, height],
		],
	});

const expectNoModeRefusal = (report: InspectionReport) =>
	expect(report.findings.some((finding) => finding.reason === "rounded-or-elbowed")).toBe(false);

const interactionScene = (id: string, marker: Record<string, unknown> = {}) => {
	const bridgeSources = [
		connector({ id: "bridge-over", type: "line", y: 150, index: "a0" }),
		{ ...verticalConnector("bridge-under", 50, 100), index: "a1" },
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
		{ ...libraryBody("library-obstacle", 70, ["library-group"]), y: 45 },
		verticalConnector("supported-vertical", 25),
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

	test("keeps downstream checks for recoverable modes and narrow refusals", () => {
		for (const [id, marker] of [
			["rounded", { roundness: { type: 2 } }],
			["elbowed", { elbowed: true, fixedSegments: [], startIsSpecial: null, endIsSpecial: null }],
		] as const) {
			const elements = interactionScene(id, marker);
			const diagnostics = inspectBoardDiagnostics(elements);
			const report = diagnostics.report;
			expect(report.coverage).toBe("complete");
			expectNoModeRefusal(report);
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			] as const)
				expect(
					report.findings.some((finding) => finding.code === code && findingUses(finding, id)),
				).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
						findingUses(finding, "bridge-over"),
				),
			).toBe(false);
		}
		for (const [id, marker, message] of [
			["rotation unsupported", { angle: 1 }, "rotation"],
			["malformed angle unsupported", { angle: "bad" }, "rotation"],
			["curve unsupported", { curve: false }, "curve"],
			["curve kind unsupported", { curveKind: "bezier" }, "curve"],
			["malformed elbowed unsupported", { elbowed: "bad" }, "rounded-or-elbowed"],
			["fixed segments unsupported", { fixedSegments: [] }, "rounded-or-elbowed"],
		] as const) {
			const elements = interactionScene(id, marker);
			const report = inspectBoardDiagnostics(elements).report;
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" &&
						finding.reason === message &&
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

	test("keeps every persisted elbow endpoint-special chain and the exact coordinate ceiling", () => {
		for (const startIsSpecial of [true, false, null] as const)
			for (const endIsSpecial of [true, false, null] as const) {
				const diagnostics = inspectBoardDiagnostics([
					elbowConnector(`special-${String(startIsSpecial)}-${String(endIsSpecial)}`, {
						x: 31,
						y: 41,
						width: 80,
						height: 40,
						points: [
							[0, 0],
							[40, 0],
							[40, 40],
						],
						startIsSpecial,
						endIsSpecial,
					}),
				]);
				expect(diagnostics.report.coverage).toBe("complete");
				expect(diagnostics.work.pathSegmentChecks).toBe(2);
				expectNoModeRefusal(diagnostics.report);
			}
		for (const coordinate of [1_000_000, -1_000_000] as const) {
			const report = inspectBoard([
				elbowConnector(`boundary-${coordinate}`, {
					x: 31,
					y: 41,
					width: Math.abs(coordinate),
					height: 0,
					points: [
						[0, 0],
						[coordinate, 0],
					],
				}),
			]);
			expect(report.coverage).toBe("complete");
			expectNoModeRefusal(report);
		}
		for (const coordinate of [1_000_001, -1_000_001] as const) {
			const report = inspectBoard([
				elbowConnector(`over-limit-${coordinate}`, {
					x: 31,
					y: 41,
					width: Math.abs(coordinate),
					height: 0,
					points: [
						[0, 0],
						[coordinate, 0],
					],
				}),
			]);
			expect(report.coverage).toBe("indeterminate");
			const refusal = report.findings.find(
				(finding) =>
					finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rounded-or-elbowed",
			);
			expect(refusal?.message).toContain(`point 1 x coordinate ${coordinate} exceeding ±1,000,000`);
			expect(report.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_NODE")).toBe(
				false,
			);
		}
		const ordinary = inspectBoard([
			connector({
				id: "ordinary-over-limit",
				x: 31,
				y: 41,
				width: 1_000_001,
				height: 0,
				points: [
					[0, 0],
					[1_000_001, 0],
				],
				elbowed: false,
			}),
		]);
		expect(ordinary.coverage).toBe("complete");
		expectNoModeRefusal(ordinary);
	});

	test("retains first and last stored elbow segments for every downstream interaction", () => {
		for (const [id, nodeX, obstacleX, crossingX, segmentIndex, y] of [
			["start-special", 20, 30, 35, 0, 15],
			["end-special", 60, 70, 75, 2, 55],
		] as const) {
			const report = inspectBoard([
				elbowConnector(id),
				semanticNode(`${id}-node`, { x: nodeX, y, width: 10, height: 10 }),
				{ ...libraryBody(`${id}-obstacle`, obstacleX, [`${id}-group`]), y },
				connector({
					id: `${id}-crossing`,
					type: "line",
					x: crossingX,
					y: 0,
					width: 0,
					height: 80,
					points: [
						[0, 0],
						[0, 80],
					],
				}),
			]);
			expect(report.coverage).toBe("complete");
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			] as const) {
				const finding = report.findings.find(
					(candidate) => candidate.code === code && findingUses(candidate, id),
				);
				expect(finding).toBeDefined();
				if (!finding) continue;
				expect(segmentIndexFor(finding, id)).toBe(segmentIndex);
			}
		}
	});
});
