// A board an export draws: a current variant, a draft read against it, an
// architecture view and a sequence view, so a frame around the picture can be
// held to both grammars and to a comparison.

import {
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type SemanticBoard,
} from "@archboard/board/document";
import type { DrawnBoard } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderBoard } from "#runtime/operations/render.ts";
import { type BoardRenderChoices } from "#shared/rules/render/board.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** The built architecture. */
const BUILT = {
	nodes: [
		{ id: "api", name: "Intake API", kind: "service" },
		{ id: "queue", name: "Work queue", kind: "module" },
		{ id: "store", name: "Row store", kind: "datastore" },
	],
	edges: [
		{ id: "put", from: "api", to: "queue", kind: "data", label: "Enqueue" },
		{ id: "read", from: "queue", to: "store", kind: "call", label: "Read", traffic: {} },
	],
	flows: [
		{
			id: "ingest",
			name: "Ingest",
			participants: ["api", "queue"],
			steps: [
				{ id: "ask", from: "api", to: "queue", label: "enqueue", kind: "sync" },
				{ id: "ack", from: "queue", to: "api", label: "ack", kind: "return" },
			],
		},
	],
};

/** The draft: the store goes, a worker comes, and the queue says something new. */
const DRAFT = {
	...BUILT,
	nodes: [
		{ id: "api", name: "Intake API", kind: "service" },
		{ id: "queue", name: "Work queue", kind: "module", responsibility: "Holds every job" },
		{ id: "worker", name: "Worker", kind: "module" },
	],
	edges: [
		{ id: "put", from: "api", to: "queue", kind: "data", label: "Enqueue" },
		{ id: "take", from: "worker", to: "queue", kind: "call", label: "Take" },
	],
};

/** The board. */
const EXPORT_BOARD: SemanticBoard = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "board",
	name: "Ingest",
	level: "system",
	version: 1,
	createdAt: "2026-10-12T00:00:00.000Z",
	updatedAt: "2026-10-12T00:00:00.000Z",
	current: "built",
	views: [
		{
			id: "intake",
			name: "Intake",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["api", "queue"] },
		},
		{
			id: "exchange",
			name: "Exchange",
			grammar: "sequence",
			scope: { kind: "selection", flows: ["ingest"] },
		},
	],
	variants: [
		{ id: "built", name: "As built", lifecycle: "current", content: orderedFixture(BUILT) },
		{
			id: "draft",
			name: "Worker pool",
			lifecycle: "draft",
			parent: "built",
			content: orderedFixture(DRAFT),
		},
	],
});

/**
 * Draw the board as an export draws it: faces embedded, for one theme.
 * @param choices What to draw, beyond the faces.
 * @returns The drawn reply.
 */
async function exported(choices: Omit<BoardRenderChoices, "fonts">): Promise<DrawnBoard> {
	const outcome = await renderBoard(
		EXPORT_BOARD,
		{ theme: "light", ...choices },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!outcome.ok || !("svg" in outcome.reply)) throw new Error("Expected a drawn board");
	return outcome.reply;
}

/**
 * What a document draws after its background: the painted page.
 * @param svg The document.
 * @returns Its body.
 */
function paintedBody(svg: string): string {
	const found = /<\/defs>\n<rect [^>]*\/>\n([\s\S]*)\n<\/svg>$/u.exec(svg)?.[1];
	if (found === undefined) throw new Error("The document has no painted body");
	return found;
}

export { EXPORT_BOARD, exported, paintedBody };
