import { describe, expect, test } from "bun:test";
import {
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type SemanticBoard,
} from "@/shared/semantic-board/index";
import { drawingOf, predecessorDrawingsOf } from "@/server/canvas/index";

const PLATFORM = { id: "pl", name: "Platform", kind: "service" };
const GATEWAY = { id: "gw", name: "Gateway", kind: "module", parent: "pl" };
const LEGACY = { id: "lg", name: "Legacy intake", kind: "module", parent: "pl" };
const LEDGER = { id: "ld", name: "Ledger", kind: "datastore" };
const QUEUE = { id: "qu", name: "Intake queue", kind: "queue", parent: "pl" };
const OLD_WIRE = { id: "old", from: "gw", to: "lg", kind: "call" };
const KEPT_WIRE = { id: "kept", from: "gw", to: "ld", kind: "data" };

/** A three-generation family in which each proposal removes something. */
const board: SemanticBoard = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "bd",
	name: "payments",
	level: "system",
	version: 3,
	createdAt: "2026-09-13T00:00:00.000Z",
	updatedAt: "2026-09-13T00:00:00.000Z",
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [PLATFORM, GATEWAY, LEGACY, LEDGER],
				edges: [OLD_WIRE, KEPT_WIRE],
			},
		},
		{
			id: "v2",
			name: "Queued intake",
			lifecycle: "draft",
			parent: "v1",
			content: { nodes: [PLATFORM, GATEWAY, LEDGER, QUEUE], edges: [KEPT_WIRE] },
		},
		{
			id: "v3",
			name: "Queue only",
			lifecycle: "draft",
			parent: "v2",
			content: { nodes: [PLATFORM, GATEWAY, QUEUE], edges: [] },
		},
	],
});

describe("predecessor drawings", () => {
	test("a direct proposal receives its parent and an initial variant receives none", () => {
		const [initial, direct] = board.variants;
		expect(predecessorDrawingsOf(board, initial!)).toEqual([]);
		expect(predecessorDrawingsOf(board, direct!)).toEqual([drawingOf(board, initial!).content]);
	});

	test("nested lineage is oldest first and ends with the direct parent's visible drawing", () => {
		const [initial, direct, nested] = board.variants;
		const lineage = predecessorDrawingsOf(board, nested!);
		expect(lineage).toEqual([
			drawingOf(board, initial!).content,
			drawingOf(board, direct!).content,
		]);
		// The direct parent's reference includes the subject that parent removed.
		expect(lineage.at(-1)?.nodes.map((node) => node.id)).toContain("lg");
	});

	test("every ancestor uses the same scope while retaining its own visible removals", () => {
		const scope = {
			kind: "selection" as const,
			nodes: ["pl", "gw", "lg"],
			edges: [],
			flows: [],
		};
		const [initial, direct, nested] = board.variants;
		const lineage = predecessorDrawingsOf(board, nested!, scope);
		expect(lineage).toEqual([
			drawingOf(board, initial!, scope).content,
			drawingOf(board, direct!, scope).content,
		]);
		expect(
			lineage
				.at(-1)
				?.nodes.map((node) => node.id)
				.toSorted(),
		).toEqual(["gw", "lg", "pl"]);
	});
});
