// What a narrated step tells the voice it highlights (TASK-309).
//
// What is guarded: every subject a beat names reaches the voice by name, never by id, a
// relationship by its ends and label; on a draft, each says how it stands against what the draft
// was branched from, and a changed one says what moved, naming a part it moved from even when
// the draft removed it; on a variant branched from nothing, nothing is said to have changed.

import { expect, test } from "bun:test";

import { narratedSubjects } from "@/server/archboard/narrated-subjects";
import { SEMANTIC_BOARD_SCHEMA_VERSION, SemanticBoardSchema } from "@archboard/board/document";
import { WalkthroughBeatSchema } from "@archboard/board/walkthrough";

const GATEWAY = { id: "gw", name: "Gateway", kind: "service", order: 1000 };
const INTAKE = { id: "in", name: "Legacy intake", kind: "service", order: 2000 };
const LEDGER = { id: "ld", name: "Ledger", kind: "service", order: 3000 };

const board = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "bd",
	name: "payments",
	level: "system",
	version: 2,
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [GATEWAY, INTAKE],
				edges: [{ id: "e1", from: "gw", to: "in", kind: "call", label: "read", order: 1000 }],
			},
		},
		{
			id: "v2",
			name: "This pull request",
			lifecycle: "draft",
			parent: "v1",
			content: {
				nodes: [GATEWAY, LEDGER],
				edges: [{ id: "e1", from: "gw", to: "ld", kind: "call", label: "write", order: 1000 }],
			},
		},
	],
});

const beat = WalkthroughBeatSchema.parse({
	id: "b1",
	heading: "One writer",
	body: "Only the ledger writes.",
	subjects: ["ld", "e1", "gw"],
});

test("a step names what it highlights, and on a draft how each changed", () => {
	const [current, draft] = board.variants;
	expect(narratedSubjects(board, draft!, beat)).toEqual([
		{ name: "Ledger", standing: "added", moved: [] },
		{
			name: 'Gateway → Ledger "write"',
			standing: "changed",
			// Each moved field names what the other side says and which side says it.
			moved: [
				expect.stringMatching(/^to .*Legacy intake.*Initial/),
				expect.stringMatching(/^label .*read.*Initial/),
			],
		},
		{ name: "Gateway", standing: "unchanged", moved: [] },
	]);
	// Branched from nothing: named, and nothing said to have changed.
	expect(narratedSubjects(board, current!, { ...beat, subjects: ["e1", "missing"] })).toEqual([
		{ name: 'Gateway → Legacy intake "read"', standing: null, moved: [] },
	]);
});
