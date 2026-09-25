// Cards nothing connects, set out as a grid (TASK-349). A container or group
// of cards with no relationship between them has no ranks to follow, and
// Graphviz lines them all up on one rank. Each such card is chained to the
// card above it in its column by an invisible, heavy edge one rank long, so
// Graphviz stacks the rows and keeps the columns straight.
import type { Edge } from "@viz-js/viz";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { EMPTY_CHANNEL } from "@/transformers/semantic-renderer/lib/track/route";

/** The fewest loose cards set out as a grid rather than left on one rank. */
const MIN_GRID = 4;
/** How strongly a grid column pulls its cards into line. */
const COLUMN_WEIGHT = 100;
/** The room beside a card in its row: the gap Graphviz keeps between neighbours. */
const COLUMN_ROOM = 40;

/**
 * Whether some loose cards are enough to set out as a grid.
 * @param cards The loose cards.
 * @returns True when there are enough.
 */
function grids(cards: readonly unknown[]): boolean {
	return cards.length >= MIN_GRID;
}

/**
 * The invisible edges that set loose cards out as a grid, in their order,
 * row by row, with as many columns as bring the grid nearest the page's shape.
 * @param cards The loose cards, in the board's order, with their sizes.
 * @returns The edges, from each card to the one below it.
 */
function gridEdges(cards: readonly { id: string; width: number; height: number }[]): Edge[] {
	if (!grids(cards)) return [];
	const width = Math.max(...cards.map((card) => card.width)) + COLUMN_ROOM;
	const height = Math.max(...cards.map((card) => card.height)) + EMPTY_CHANNEL;
	const shape = REFERENCE_PANE.width / REFERENCE_PANE.height;
	const fitting = Math.round(Math.sqrt((cards.length * shape * height) / width));
	const columns = Math.max(1, Math.min(cards.length, fitting));
	return cards.slice(columns).map((head, index) => ({
		tail: cards[index]!.id,
		head: head.id,
		attributes: { style: "invis", minlen: 1, weight: COLUMN_WEIGHT },
	}));
}

/**
 * The invisible edges that keep a wrapped rank's rows in columns: every
 * lowered card chained to the card above it in its column, a row of cards and
 * its labels higher, so the rows stand as a grid instead of each card leaning
 * toward its own source.
 * @param plan The wrap: every card of the rank, left to right, and its row.
 * @returns The edges, from each card to the one below it.
 */
function wrapEdges(plan: ReadonlyMap<string, number>): Edge[] {
	const rows: string[][] = [];
	for (const [card, row] of plan) (rows[row] ??= []).push(card);
	return rows.flatMap((cards, row) =>
		row === 0
			? []
			: cards.flatMap((head, column) => {
					const tail = rows[row - 1]?.[column];
					if (tail === undefined) return [];
					return [{ tail, head, attributes: { style: "invis", minlen: 2, weight: COLUMN_WEIGHT } }];
				}),
	);
}

export { gridEdges, grids, wrapEdges };
