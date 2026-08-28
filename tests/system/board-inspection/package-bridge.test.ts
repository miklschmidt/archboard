import { describe, expect, test } from "bun:test";
import { generateKeyBetween } from "fractional-indexing";
import { BridgeRemoveResultSchema, BridgeResultSchema } from "../../../src/cli/commands/bridge.js";
import { applyElementInput } from "../../../src/runtime/engine/apply-element-input.js";
import type { ServerElement } from "../../../src/runtime/engine/types.js";
import { planBridgeCreate } from "../../../src/runtime/board-inspection/bridge.js";
import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import { unmarkedBridgeScene } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

const bridged = () => {
	const sources = unmarkedBridgeScene() as unknown as ServerElement[];
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
						{
							id: "between",
							type: "rectangle",
							x: 200,
							y: 200,
							width: 10,
							height: 10,
							index: generateKeyBetween(parts[0]!.index, parts[1]!.index),
						},
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
