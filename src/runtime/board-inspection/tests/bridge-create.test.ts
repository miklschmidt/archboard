import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line archboard/import-boundaries -- approved contract test verifies the public CLI receipt schema.
import { BridgeResultSchema } from "../../../cli/commands/bridge.js";
import { applyElementInput } from "../../engine/apply-element-input.js";
import { expandElements } from "../../engine/expand-elements.js";
import type { ServerElement } from "../../engine/types.js";
import {
	BridgeMetadataSchema,
	BridgeRefusal,
	planBridgeCreate,
	validateBridgeDecorations,
} from "../bridge.js";
import { inspectBoard, type InspectionReport } from "../index.js";
import type { LegacyElementIngress } from "../../../shared/board-elements/index.js";

const completeElement = (input: LegacyElementIngress): ServerElement => {
	const [element] = expandElements([input], { deterministic: true, forStore: true });
	if (!element) throw new Error(`Fixture did not produce ${input.id}`);
	return element;
};

type LineInput = Extract<LegacyElementIngress, { type: "line" }>;
type ArrowInput = Extract<LegacyElementIngress, { type: "arrow" }>;

const baseLine = {
	id: "over",
	type: "line",
	x: 0,
	y: 50,
	width: 100,
	height: 0,
	points: [
		[0, 0],
		[100, 0],
	],
	index: "a0",
} satisfies LegacyElementIngress;

const baseArrow = {
	id: "under",
	type: "arrow",
	x: 50,
	y: 0,
	width: 0,
	height: 100,
	points: [
		[0, 0],
		[0, 100],
	],
	index: "a1",
} satisfies LegacyElementIngress;

const freshSources = () => [completeElement(baseLine), completeElement(baseArrow)];
const modeSources = (
	overMarker: Partial<LineInput> = {},
	underMarker: Partial<ArrowInput> = {},
) => [
	completeElement({ ...baseLine, ...overMarker } satisfies LegacyElementIngress),
	completeElement({ ...baseArrow, ...underMarker } satisfies LegacyElementIngress),
];

const negativeModeSources = (underMarker: Record<string, unknown>): ServerElement[] => {
	const [over, under] = freshSources();
	return [over, { ...under, ...underMarker }] as unknown as ServerElement[];
};

const boundarySources = (coordinate: number) => {
	return [
		completeElement({
			id: "over",
			type: "line",
			x: 10 + coordinate / 2,
			y: 0,
			width: 0,
			height: 100,
			points: [
				[0, 0],
				[0, 100],
			],
			index: "a0",
		} satisfies LegacyElementIngress),
		completeElement({
			id: "under",
			type: "arrow",
			x: 10,
			y: 50,
			width: Math.abs(coordinate),
			height: 0,
			points: [
				[0, 0],
				[coordinate, 0],
			],
			index: "a1",
			elbowed: true,
			fixedSegments: [],
		} satisfies LegacyElementIngress),
	];
};

const multiSegmentSources = (mode: "rounded" | "elbowed") => {
	const over =
		mode === "rounded"
			? completeElement({
					id: "multi-over",
					type: "arrow",
					x: 0,
					y: 40,
					width: 100,
					height: 30,
					points: [
						[0, 0],
						[40, 0],
						[40, 30],
						[100, 30],
					],
					index: "a0",
					roundness: { type: 2 },
				} satisfies LegacyElementIngress)
			: completeElement({
					id: "multi-over",
					type: "arrow",
					x: 0,
					y: 40,
					width: 100,
					height: 30,
					points: [
						[0, 0],
						[40, 0],
						[40, 30],
						[100, 30],
					],
					index: "a0",
					elbowed: true,
					fixedSegments: [],
					startIsSpecial: true,
					endIsSpecial: false,
				} satisfies LegacyElementIngress);
	const under = completeElement({
		id: "multi-under",
		type: "line",
		x: 60,
		y: 0,
		width: 0,
		height: 100,
		points: [
			[0, 0],
			[0, 45],
			[0, 100],
		],
		index: "a1",
	} satisfies LegacyElementIngress);
	return [over, under];
};

const unsupportedSourceMessage =
	"Both sources must be live arrow/line connectors at zero rotation, without explicit curve fields, with finite non-zero point-chain segments; elbow coordinates must stay within ±1,000,000.";

describe("bridge creation", () => {
	test("plans a deterministic role-ordered decoration", () => {
		const sources = freshSources();
		const plan = planBridgeCreate({
			elements: sources,
			bridgeId: "Bridge01",
			overConnectorId: "over",
			underConnectorId: "under",
			background: "#FfFfFf",
		});
		expect(plan.inputs).toHaveLength(2);
		for (const [index, input] of plan.inputs.entries()) {
			const bridge = (input.customData as { archboard: { bridge: unknown } }).archboard.bridge;
			expect(BridgeMetadataSchema.parse(bridge)).toMatchObject({
				bridgeId: "Bridge01",
				role: index === 0 ? "mask" : "redraw",
				background: "#ffffff",
			});
		}
		expect(
			planBridgeCreate({
				elements: sources,
				bridgeId: "Bridge01",
				overConnectorId: "over",
				underConnectorId: "under",
				background: "#ffffff",
			}).inputs,
		).toEqual(plan.inputs);
	});

	test("applies exactly two unbound and ungrouped lines and parses the receipt", () => {
		const sources = freshSources();
		const plan = planBridgeCreate({
			elements: sources,
			bridgeId: "Bridge01",
			overConnectorId: "over",
			underConnectorId: "under",
			background: "#ffffff",
		});
		const board = new Map(sources.map((element) => [element.id, element]));
		const applied = applyElementInput(board, {
			upserts: [...plan.inputs],
			origin: "agent",
		});
		expect(applied.named).toHaveLength(2);
		expect(applied.named.map((part) => part.type)).toEqual(["line", "line"]);
		expect(applied.named.every((part) => part.groupIds?.length === 0)).toBe(true);
		expect(
			applied.named.every(
				(part) =>
					(part.type === "arrow" || part.type === "line") &&
					part.startBinding === null &&
					part.endBinding === null,
			),
		).toBe(true);
		const receipt = {
			success: true as const,
			board: "bridge",
			bridgeId: "Bridge01",
			overConnectorId: "over",
			underConnectorId: "under",
			overSegmentIndex: plan.overSegmentIndex,
			underSegmentIndex: plan.underSegmentIndex,
			crossing: plan.crossing,
			elements: applied.named,
			fingerprint: { elements: board.size, note: "receipt", version: 1 },
		};
		expect(BridgeResultSchema.safeParse(receipt).success).toBe(true);
		const inconsistent = [
			{ ...receipt, bridgeId: "OtherBridge" },
			{ ...receipt, underConnectorId: receipt.overConnectorId },
			{ ...receipt, overConnectorId: "other-over" },
			{ ...receipt, underSegmentIndex: 1 },
			{ ...receipt, crossing: { x: 51, y: 50 } },
			{ ...receipt, elements: [{ ...applied.named[0]!, id: "OtherMask" }, applied.named[1]!] },
			{ ...receipt, elements: [applied.named[0]!, { ...applied.named[1]!, id: "Bridge01" }] },
		];
		for (const candidate of inconsistent)
			expect(BridgeResultSchema.safeParse(candidate).success).toBe(false);
	});

	test("selects an inclusive 0.5 crossing and refuses outside or identical sources", () => {
		const sources = freshSources();
		const shifted = freshSources();
		shifted[1]!.x = 50.5;
		expect(() =>
			planBridgeCreate({
				elements: shifted,
				bridgeId: "at",
				overConnectorId: "over",
				underConnectorId: "under",
				at: { x: 50, y: 50 },
				background: "#ffffff",
			}),
		).not.toThrow();
		shifted[1]!.x = 50.501;
		expect(() =>
			planBridgeCreate({
				elements: shifted,
				bridgeId: "outside",
				overConnectorId: "over",
				underConnectorId: "under",
				at: { x: 50, y: 50 },
				background: "#ffffff",
			}),
		).toThrow(BridgeRefusal);
		expect(() =>
			planBridgeCreate({
				elements: sources,
				bridgeId: "same",
				overConnectorId: "over",
				underConnectorId: "over",
				background: "#ffffff",
			}),
		).toThrow(BridgeRefusal);
		expect(
			inspectBoard(sources).findings.some((f) => f.reason === "proper-interior-crossing"),
		).toBe(true);
	});

	test("plans bridges for rounded, elbowed, special, and boundary point chains", () => {
		const modeCases: readonly [string, Partial<LineInput>, Partial<ArrowInput>][] = [
			["rounded", { roundness: { type: 2 } }, {}],
			["elbowed", {}, { elbowed: true, fixedSegments: [] }],
		];
		for (const [name, overMarker, underMarker] of modeCases) {
			const plan = planBridgeCreate({
				elements: modeSources(overMarker, underMarker),
				bridgeId: `Bridge-${name}`,
				overConnectorId: "over",
				underConnectorId: "under",
				background: "#ffffff",
			});
			expect(plan.overSegmentIndex).toBe(0);
			expect(plan.underSegmentIndex).toBe(0);
			expect(plan.crossing).toEqual({ x: 50, y: 50 });
		}
		for (const startIsSpecial of [true, false, null] as const)
			for (const endIsSpecial of [true, false, null] as const) {
				const underMarker: Partial<ArrowInput> = {
					elbowed: true,
					fixedSegments: [],
					startIsSpecial,
					endIsSpecial,
				};
				expect(() =>
					planBridgeCreate({
						elements: modeSources({}, underMarker),
						bridgeId: `Bridge-${String(startIsSpecial)}-${String(endIsSpecial)}`,
						overConnectorId: "over",
						underConnectorId: "under",
						background: "#ffffff",
					}),
				).not.toThrow();
			}
		for (const coordinate of [1_000_000, -1_000_000] as const)
			expect(() =>
				planBridgeCreate({
					elements: boundarySources(coordinate),
					bridgeId: `Bridge-boundary-${coordinate}`,
					overConnectorId: "under",
					underConnectorId: "over",
					background: "#ffffff",
				}),
			).not.toThrow();
		for (const coordinate of [1_000_001, -1_000_001] as const)
			for (const marker of [
				{
					elbowed: true,
					fixedSegments: [],
					points: [
						[0, 0],
						[coordinate, 0],
					],
				},
				{ elbowed: "bad" },
				{ fixedSegments: [] },
			] as const) {
				const elements =
					"elbowed" in marker && marker.elbowed === true && "points" in marker
						? boundarySources(coordinate)
						: negativeModeSources(marker);
				expect(() =>
					planBridgeCreate({
						elements,
						bridgeId: "Bridge-refused",
						overConnectorId: "over",
						underConnectorId: "under",
						background: "#ffffff",
					}),
				).toThrow(unsupportedSourceMessage);
			}
	});

	test("correlates and validates multi-segment rounded and elbowed crossings", () => {
		for (const mode of ["rounded", "elbowed"] as const) {
			const sources = multiSegmentSources(mode);
			const crossings = inspectBoard(sources).findings.filter(
				(
					finding,
				): finding is Extract<
					InspectionReport["findings"][number],
					{ code: "CONNECTOR_INTERSECTION_UNMARKED" }
				> => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
			);
			expect(crossings).toHaveLength(1);
			const crossing = crossings[0];
			if (!crossing) throw new Error("multi-segment crossing fixture did not produce a finding");
			const segmentIndexFor = (connectorId: string) =>
				crossing.details.firstConnectorId === connectorId
					? crossing.details.firstSegmentIndex
					: crossing.details.secondSegmentIndex;
			expect(crossing.details.point).toEqual({ x: 60, y: 70 });
			expect(segmentIndexFor("multi-over")).toBe(2);
			expect(segmentIndexFor("multi-under")).toBe(1);
			const plan = planBridgeCreate({
				elements: sources,
				bridgeId: `Bridge-multi-${mode}`,
				overConnectorId: "multi-over",
				underConnectorId: "multi-under",
				background: "#ffffff",
			});
			expect(plan.overSegmentIndex).toBe(segmentIndexFor(plan.overConnectorId));
			expect(plan.underSegmentIndex).toBe(segmentIndexFor(plan.underConnectorId));
			expect(plan.crossing).toEqual(crossing.details.point);
			const board = new Map(sources.map((element) => [element.id, element]));
			const parts = applyElementInput(board, {
				upserts: [...plan.inputs],
				origin: "agent",
			}).named;
			const decorated = [...sources, ...parts];
			expect(validateBridgeDecorations(decorated)).toMatchObject({
				valid: [{ bridgeId: `Bridge-multi-${mode}` }],
				invalid: [],
			});
			expect(
				inspectBoard(decorated).findings.filter(
					(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
				),
			).toHaveLength(0);
			const secondUnder = completeElement({
				id: "second-under",
				type: "line",
				x: 75,
				y: 0,
				width: 0,
				height: 100,
				points: [
					[0, 0],
					[0, 100],
				],
			} satisfies LegacyElementIngress);
			const withSecond = [...decorated, secondUnder];
			const unmarked = inspectBoard(withSecond).findings.filter(
				(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
			);
			expect(unmarked).toHaveLength(1);
			expect(
				new Set([unmarked[0]!.details.firstConnectorId, unmarked[0]!.details.secondConnectorId]),
			).toEqual(new Set(["multi-over", "second-under"]));
			expect(validateBridgeDecorations(withSecond)).toMatchObject({
				valid: [{ bridgeId: `Bridge-multi-${mode}` }],
				invalid: [],
			});
		}
	});
});
