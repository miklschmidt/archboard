// Which row of which column every card sits in, and which rows every container
// box spans.
//
// Forked from PR Lens's `layout/seating.ts`. A lane became a column, the
// removed-node "dead band" is gone with the rest of the pull-request model, and
// the author's `group` — which used to stop two unrelated cards pairing — has
// no spelling in a semantic board, so a shared rank is the whole test for a
// pair.
//
// The change TASK-172 made is that a column is seated **block by block** rather
// than card by card. A container's descendants take a contiguous run of rows
// with nothing foreign between them, which is what lets the container be drawn
// as one box around them. Rank still decides how far down the page a block
// starts, and a card can still only be pushed further down, never pulled up; a
// card inside a container gives up exact rank alignment with the rest of the
// diagram in exchange for being inside its container, which is the stronger
// thing to say about it.

import type { SemanticEdge, SemanticNode } from "@/shared/semantic-board/index";
import { rankNodes } from "@/runtime/semantic-renderer/lib/layout/rank";
import { cardsIn, type Block, type Region } from "@/runtime/semantic-renderer/lib/regions";

/** One occupied row of one column: a single card, or two side by side. */
interface SeatedRow {
	/** The row of the shared grid this sits in. */
	readonly grid: number;
	/** How deeply nested in containers this row's cards are; 0 is directly in the column. */
	readonly depth: number;
	/** The cards in it, left to right. */
	readonly nodes: readonly SemanticNode[];
}

/** One container, and the run of rows its box has to cover. */
interface SeatedContainer {
	/** The container. */
	readonly node: SemanticNode;
	/** How deeply nested its box is; 0 is directly in the column. */
	readonly depth: number;
	/** The first row of the shared grid its content occupies. */
	readonly firstRow: number;
	/** The last row of the shared grid its content occupies. */
	readonly lastRow: number;
}

/** Everything one column holds, placed on the shared row grid. */
interface SeatedRegion {
	/** Its occupied rows, top to bottom. */
	readonly rows: readonly SeatedRow[];
	/** Its container boxes, outermost first. */
	readonly containers: readonly SeatedContainer[];
}

/** Where everything sits, and how many rows the grid ended up with. */
interface Seating {
	/** Each column's rows and boxes, by column index. */
	readonly byRegion: ReadonlyMap<number, SeatedRegion>;
	/** How many rows the shared grid has. */
	readonly rowCount: number;
}

/** What decides who falls and who sits left when two cards want one seat. */
interface Barycenters {
	/** Mean rank of a card's partners: decides who falls when a rank collides. */
	readonly fall: ReadonlyMap<string, number>;
	/** Mean column of a card's partners: decides who sits left in a shared row. */
	readonly side: ReadonlyMap<string, number>;
}

/** Everything that decides where one column's contents sit. */
interface Sorting {
	/** Each card's rank. */
	readonly ranks: ReadonlyMap<string, number>;
	/** The row each rank compresses to. */
	readonly rowOfRank: ReadonlyMap<number, number>;
	/** The barycentres. */
	readonly keys: Barycenters;
	/** Each card's position in document order. */
	readonly docIndex: ReadonlyMap<string, number>;
}

/**
 * The mean of some numbers, or a fallback when there are none.
 * @param ids Whose values to average.
 * @param values The value of each id.
 * @param fallback What to answer when the list is empty.
 * @returns The mean.
 */
function meanOf(
	ids: readonly string[],
	values: ReadonlyMap<string, number>,
	fallback: number,
): number {
	if (ids.length === 0) {
		return fallback;
	}
	let sum = 0;
	for (const id of ids) {
		sum += values.get(id) ?? 0;
	}
	return sum / ids.length;
}

/**
 * Rank values in use, in order, mapped onto contiguous rows.
 * @param nodes The cards.
 * @param ranks Their ranks.
 * @returns A row for each rank that is actually used.
 */
function compressRanks(
	nodes: readonly SemanticNode[],
	ranks: ReadonlyMap<string, number>,
): Map<number, number> {
	const used = [...new Set(nodes.map((node) => ranks.get(node.id) ?? 0))].toSorted((a, b) => a - b);
	return new Map(used.map((rank, index) => [rank, index]));
}

/**
 * Who each card is connected to, in both directions.
 * @param nodes The cards.
 * @param edges The relationships between them.
 * @returns Each card's partners.
 */
function partnersOf(
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
): Map<string, string[]> {
	const partners = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
	for (const edge of edges) {
		const from = partners.get(edge.from);
		const to = partners.get(edge.to);
		if (from !== undefined && to !== undefined && edge.from !== edge.to) {
			from.push(edge.to);
			to.push(edge.from);
		}
	}
	return partners;
}

/**
 * Where each card's partners are, on both axes.
 * @param nodes The cards.
 * @param edges The relationships between them.
 * @param ranks Each card's rank.
 * @param regionOf Each card's column index.
 * @returns The two barycentres.
 */
function barycenters(
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
	ranks: ReadonlyMap<string, number>,
	regionOf: ReadonlyMap<string, number>,
): Barycenters {
	const partners = partnersOf(nodes, edges);
	const fall = new Map<string, number>();
	const side = new Map<string, number>();
	for (const node of nodes) {
		const linked = partners.get(node.id) ?? [];
		fall.set(node.id, meanOf(linked, ranks, ranks.get(node.id) ?? 0));
		side.set(node.id, meanOf(linked, regionOf, regionOf.get(node.id) ?? 0));
	}
	return { fall, side };
}

/**
 * One card's rank.
 * @param node The card.
 * @param sorting What decides where cards sit.
 * @returns Its rank.
 */
function rankOf(node: SemanticNode, sorting: Sorting): number {
	return sorting.ranks.get(node.id) ?? 0;
}

/**
 * The row one rank compresses to.
 * @param rank The rank.
 * @param sorting What decides where cards sit.
 * @returns Its row of the shared grid.
 */
function rowOfRank(rank: number, sorting: Sorting): number {
	return sorting.rowOfRank.get(rank) ?? 0;
}

/**
 * One card's position in document order.
 * @param node The card.
 * @param sorting What decides where cards sit.
 * @returns Its document index.
 */
function docKey(node: SemanticNode, sorting: Sorting): number {
	return sorting.docIndex.get(node.id) ?? 0;
}

/**
 * How far down the page one card's partners are, on average.
 * @param node The card.
 * @param sorting What decides where cards sit.
 * @returns Its fall barycentre.
 */
function fallKey(node: SemanticNode, sorting: Sorting): number {
	return sorting.keys.fall.get(node.id) ?? 0;
}

/**
 * The order two cards take their seats in: by row, then by which of them leans
 * further down the page, then by document order.
 * @param a One card.
 * @param b The other.
 * @param sorting What decides where cards sit.
 * @returns Negative when `a` seats first.
 */
function compareSeats(a: SemanticNode, b: SemanticNode, sorting: Sorting): number {
	return (
		rowOfRank(rankOf(a, sorting), sorting) - rowOfRank(rankOf(b, sorting), sorting) ||
		fallKey(a, sorting) - fallKey(b, sorting) ||
		docKey(a, sorting) - docKey(b, sorting)
	);
}

/**
 * Whether one card of a pair should take the left seat.
 * @param node The card being seated.
 * @param other The card already in the row.
 * @param sorting What decides where cards sit.
 * @returns True when `node` belongs on the left.
 */
function leansLeft(node: SemanticNode, other: SemanticNode, sorting: Sorting): boolean {
	const side = (sorting.keys.side.get(node.id) ?? 0) - (sorting.keys.side.get(other.id) ?? 0);
	if (side !== 0) {
		return side < 0;
	}
	return docKey(node, sorting) < docKey(other, sorting);
}

/** A row while it is still being filled. */
interface OpenRow {
	/** The row of the shared grid. */
	readonly grid: number;
	/** The rank every card in it shares. */
	readonly rank: number;
	/** How deeply nested its cards are. */
	readonly depth: number;
	/** Its cards, left to right. */
	readonly nodes: SemanticNode[];
}

/** One column's seating while it is being built. */
interface Seated {
	/** Its rows so far. */
	readonly rows: OpenRow[];
	/** Its container boxes so far. */
	readonly containers: SeatedContainer[];
}

/**
 * The card of a block that seats first, which is the block's own place in the
 * order.
 * @param block The block.
 * @param sorting What decides where cards sit.
 * @returns The leading card, or undefined for a container holding none.
 */
function leadCard(block: Block, sorting: Sorting): SemanticNode | undefined {
	const cards = block.kind === "card" ? [block.node] : cardsIn(block.blocks);
	return cards.toSorted((a, b) => compareSeats(a, b, sorting))[0];
}

/**
 * The order some sibling blocks take their rows in.
 * @param blocks The blocks.
 * @param sorting What decides where cards sit.
 * @returns The blocks, in seating order.
 */
function orderBlocks(blocks: readonly Block[], sorting: Sorting): Block[] {
	return [...blocks].toSorted((a, b) => {
		const one = leadCard(a, sorting);
		const other = leadCard(b, sorting);
		return one === undefined || other === undefined ? 0 : compareSeats(one, other, sorting);
	});
}

/**
 * Seat one card, beside the row still open when the two belong together. Two
 * cards share a row only at the same rank and the same depth, so a pair always
 * reads as "these happen alongside each other, in the same place".
 * @param node The card.
 * @param depth How deeply nested it is.
 * @param cursor The next free row of this column.
 * @param open The row still being filled, when the last block was also a card.
 * @param sorting What decides where cards sit.
 * @param seated The column being built.
 * @returns The row the card ended up in.
 */
function seatCard(
	node: SemanticNode,
	depth: number,
	cursor: number,
	open: OpenRow | undefined,
	sorting: Sorting,
	seated: Seated,
): OpenRow {
	const rank = rankOf(node, sorting);
	if (open?.rank === rank && open.nodes.length === 1) {
		const first = open.nodes[0];
		if (first !== undefined && leansLeft(node, first, sorting)) {
			open.nodes.unshift(node);
		} else {
			open.nodes.push(node);
		}
		return open;
	}
	const row: OpenRow = {
		grid: Math.max(cursor, rowOfRank(rank, sorting)),
		rank,
		depth,
		nodes: [node],
	};
	seated.rows.push(row);
	return row;
}

/**
 * Seat one container: everything it holds, contiguously, and then the box's own
 * record of which rows it has to cover.
 * @param block The container block.
 * @param depth How deeply nested its box is.
 * @param cursor The next free row of this column.
 * @param sorting What decides where cards sit.
 * @param seated The column being built.
 * @returns The next free row after it.
 */
function seatContainer(
	block: Block & { kind: "container" },
	depth: number,
	cursor: number,
	sorting: Sorting,
	seated: Seated,
): number {
	const before = seated.rows.length;
	const next = seatBlocks(block.blocks, depth + 1, cursor, sorting, seated);
	const mine = seated.rows.slice(before).map((row) => row.grid);
	const firstRow = mine.length === 0 ? cursor : Math.min(...mine);
	const lastRow = mine.length === 0 ? cursor : Math.max(...mine);
	seated.containers.push({ node: block.node, depth, firstRow, lastRow });
	return Math.max(next, lastRow + 1);
}

/**
 * Seat some sibling blocks, in order, from one row down.
 * @param blocks The blocks.
 * @param depth How deeply nested they are.
 * @param start The first free row available to them.
 * @param sorting What decides where cards sit.
 * @param seated The column being built.
 * @returns The next free row after them.
 */
function seatBlocks(
	blocks: readonly Block[],
	depth: number,
	start: number,
	sorting: Sorting,
	seated: Seated,
): number {
	let cursor = start;
	let open: OpenRow | undefined;
	for (const block of orderBlocks(blocks, sorting)) {
		if (block.kind === "card") {
			open = seatCard(block.node, depth, cursor, open, sorting, seated);
			cursor = Math.max(cursor, open.grid + 1);
		} else {
			cursor = seatContainer(block, depth, cursor, sorting, seated);
			open = undefined;
		}
	}
	return cursor;
}

/**
 * Which column each card belongs to.
 * @param regions The columns, in the order they are drawn.
 * @returns Each card's column index.
 */
function regionIndexOf(regions: readonly Region[]): Map<string, number> {
	const regionOf = new Map<string, number>();
	regions.forEach((region, index) => {
		for (const card of cardsIn(region.blocks)) {
			regionOf.set(card.id, index);
		}
	});
	return regionOf;
}

/**
 * Where everything sits: a row grid shared across all columns.
 *
 * Ranks are compressed globally rather than per column, so a card and the card
 * it converses with across a column boundary land on comparable rows — that is
 * what lets their connection run straight. Stability is the invariant this
 * trades nothing of: seating reads connections, containment and document order,
 * never a label, so a rename moves nothing.
 * @param regions The columns, in the order they are drawn.
 * @param nodes Every node on the board, in document order.
 * @param edges The relationships between them.
 * @returns Each column's rows and boxes, and the grid's height in rows.
 */
function seatNodes(
	regions: readonly Region[],
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
): Seating {
	const cards = regions.flatMap((region) => cardsIn(region.blocks));
	const ranks = rankNodes(cards, edges);
	const sorting: Sorting = {
		ranks,
		rowOfRank: compressRanks(cards, ranks),
		keys: barycenters(cards, edges, ranks, regionIndexOf(regions)),
		docIndex: new Map(nodes.map((node, index) => [node.id, index])),
	};

	const byRegion = new Map<number, SeatedRegion>();
	let lastRow = -1;
	regions.forEach((region, index) => {
		const seated: Seated = { rows: [], containers: [] };
		seatBlocks(region.blocks, 0, 0, sorting, seated);
		if (seated.rows.length === 0) {
			return;
		}
		const rows = seated.rows.map(({ grid, depth, nodes: seats }) => ({
			grid,
			depth,
			nodes: seats,
		}));
		byRegion.set(index, { rows, containers: seated.containers });
		lastRow = Math.max(lastRow, ...rows.map((row) => row.grid));
	});

	return { byRegion, rowCount: lastRow + 1 };
}

export { type SeatedContainer, type SeatedRegion, type SeatedRow, type Seating, seatNodes };
