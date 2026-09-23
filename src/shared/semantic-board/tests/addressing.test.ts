import { describe, expect, test } from "bun:test";
import {
	addressedVariant,
	currentVariant,
	parseSemanticBoard,
	type SemanticBoard,
} from "@/shared/semantic-board/index";
import { withFixtureOrders } from "./fixture-orders.ts";

type Lifecycle = SemanticBoard["variants"][number]["lifecycle"];

/**
 * A board document holding the stated variants, designating `current` when given.
 * @param variants Each variant's id, lifecycle and predecessor.
 * @param current The designated variant, if any.
 * @returns The document.
 */
const board = (
	variants: ReadonlyArray<readonly [id: string, lifecycle: Lifecycle, parent?: string]>,
	current?: string,
): unknown =>
	withFixtureOrders({
		schemaVersion: "2.4.0",
		kind: "semantic-board",
		id: "bd1",
		name: "Planned",
		level: "system",
		version: 1,
		createdAt: "2026-09-23T00:00:00.000Z",
		updatedAt: "2026-09-23T00:00:00.000Z",
		views: [],
		...(current === undefined ? {} : { current }),
		variants: variants.map(([id, lifecycle, parent]) => ({
			id,
			name: `Name ${id}`,
			lifecycle,
			...(parent === undefined ? {} : { parent }),
			content: { nodes: [], edges: [] },
		})),
	});

/**
 * Parse a document that must be coherent.
 * @param value The document.
 * @returns The board.
 */
const parsed = (value: unknown): SemanticBoard => {
	const result = parseSemanticBoard(value);
	if (!result.ok) throw new Error(result.problem);
	return result.board;
};

/**
 * The id of what a bare address opens, or null when it refuses.
 * @param value The document.
 * @param asked The variant the address states, if any.
 * @returns The variant id, or null.
 */
const opens = (value: unknown, asked?: string): string | null => {
	const found = addressedVariant(parsed(value), asked);
	return found.ok ? found.variant.id : null;
};

describe("a board for something nobody has built", () => {
	test("has no current variant and is coherent", () => {
		const planned = parsed(board([["v1", "draft"]]));
		expect(currentVariant(planned)).toBeUndefined();
	});

	test("may not mark a variant current without designating it", () => {
		expect(parseSemanticBoard(board([["v1", "current"]])).ok).toBe(false);
	});
});

describe("what an address that names no variant opens", () => {
	test("the current variant, when there is one", () => {
		expect(
			opens(
				board(
					[
						["v1", "current"],
						["v2", "draft", "v1"],
					],
					"v1",
				),
			),
		).toBe("v1");
	});

	test("the sole draft, when nothing is built", () => {
		expect(
			opens(
				board([
					["v1", "shelved"],
					["v2", "draft", "v1"],
				]),
			),
		).toBe("v2");
	});

	test("the one draft no other draft came before, when there are several", () => {
		expect(
			opens(
				board([
					["v1", "draft"],
					["v2", "draft", "v1"],
					["v3", "draft", "v1"],
				]),
			),
		).toBe("v1");
	});

	test("nothing, when several drafts stand on a shelved root", () => {
		expect(
			opens(
				board([
					["v1", "shelved"],
					["v2", "draft", "v1"],
					["v3", "draft", "v1"],
				]),
			),
		).toBeNull();
	});

	test("asking for the current variant by its word opens no draft in its place", () => {
		// Which variant is implemented is a different question from which to open,
		// and on this board its truthful answer is none.
		expect(opens(board([["v1", "draft"]]), "current")).toBeNull();
	});
});
