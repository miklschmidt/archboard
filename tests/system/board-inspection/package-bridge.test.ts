import { describe, expect, test } from "bun:test";
import { generateKeyBetween } from "fractional-indexing";
import { BridgeRemoveResultSchema, BridgeResultSchema } from "../../../src/cli/commands/bridge.js";
import { applyElementInput } from "../../../src/runtime/engine/apply-element-input.js";
import type { ServerElement } from "../../../src/runtime/engine/types.js";
import { planBridgeCreate } from "../../../src/runtime/board-inspection/bridge.js";
import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import { unmarkedBridgeScene } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";
import { expandElements } from "../../../src/runtime/engine/expand-elements.js";
import type { LegacyElementIngress } from "../../../src/shared/board-elements/index.js";

const complete = (input: LegacyElementIngress): ServerElement =>
	expandElements([input], { deterministic: true, forStore: true })[0]!;

const bridgeInput = (
	raw: Record<string, unknown>,
	type: "line" | "arrow",
): LegacyElementIngress => {
	const number = (key: "x" | "y" | "width" | "height") => {
		const value = raw[key];
		if (typeof value !== "number") throw new Error(`bridge fixture has no numeric ${key}`);
		return value;
	};
	if (typeof raw.id !== "string" || typeof raw.index !== "string" || !Array.isArray(raw.points))
		throw new Error("bridge fixture is incomplete");
	const points = raw.points.map((point) => {
		if (
			!Array.isArray(point) ||
			point.length !== 2 ||
			typeof point[0] !== "number" ||
			typeof point[1] !== "number"
		)
			throw new Error("bridge fixture has an invalid point");
		return [point[0], point[1]] as [number, number];
	});
	const common = {
		id: raw.id,
		x: number("x"),
		y: number("y"),
		width: number("width"),
		height: number("height"),
		index: raw.index,
		points,
	};
	return type === "line" ? { ...common, type: "line" } : { ...common, type: "arrow" };
};

const bridged = () => {
	const raw = unmarkedBridgeScene();
	const sources = expandElements([bridgeInput(raw[0]!, "line"), bridgeInput(raw[1]!, "arrow")], {
		deterministic: true,
		forStore: true,
	});
	const plan = planBridgeCreate({
		elements: sources,
		bridgeId: "Bridge01",
		overConnectorId: "over",
		underConnectorId: "under",
		background: "#ffffff",
	});
	const board = new Map(sources.map((element) => [element.id, element]));
	const parts = applyElementInput(board, {
		upserts: [...plan.inputs],
		origin: "agent",
	}).named;
	return { sources, parts, elements: [...sources, ...parts] };
};

describe("package bridge inspection", () => {
	test("suppresses exactly a valid persisted crossing", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const { elements } = bridged();
			owner.writeBoard("valid", elements);
			const result = owner.runInspection("valid", ["--strict"]);
			expect(result.status).toBe(0);
			expect(CheckResultSchema.parse(JSON.parse(result.stdout)).clean).toBe(true);
			owner.writeBoard("one-unmarked", [
				...elements,
				{
					id: "second-under",
					type: "arrow",
					x: 75,
					y: 0,
					width: 0,
					height: 100,
					points: [
						[0, 0],
						[0, 100],
					],
				},
			]);
			const oneUnmarked = CheckResultSchema.parse(
				JSON.parse(owner.runInspection("one-unmarked", ["--strict"]).stdout),
			);
			expect(
				oneUnmarked.findings.filter(
					(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
				),
			).toHaveLength(1);
		} finally {
			await owner.dispose();
		}
	});

	test("reports incomplete, stale, deleted, wrong-type, semantic, and interposed provenance", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const { sources, parts } = bridged();
			const cases: [string, ServerElement[]][] = [
				["incomplete", [...sources, parts[0]!]],
				["stale", [...sources, { ...parts[0]!, x: parts[0]!.x + 1 }, parts[1]!]],
				["deleted", [...sources, { ...parts[0]!, isDeleted: true }, parts[1]!]],
				["wrong-type", [...sources, { ...parts[0]!, type: "rectangle" }, parts[1]!]],
				[
					"interposed",
					[
						...sources,
						parts[0]!,
						complete({
							id: "between",
							type: "rectangle",
							x: 200,
							y: 200,
							width: 10,
							height: 10,
							index: generateKeyBetween(parts[0]!.index, parts[1]!.index),
						}),
						parts[1]!,
					],
				],
			];
			for (const [label, roleIndex, field, value] of [
				["container", 0, "containerId", "foreign-container"],
				["text", 1, "text", "unexpected text"],
				["label", 0, "label", { text: "unexpected label" }],
				["start", 1, "start", { id: "over" }],
				["end", 0, "end", { id: "under" }],
				["font", 1, "fontFamily", 1],
			] as const) {
				const semanticParts = structuredClone(parts);
				(semanticParts[roleIndex] as unknown as Record<string, unknown>)[field] =
					structuredClone(value);
				cases.push([`semantic-${label}`, [...sources, ...semanticParts]]);
			}
			for (const [name, elements] of cases) {
				owner.writeBoard(name, elements);
				const result = owner.runInspection(name, ["--strict"]);
				const report = CheckResultSchema.parse(JSON.parse(result.stdout));
				expect(result.status).toBe(8);
				expect({
					name,
					codes: report.findings.map((f) => f.code),
				}).toMatchObject({
					name,
					codes: expect.arrayContaining(["BRIDGE_PROVENANCE_INVALID"]),
				});
				expect(report.findings.some((f) => f.code === "CONNECTOR_INTERSECTION_UNMARKED")).toBe(
					true,
				);
			}
		} finally {
			await owner.dispose();
		}
	});

	test("parses exact create and removal receipt fixtures through public schemas", () => {
		const { parts } = bridged();
		const metadata = (
			parts[0]!.customData!.archboard as {
				bridge: {
					overSegmentIndex: number;
					underSegmentIndex: number;
					crossing: { x: number; y: number };
				};
			}
		).bridge;
		const create = {
			success: true as const,
			board: "bridge",
			bridgeId: "Bridge01",
			overConnectorId: "over",
			underConnectorId: "under",
			overSegmentIndex: metadata.overSegmentIndex,
			underSegmentIndex: metadata.underSegmentIndex,
			crossing: metadata.crossing,
			elements: parts,
			fingerprint: { elements: 4, note: "receipt", version: 1 },
		};
		const remove = {
			success: true as const,
			board: "bridge",
			bridgeId: "Bridge01",
			deleted: parts.map(({ id }) => id) as [string, string],
			elements: [],
			fingerprint: { elements: 2, note: "receipt", version: 2 },
		};
		expect(BridgeResultSchema.safeParse(create).success).toBe(true);
		expect(BridgeRemoveResultSchema.safeParse(remove).success).toBe(true);
	});
});
