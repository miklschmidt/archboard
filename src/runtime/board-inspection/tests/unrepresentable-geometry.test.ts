import { describe, expect, test } from "bun:test";
import { applyElementInput } from "../../engine/apply-element-input.js";
import { expandElements } from "../../engine/expand-elements.js";
import type { ServerElement } from "../../engine/types.js";
import { planBridgeCreate } from "../bridge.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { inspectBoard, type InspectionReport } from "../index.js";
import type {
	ElbowArrowElement,
	LegacyElementIngress,
} from "../../../shared/board-elements/index.js";
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

const completeElement = (input: LegacyElementIngress): ServerElement => {
	const [element] = expandElements([input], { deterministic: true, forStore: true });
	if (!element) throw new Error(`Fixture did not produce ${input.id}`);
	return element;
};

const elbowConnector = (
	id: string,
	overrides: Partial<Omit<ElbowArrowElement, "id" | "type">> = {},
) =>
	completeElement({
		id,
		type: "arrow",
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
	} satisfies LegacyElementIngress);

const verticalConnector = (id: string, x: number, y = 0, height = 100) =>
	completeElement({
		id,
		type: "arrow",
		x,
		y,
		width: 0,
		height,
		points: [
			[0, 0],
			[0, height],
		],
	} satisfies LegacyElementIngress);

const expectNoModeRefusal = (report: InspectionReport) =>
	expect(report.findings.some((finding) => finding.reason === "rounded-or-elbowed")).toBe(false);

const unsupportedSourceMessage =
	"Both sources must be live arrow/line connectors at zero rotation, without explicit curve fields, with finite non-zero point-chain segments; elbow coordinates must stay within ±1,000,000.";

const interactionScene = (candidate: unknown, side = 1) => {
	const bridgeSources = [
		completeElement({
			id: "bridge-over",
			type: "line",
			x: 0,
			y: 150,
			width: 100,
			height: 0,
			points: [
				[0, 0],
				[100, 0],
			],
			index: "a0",
		} satisfies LegacyElementIngress),
		{ ...verticalConnector("bridge-under", 50, 100), index: "a1" },
	] satisfies ServerElement[];
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
		candidate,
		semanticNode("colliding-node", { x: side < 0 ? -60 : 40, y: 40, width: 20, height: 20 }),
		{
			...libraryBody("library-obstacle", side < 0 ? -80 : 70, ["library-group"]),
			y: 45,
		},
		verticalConnector("supported-vertical", side < 0 ? -35 : 35),
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

const negativeInteractionScene = (id: string, marker: Record<string, unknown> = {}) =>
	interactionScene(connector({ id, x: 0, y: 50, width: 100, height: 0, ...marker }));

describe("unrepresentable geometry", () => {
	test("keeps downstream checks for recoverable modes and narrow refusals", () => {
		for (const [id, candidate] of [
			[
				"rounded",
				completeElement({
					id: "rounded",
					type: "arrow",
					x: 0,
					y: 50,
					width: 100,
					height: 0,
					points: [
						[0, 0],
						[100, 0],
					],
					roundness: { type: 2 },
				} satisfies LegacyElementIngress),
			],
			[
				"elbowed",
				elbowConnector("elbowed", {
					x: 0,
					y: 50,
					width: 100,
					height: 0,
					points: [
						[0, 0],
						[100, 0],
					],
					startIsSpecial: null,
					endIsSpecial: null,
				}),
			],
		] as const) {
			const elements = interactionScene(candidate);
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
		for (const [id, marker, reason] of [
			["rotation unsupported", { angle: 1 }, "rotation"],
			["malformed angle unsupported", { angle: "bad" }, "rotation"],
			["curve unsupported", { curve: false }, "curve"],
			["curve kind unsupported", { curveKind: "bezier" }, "curve"],
			["malformed elbowed unsupported", { elbowed: "bad" }, "rounded-or-elbowed"],
			["fixed segments unsupported", { fixedSegments: [] }, "rounded-or-elbowed"],
		] as const) {
			const elements = negativeInteractionScene(id, marker);
			const report = inspectBoardDiagnostics(elements).report;
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
			const id = `over-limit-${coordinate}`;
			const side = coordinate > 0 ? 1 : -1;
			const rejected = elbowConnector(id, {
				x: side * 31,
				y: 50,
				width: Math.abs(coordinate),
				height: 0,
				points: [
					[0, 0],
					[coordinate, 0],
				],
			});
			const report = inspectBoard(interactionScene(rejected, side));
			expect(report.coverage).toBe("indeterminate");
			const refusal = report.findings.find(
				(finding) =>
					finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rounded-or-elbowed",
			);
			expect(refusal?.message).toContain(`point 1 x coordinate ${coordinate} exceeding ±1,000,000`);
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			] as const)
				expect(
					report.findings.some((finding) => finding.code === code && findingUses(finding, id)),
				).toBe(false);
			const control = completeElement({
				id: `${id}-control`,
				type: "arrow",
				x: side * 31,
				y: 50,
				width: Math.abs(coordinate),
				height: 0,
				points: [
					[0, 0],
					[coordinate, 0],
				],
				elbowed: false,
			} satisfies LegacyElementIngress);
			const controlReport = inspectBoard(interactionScene(control, side));
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			] as const)
				expect(
					controlReport.findings.some(
						(finding) => finding.code === code && findingUses(finding, `${id}-control`),
					),
				).toBe(true);
			expect(() =>
				planBridgeCreate({
					elements: [rejected, verticalConnector(`${id}-bridge-under`, 50)],
					bridgeId: `${id}-bridge`,
					overConnectorId: id,
					underConnectorId: `${id}-bridge-under`,
					background: "#ffffff",
				}),
			).toThrow(unsupportedSourceMessage);
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
				elbowConnector(id, {
					startIsSpecial: segmentIndex === 0,
					endIsSpecial: segmentIndex === 2,
				}),
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
