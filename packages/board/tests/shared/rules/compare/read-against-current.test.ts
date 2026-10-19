// Which variant a picture is read against (decided by the user on 2026-09-27).
//
// What is guarded: the current variant is now and is drawn with no comparison;
// every other variant — history behind it, a proposal ahead of it even when that
// proposal stands on history — is drawn as how it differs from the current one;
// and a board with no current variant has no now, so its drafts keep being read
// against the one they came from.

import { describe, expect, test } from "bun:test";
import { drawingOf } from "#shared/rules/compare/drawing.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "#shared/schemas/board-document.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

const PLATFORM = { id: "pl", name: "Platform", kind: "service" };
const GATEWAY = {
	id: "gw",
	name: "Gateway",
	kind: "module",
	parent: "pl",
	responsibility: "Routes",
};
const LEGACY = { id: "lg", name: "Legacy intake", kind: "module", parent: "pl" };
const QUEUE = { id: "qu", name: "Intake queue", kind: "queue", parent: "pl" };
const AUDIT = { id: "au", name: "Audit log", kind: "datastore" };

/** What was built first, what replaced it, and a proposal still written on the first. */
const HISTORY = [
	{
		id: "v1",
		name: "As first built",
		lifecycle: "historical",
		content: { nodes: [PLATFORM, GATEWAY, LEGACY] },
	},
	{
		id: "v2",
		name: "Queued intake",
		lifecycle: "current",
		parent: "v1",
		content: { nodes: [PLATFORM, { ...GATEWAY, responsibility: "Routes and queues" }, QUEUE] },
	},
	{
		id: "v3",
		name: "Audited intake",
		lifecycle: "draft",
		parent: "v1",
		content: { nodes: [PLATFORM, GATEWAY, LEGACY, AUDIT] },
	},
];

/**
 * A board holding these variants.
 * @param variants Its variants.
 * @param current The one it designates current, if any.
 * @returns The board.
 */
function boardOf(variants: readonly Record<string, unknown>[], current?: string): SemanticBoard {
	return SemanticBoardSchema.parse(
		withFixtureOrders({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "payments",
			level: "system",
			version: 3,
			createdAt: "2026-09-27T00:00:00.000Z",
			updatedAt: "2026-09-27T00:00:00.000Z",
			...(current === undefined ? {} : { current }),
			variants,
		}),
	);
}

/**
 * One variant of a board, by id.
 * @param board The board.
 * @param id The variant's id.
 * @returns The variant.
 */
function variantOf(board: SemanticBoard, id: string): SemanticVariant {
	const found = board.variants.find((one) => one.id === id);
	if (found === undefined) throw new Error(`no variant ${id}`);
	return found;
}

describe("a board with a current variant", () => {
	const board = boardOf(HISTORY, "v2");

	test("draws the current variant as it is, with no comparison", () => {
		const drawing = drawingOf(board, variantOf(board, "v2"));

		expect(drawing.changes).toBeNull();
		// Nothing the history had is put back into the picture of now.
		expect(drawing.content.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "pl", "qu"]);
	});

	test("draws a historical variant against current: what current has and history lacks stands removed", () => {
		const drawing = drawingOf(board, variantOf(board, "v1"));

		expect(drawing.changes?.against.id).toBe("v2");
		expect(drawing.changes?.standing).toEqual({
			pl: "unchanged",
			gw: "changed",
			lg: "added",
			qu: "removed",
		});
		// The queue only now has is drawn in history's picture, as what differs.
		expect(drawing.content.nodes.some((node) => node.id === "qu")).toBe(true);
	});

	test("draws a proposal standing on history against current, not against its parent", () => {
		const drawing = drawingOf(board, variantOf(board, "v3"));

		expect(drawing.changes?.against.id).toBe("v2");
		expect(drawing.changes?.standing).toMatchObject({
			au: "added",
			lg: "added",
			qu: "removed",
			gw: "changed",
		});
	});
});

describe("a board nobody has built", () => {
	const board = boardOf([
		{ id: "d1", name: "First sketch", lifecycle: "draft", content: { nodes: [PLATFORM, GATEWAY] } },
		{
			id: "d2",
			name: "With a queue",
			lifecycle: "draft",
			parent: "d1",
			content: { nodes: [PLATFORM, GATEWAY, QUEUE] },
		},
	]);

	test("draws a draft against the draft it came from, since there is no now", () => {
		const drawing = drawingOf(board, variantOf(board, "d2"));

		expect(drawing.changes?.against.id).toBe("d1");
		expect(drawing.changes?.standing).toEqual({ pl: "unchanged", gw: "unchanged", qu: "added" });
		expect(drawingOf(board, variantOf(board, "d1")).changes).toBeNull();
	});
});
