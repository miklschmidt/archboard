import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line archboard/import-boundaries -- approved contract test verifies the public CLI receipt schema.
import { BridgeRemoveResultSchema } from "../../../cli/commands/bridge.js";
import { applyElementInput } from "../../engine/apply-element-input.js";
import { compareBoards } from "../../engine/compare.js";
import { describeScene } from "../../engine/describe.js";
import type { ServerElement } from "../../engine/types.js";
import { architectureFacts } from "../architecture.js";
import {
	BridgeMetadataSchema,
	planBridgeCreate,
	planBridgeRemoval,
	validateBridgeDecorations,
} from "../bridge.js";
import { inspectBoard, type InspectionReport } from "../index.js";
import { connector, crossingConnectors } from "./fixtures/elements.js";

const prepared = () => {
	const sources = crossingConnectors() as unknown as ServerElement[];
	const plan = planBridgeCreate({
		elements: sources,
		bridgeId: "Bridge01",
		overConnectorId: "over",
		underConnectorId: "under",
		background: "#ffffff",
	});
	const crossing = inspectBoard(sources).findings.find(
		(
			finding,
		): finding is Extract<
			InspectionReport["findings"][number],
			{
				code: "CONNECTOR_INTERSECTION_UNMARKED";
			}
		> =>
			finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
			new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).size === 2 &&
			new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has("over") &&
			new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has("under"),
	);
	expect(crossing).toBeDefined();
	if (crossing) {
		const segmentIndexFor = (connectorId: string) =>
			crossing.details.firstConnectorId === connectorId
				? crossing.details.firstSegmentIndex
				: crossing.details.secondSegmentIndex;
		expect(plan.overSegmentIndex).toBe(segmentIndexFor(plan.overConnectorId));
		expect(plan.underSegmentIndex).toBe(segmentIndexFor(plan.underConnectorId));
		expect(plan.crossing).toEqual(crossing.details.point);
	}
	const board = new Map(sources.map((element) => [element.id, element]));
	const parts = applyElementInput(board, {
		upserts: [...plan.inputs],
		origin: "agent",
	}).named;
	return { sources, parts, elements: [...sources, ...parts] };
};

const compared = (elements: ServerElement[]) => ({
	key: "bridge",
	identity: { board: "bridge", variant: "current" as const },
	elements,
	source: "memory" as const,
});

describe("bridge validation", () => {
	test("validates the exact pair and hides it from every read seam", () => {
		const { sources, elements } = prepared();
		expect(validateBridgeDecorations(elements)).toMatchObject({
			valid: [{ bridgeId: "Bridge01" }],
			invalid: [],
		});
		expect(
			inspectBoard(elements).findings.some((f) => f.reason === "proper-interior-crossing"),
		).toBe(false);
		expect(architectureFacts(elements).elements).toHaveLength(2);
		expect(describeScene(elements)).toBe(describeScene(sources));
		expect(JSON.stringify(compareBoards(compared(elements), compared(elements)))).toBe(
			JSON.stringify(compareBoards(compared(sources), compared(sources))),
		);
		const tracked = elements.map((element) => ({
			...element,
			customData: element.customData?.archboard
				? {
						...element.customData,
						archboard: {
							...element.customData.archboard,
							createdAt: "2026-08-29T00:00:00.000Z",
							updatedAt: "2026-08-29T00:00:01.000Z",
						},
					}
				: element.customData,
		})) as ServerElement[];
		expect(validateBridgeDecorations(tracked).invalid).toEqual([]);
		expect(
			inspectBoard(tracked).findings.some((f) => f.reason === "proper-interior-crossing"),
		).toBe(false);
		const secondUnder = connector({
			id: "second-under",
			x: 75,
			width: 0,
			height: 100,
			points: [
				[0, 0],
				[0, 100],
			],
		});
		const crossings = inspectBoard([...elements, secondUnder]).findings.filter(
			(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
		);
		expect(crossings).toHaveLength(1);
		expect(
			new Set([crossings[0]!.details.firstConnectorId, crossings[0]!.details.secondConnectorId]),
		).toEqual(new Set(["over", "second-under"]));
	});

	test("invalid provenance suppresses nothing", () => {
		const { sources, parts } = prepared();
		const cases: ServerElement[][] = [
			[...sources, parts[0]!],
			[...sources, { ...parts[0]!, isDeleted: true }, parts[1]!],
			[...sources, { ...parts[0]!, type: "rectangle" }, parts[1]!],
			[...sources, { ...parts[0]!, x: parts[0]!.x + 1 }, parts[1]!],
			[...sources, parts[0]!, parts[0]!, parts[1]!],
		];
		for (const elements of cases) {
			const report = inspectBoard(elements);
			expect(report.findings.some((f) => f.code === "BRIDGE_PROVENANCE_INVALID")).toBe(true);
			expect(report.findings.some((f) => f.reason === "proper-interior-crossing")).toBe(true);
		}
	});

	test("rejects every non-generated semantic field on either bridge part", () => {
		const fields: readonly (readonly [string, unknown])[] = [
			["archboard", { marker: true }],
			["library", { itemId: "library-item" }],
			["node", "semantic-node"],
			["kind", "semantic-kind"],
			["bridge", { marker: true }],
			["bridgeId", "other-bridge"],
			["role", "mask"],
			["overConnectorId", "over"],
			["underConnectorId", "under"],
			["overSegmentIndex", 0],
			["underSegmentIndex", 0],
			["crossing", { x: 50, y: 50 }],
			["background", "#ffffff"],
			["binding", { path: "src/bridge.ts" }],
			["path", "src/bridge.ts"],
			["repo", "archboard"],
			["itemId", "library-item"],
			["item", "library-item"],
			["start", { id: "over" }],
			["end", { id: "under" }],
			["elementId", "over"],
			["focus", 0],
			["gap", 0],
			["fixedPoint", [0.5, 0.5]],
			["containerId", "foreign-container"],
			["fontFamily", 1],
			["label", { text: "unexpected label" }],
			["text", "unexpected text"],
		];
		for (const roleIndex of [0, 1] as const)
			for (const [field, value] of fields) {
				const { sources, parts } = prepared();
				const mutated = structuredClone(parts);
				(mutated[roleIndex] as unknown as Record<string, unknown>)[field] = structuredClone(value);
				const elements = [...sources, ...mutated];
				const validated = validateBridgeDecorations(elements);
				const report = inspectBoard(elements);
				expect(validated.valid, `${roleIndex}:${field}`).toHaveLength(0);
				expect(validated.invalid, `${roleIndex}:${field}`).toContainEqual(
					expect.objectContaining({ reason: "stale-decoration" }),
				);
				expect(
					report.findings.some((finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED"),
					`${roleIndex}:${field}`,
				).toBe(true);
				expect(
					architectureFacts(elements).elements.some(({ id }) => id === mutated[roleIndex]!.id),
				).toBe(true);
				expect(planBridgeRemoval(mutated, "Bridge01")).toEqual(
					mutated.map(({ id }) => id) as [string, string],
				);
			}
	});

	test("keeps bridge metadata closed at every strict object", () => {
		const { parts } = prepared();
		const metadata = (parts[0]!.customData!.archboard as { bridge: Record<string, unknown> })
			.bridge;
		for (const candidate of [
			{ ...metadata, extra: true },
			{
				...metadata,
				crossing: { ...(metadata.crossing as object), extra: true },
			},
		])
			expect(BridgeMetadataSchema.safeParse(candidate).success).toBe(false);
	});

	test("removal is provenance-only and the receipt schema is exact", () => {
		const { parts } = prepared();
		const removed = planBridgeRemoval(parts, "Bridge01");
		expect(removed).toEqual(parts.map(({ id }) => id) as [string, string]);
		const receipt = {
			success: true as const,
			board: "bridge",
			bridgeId: "Bridge01",
			deleted: [...removed] as [string, string],
			elements: [],
			fingerprint: { elements: 2, note: "receipt", version: 2 },
		};
		expect(BridgeRemoveResultSchema.parse(receipt)).toEqual(receipt);
		for (const candidate of [
			{ ...receipt, bridgeId: "OtherBridge" },
			{ ...receipt, deleted: [removed[1], removed[0]] },
			{ ...receipt, deleted: ["Bridge01", "Bridge01"] },
		])
			expect(BridgeRemoveResultSchema.safeParse(candidate).success).toBe(false);
		expect(() => planBridgeRemoval(parts, "missing")).toThrow();
	});
});
