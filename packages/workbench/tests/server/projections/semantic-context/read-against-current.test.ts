// What an agent and the narrating voice are told a variant differs by, once a
// board has history (decided by the user on 2026-09-27).
//
// What is guarded: they are told what the picture on screen marks. A historical
// variant is read against the current one, the current one against nothing, and
// on a board with no current variant a draft against the one it came from.

import { expect, test } from "bun:test";

import { semanticBoardContext } from "#server/projections/semantic-context/board-context.ts";
import { narratedSubjects } from "#server/rules/semantic-context/narrated-subjects.ts";
import { semanticBoardAddress } from "@archboard/board/address";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import { WalkthroughBeatSchema } from "@archboard/board/content";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

const GATEWAY = { id: "gw", name: "Gateway", kind: "service", order: 1000 };
const INTAKE = { id: "in", name: "Legacy intake", kind: "service", order: 2000 };
const LEDGER = { id: "ld", name: "Ledger", kind: "service", order: 3000 };

/**
 * A board with a first architecture and the one that replaced it.
 * @param current Whether the replacement was adopted, or both are still drafts.
 * @returns The board.
 */
function boardOf(current: boolean): SemanticBoard {
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "payments",
		level: "system",
		version: 3,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		...(current ? { current: "v2" } : {}),
		variants: [
			{
				id: "v1",
				name: "As first built",
				lifecycle: current ? "historical" : "draft",
				content: {
					nodes: [GATEWAY, INTAKE],
					edges: [{ id: "e1", from: "gw", to: "in", kind: "call", label: "read", order: 1000 }],
				},
			},
			{
				id: "v2",
				name: "With a ledger",
				lifecycle: current ? "current" : "draft",
				parent: "v1",
				content: {
					nodes: [GATEWAY, LEDGER],
					edges: [{ id: "e1", from: "gw", to: "ld", kind: "call", label: "write", order: 1000 }],
				},
			},
		],
	});
}

/**
 * A pane report saying it shows one variant.
 * @param board The board.
 * @param variant The variant on screen.
 * @returns The report.
 */
function showing(board: SemanticBoard, variant: SemanticVariant): SemanticPaneContext {
	return {
		paneId: "pane-a",
		clientId: "client-a",
		board: semanticBoardAddress(board.name),
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		view: null,
		selection: [],
		version: board.version,
		at: "2026-09-27T00:00:00.000Z",
		sequence: 1,
	};
}

const beat = WalkthroughBeatSchema.parse({
	id: "b1",
	heading: "Who writes",
	body: "The ledger writes now.",
	subjects: ["ld", "in"],
});

test("a historical variant is read against the current one, and the current one against nothing", () => {
	const board = boardOf(true);
	const [historical, current] = board.variants;

	const past = semanticBoardContext(board, showing(board, historical!)).architecture;
	expect(past.variant?.against).toBe("v2");
	expect(past.differences?.subjects).toContainEqual(
		expect.objectContaining({ change: "removed", id: "ld" }),
	);
	expect(past.differences?.subjects).toContainEqual(
		expect.objectContaining({ change: "added", id: "in" }),
	);
	const now = semanticBoardContext(board, showing(board, current!)).architecture;
	expect(now.variant?.against).toBeNull();
	expect(now.differences).toBeNull();

	// The voice explaining history's walkthrough hears the same marks.
	expect(narratedSubjects(board, historical!, { ...beat, subjects: ["in"] })).toEqual([
		{ name: "Legacy intake", standing: "added", moved: [] },
	]);
	// A field that moved is told as what now says, named as now, never as what history "was".
	const [wire] = narratedSubjects(board, historical!, { ...beat, subjects: ["e1"] });
	expect(wire?.standing).toBe("changed");
	expect(wire?.moved).toEqual([
		expect.stringMatching(/^to .*Ledger.*With a ledger/),
		expect.stringMatching(/^label .*write.*With a ledger/),
	]);
	expect(narratedSubjects(board, current!, beat)).toEqual([
		{ name: "Ledger", standing: null, moved: [] },
	]);
});

test("on a board nobody has built a draft is read against the one it came from", () => {
	const board = boardOf(false);
	const [, second] = board.variants;

	const read = semanticBoardContext(board, showing(board, second!)).architecture;
	expect(read.variant?.against).toBe("v1");
	expect(narratedSubjects(board, second!, beat)).toEqual([
		{ name: "Ledger", standing: "added", moved: [] },
	]);
});
