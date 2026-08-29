import { describe, expect, test } from "bun:test";
// oxlint-disable-next-line archboard/import-boundaries -- approved contract test verifies the public CLI receipt schema.
import { BridgeResultSchema } from "../../../cli/commands/bridge.js";
import { applyElementInput } from "../../engine/apply-element-input.js";
import type { ServerElement } from "../../engine/types.js";
import { inspectBoard } from "../index.js";
import { BridgeMetadataSchema, BridgeRefusal, planBridgeCreate } from "../bridge.js";
import { crossingConnectors } from "./fixtures/elements.js";

const freshSources = () => crossingConnectors() as unknown as ServerElement[];

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
		const shifted = crossingConnectors();
		shifted[1].x = 50.5;
		expect(() =>
			planBridgeCreate({
				elements: shifted as unknown as ServerElement[],
				bridgeId: "at",
				overConnectorId: "over",
				underConnectorId: "under",
				at: { x: 50, y: 50 },
				background: "#ffffff",
			}),
		).not.toThrow();
		shifted[1].x = 50.501;
		expect(() =>
			planBridgeCreate({
				elements: shifted as unknown as ServerElement[],
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
});
