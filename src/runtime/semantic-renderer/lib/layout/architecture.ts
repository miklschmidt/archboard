// Where every column, container box and card goes.
//
// Forked from PR Lens's `layout/architecture.ts`. Lanes became columns derived
// from containment (`lib/regions.ts`), the badge strip went with the rest of
// the pull-request model, and TASK-172 turned a container from a caption over a
// full-height strip into a real box around the rows it holds
// (`lib/layout/containers.ts`).
//
// The skeleton the router stands on is unchanged and is the reason the rest is
// shaped as it is: the diagram is a row of fixed-width columns over a row grid
// shared by all of them, so rank N is the same height in every column and a
// connection across two columns runs straight. Routes travel in the gaps — the
// corridor beside each column, the strip above each row — and those gaps are
// addressed by index, never by geometry.

import type { SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import {
	BAND_BOTTOM_PADDING,
	BAND_GAP,
	BAND_PADDING_X,
	CARD_GAP_X,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
	CARD_PADDING_X,
	DIAGRAM_MARGIN,
	ICON_CHIP_GAP,
	ICON_CHIP_SIZE,
	ICON_MIN_CARD_WIDTH,
	ROW_GAP,
	TITLE_SIZE,
	TITLE_SIZE_MIN,
	TITLE_SIZE_SMALL,
	TITLE_SIZE_STEP,
} from "@/runtime/semantic-renderer/lib/design";
import type { Box, Side } from "@/runtime/semantic-renderer/lib/geometry";
import { fittedSize } from "@/runtime/semantic-renderer/lib/text";
import { CARD_TITLE_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import {
	columnWidth,
	containerSeats,
	contentLeft,
	contentWidth,
	headerHeightFor,
	placeContainers,
	reservesFor,
	type PlacedContainer,
	type Reserves,
	type Span,
} from "@/runtime/semantic-renderer/lib/layout/containers";
import {
	seatNodes,
	type SeatedRow,
	type Seating,
} from "@/runtime/semantic-renderer/lib/layout/seating";
import type { Region } from "@/runtime/semantic-renderer/lib/regions";

/**
 * What a placed node is drawn as. A `card` is a box with a name in it; a
 * `container` is a box around other things, which the router may attach to but
 * the card painter must skip.
 */
type Chrome = "card" | "container";

/** One node, placed. */
interface PlacedNode {
	/** The node itself. */
	readonly node: SemanticNode;
	/** Where it is, and how big. */
	readonly box: Box;
	/** What it is drawn as. */
	readonly chrome: Chrome;
	/** The size its title is actually set at, after fitting it to the box. */
	readonly titleSize: number;
	/** Its row of the shared grid; a container's is the first row it covers. */
	readonly row: number;
	/** Which column it is in. */
	readonly regionIndex: number;
	/**
	 * A container's title band sits directly above this node, so its top face
	 * cannot be reached from above without a line through the words on that
	 * band. Routes go round instead. Absent means nothing is over it.
	 */
	readonly capped?: boolean | undefined;
	/**
	 * The stretch of a face a route may attach to, where it is narrower than the
	 * face itself. A container's box covers every row it holds, so only the zone
	 * above its first row — its own title's, and nothing else's — is somewhere a
	 * horizontal run can leave from without passing behind the cards inside it.
	 */
	readonly attach?: Partial<Record<Side, Span>> | undefined;
}

/** One column, placed. */
interface PlacedRegion {
	/** What the column holds. */
	readonly region: Region;
	/** The whole column, as far as it is occupied. */
	readonly box: Box;
}

/** One row of the shared grid. */
interface GridRow {
	/** Its top edge. */
	readonly top: number;
	/** How tall it is. */
	readonly height: number;
	/** How much of the gap above it the container title blocks take. */
	readonly reserveAbove: number;
	/** How much of the gap below it the container box floors take. */
	readonly reserveBelow: number;
}

/**
 * The gaps of the grid, for the router: the vertical corridors beside each
 * column's cards and the horizontal extents of every row. Corridor `i` runs to
 * the left of column `i`; there is one more corridor after the last column.
 */
interface LayoutGrid {
	/** Each row, and what its gaps already owe to container chrome. */
	readonly rows: readonly GridRow[];
	/** Each corridor's left and right edges. */
	readonly corridors: readonly { readonly left: number; readonly right: number }[];
	/** The top of the diagram: the ceiling of the gap above row 0. */
	readonly diagramTop: number;
	/** Where column content ends: the floor under the last row. */
	readonly bandBottom: number;
}

/**
 * Extra room granted to individual gaps, keyed by corridor or band index — how
 * the layout widens where traffic would otherwise compress track pitch through
 * the floor. Expanding a corridor moves every column after it sideways by the
 * same amount; expanding a band moves every row after it down. Cards travel
 * with their column and row — nothing re-seats, nothing reorders.
 */
interface GapExpansions {
	/** Extra width for a corridor, by index. */
	readonly corridors: ReadonlyMap<number, number>;
	/** Extra height for a band, by index. */
	readonly bands: ReadonlyMap<number, number>;
}

/** Everything one architecture's geometry says, before anything is drawn. */
interface ArchitectureLayout {
	/** The width the columns asked for. */
	readonly width: number;
	/** The height the columns asked for. */
	readonly height: number;
	/** The columns. */
	readonly regions: readonly PlacedRegion[];
	/** Every container box, outermost first within each column. */
	readonly containers: readonly PlacedContainer[];
	/** Every routable node: the cards, and every container box. */
	readonly nodes: readonly PlacedNode[];
	/** The gaps between them. */
	readonly grid: LayoutGrid;
}

const NO_EXPANSIONS: GapExpansions = { corridors: new Map(), bands: new Map() };

/**
 * The horizontal run a card's text gets, once the padding either side and the
 * kind chip have taken their share. The layout fits the title into this and the
 * painter cuts against the same number, so it is owned in one place.
 * @param cardWidth How wide the card is.
 * @returns The run its text has.
 */
function cardTextWidth(cardWidth: number): number {
	return cardWidth - CARD_PADDING_X * 2 - ICON_CHIP_SIZE - ICON_CHIP_GAP;
}

/**
 * How tall a card is: taller when it carries a responsibility under its name.
 * @param node The node.
 * @returns The card height.
 */
function cardHeight(node: SemanticNode): number {
	return node.responsibility === undefined ? CARD_HEIGHT : CARD_HEIGHT_WITH_NOTE;
}

/**
 * The room one horizontal gap of the grid has for routes: the space between two
 * rows, less whatever container chrome already stands in it. Carving the
 * reserves out here is what keeps a route off a container's title block without
 * the router having to know that containers exist.
 * @param grid The gaps of the layout.
 * @param index Which gap; `rows.length` is the sliver under the last row.
 * @returns Its top and bottom edges.
 */
function bandChannel(grid: LayoutGrid, index: number): { top: number; bottom: number } {
	const above = grid.rows[index - 1];
	const below = grid.rows[index];
	return {
		top: above === undefined ? grid.diagramTop : above.top + above.height + above.reserveBelow,
		bottom: below === undefined ? grid.bandBottom : below.top - below.reserveAbove,
	};
}

/**
 * A pair divides its row into equal halves. Splitting in proportion to what
 * each card's text asked for would mean a rename moves its neighbour — and a
 * rename moving anything is exactly what the seating guarantee rules out.
 * @param row The seated row.
 * @param deepest The deepest nesting any card on the board sits at.
 * @returns One width per card in the row.
 */
function rowWidths(row: SeatedRow, deepest: number): number[] {
	const room = contentWidth(row.depth, deepest);
	if (row.nodes.length < 2) {
		return [room];
	}
	const half = Math.round((room - CARD_GAP_X) / 2);
	return [half, room - CARD_GAP_X - half];
}

/**
 * One card, placed.
 * @param node The node.
 * @param box Where the card is.
 * @param row Its row of the shared grid.
 * @param regionIndex Which column it is in.
 * @param capped Whether a container's title band sits directly above it.
 * @returns The placed card.
 */
function placeCard(
	node: SemanticNode,
	box: Box,
	row: number,
	regionIndex: number,
	capped: boolean,
): PlacedNode {
	return {
		node,
		box,
		chrome: "card",
		titleSize: fittedSize(
			node.name,
			CARD_TITLE_FONT,
			box.width >= ICON_MIN_CARD_WIDTH ? TITLE_SIZE : TITLE_SIZE_SMALL,
			cardTextWidth(box.width),
			TITLE_SIZE_MIN,
			TITLE_SIZE_STEP,
		),
		row,
		regionIndex,
		capped,
	};
}

/**
 * How tall each row of the shared grid is: the tallest card anyone seated in it.
 * @param seating Where everything sits.
 * @returns Each occupied row's height.
 */
function rowHeights(seating: Seating): Map<number, number> {
	const heights = new Map<number, number>();
	for (const { rows } of seating.byRegion.values()) {
		for (const { grid, nodes } of rows) {
			const tallest = Math.max(...nodes.map(cardHeight));
			heights.set(grid, Math.max(heights.get(grid) ?? 0, tallest));
		}
	}
	return heights;
}

/**
 * Each row of the grid, walking down from the top of the diagram.
 *
 * Every row is preceded by one ROW_GAP — the gap the router treats as a band —
 * plus whatever the container title blocks opening at that row reserve, plus
 * whatever a crowded pass asked for. The reserves are carved out of the gap
 * rather than added to it, so a route's channel is the same ROW_GAP wherever it
 * runs and never crosses a title block.
 * @param rowCount How many rows the grid has.
 * @param heights How tall each row is.
 * @param reserves What the container boxes owe each gap.
 * @param expansions Extra room granted to individual gaps.
 * @returns Each row of the grid.
 */
function gridRows(
	rowCount: number,
	heights: ReadonlyMap<number, number>,
	reserves: Reserves,
	expansions: GapExpansions,
): GridRow[] {
	const rows: GridRow[] = [];
	let cursor = DIAGRAM_MARGIN;
	for (let grid = 0; grid < rowCount; grid += 1) {
		const reserveAbove = reserves.above.get(grid) ?? 0;
		const reserveBelow = reserves.below.get(grid) ?? 0;
		cursor += ROW_GAP + (expansions.bands.get(grid) ?? 0) + reserveAbove;
		const height = heights.get(grid) ?? 0;
		rows.push({ top: cursor, height, reserveAbove, reserveBelow });
		cursor += height + reserveBelow;
	}
	return rows;
}

/**
 * Where each column's left edge is, once the corridors before it have taken
 * whatever a crowded pass granted them.
 * @param count How many columns there are.
 * @param deepest The deepest nesting any card on the board sits at.
 * @param expansions Extra room granted to individual gaps.
 * @returns Each column's left edge.
 */
function bandLefts(count: number, deepest: number, expansions: GapExpansions): number[] {
	const lefts: number[] = [];
	let cursor = DIAGRAM_MARGIN;
	for (let index = 0; index < count; index += 1) {
		cursor += expansions.corridors.get(index) ?? 0;
		lefts.push(cursor);
		cursor += columnWidth(deepest) + BAND_GAP;
	}
	return lefts;
}

/**
 * The corridors: the vertical strip to the left of each column's cards, plus
 * one more past the last column.
 * @param lefts Each column's left edge.
 * @param deepest The deepest nesting any card on the board sits at.
 * @param expansions Extra room granted to individual gaps.
 * @returns Each corridor's left and right edges.
 */
function corridorsFor(
	lefts: readonly number[],
	deepest: number,
	expansions: GapExpansions,
): { left: number; right: number }[] {
	const gutter = BAND_PADDING_X * 2 + BAND_GAP;
	const corridors = lefts.map((left, index) => ({
		left: left + BAND_PADDING_X - gutter - (expansions.corridors.get(index) ?? 0),
		right: left + BAND_PADDING_X,
	}));
	const lastRight = (lefts[lefts.length - 1] ?? 0) + columnWidth(deepest) - BAND_PADDING_X;
	corridors.push({
		left: lastRight,
		right: lastRight + gutter + (expansions.corridors.get(lefts.length) ?? 0),
	});
	return corridors;
}

/**
 * One row of one column's cards, left to right.
 * @param row The seated row.
 * @param left The column's left edge.
 * @param rows The rows of the grid.
 * @param index Which column this is.
 * @param frame The deepest nesting, and which rows a title band opens at.
 * @param frame.deepest The deepest nesting any card on the board sits at.
 * @param frame.capped Which column-and-row pairs have a title band opening at them.
 * @returns The placed cards.
 */
function seatRow(
	row: SeatedRow,
	left: number,
	rows: readonly GridRow[],
	index: number,
	frame: { readonly deepest: number; readonly capped: ReadonlySet<string> },
): PlacedNode[] {
	const top = rows[row.grid]?.top ?? 0;
	const widths = rowWidths(row, frame.deepest);
	const under = frame.capped.has(`${index}:${row.grid}`);
	const placed: PlacedNode[] = [];
	let x = contentLeft(left, row.depth);
	row.nodes.forEach((node, seat) => {
		const width = widths[seat] ?? contentWidth(row.depth, frame.deepest);
		placed.push(
			placeCard(node, { x, y: top, width, height: cardHeight(node) }, row.grid, index, under),
		);
		x += width + CARD_GAP_X;
	});
	return placed;
}

/**
 * One column's own extent: its container's box when it has one, and otherwise
 * the run of rows its loose cards occupy.
 * @param region What the column holds.
 * @param left The column's left edge.
 * @param rows The rows of the grid.
 * @param seated The column's seating.
 * @param containers Every placed container box.
 * @param deepest The deepest nesting any card on the board sits at.
 * @returns The placed column.
 */
function placeRegion(
	region: Region,
	left: number,
	rows: readonly GridRow[],
	seated: { readonly rows: readonly SeatedRow[] } | undefined,
	containers: readonly PlacedContainer[],
	deepest: number,
): PlacedRegion {
	const own = containers.find((held) => held.depth === -1 && held.node === region.container);
	if (own !== undefined) {
		return { region, box: own.box };
	}
	const grids = (seated?.rows ?? []).map((row) => row.grid);
	const first = rows[Math.min(...grids)] ?? { top: 0, height: 0 };
	const last = rows[Math.max(...grids)] ?? first;
	return {
		region,
		box: {
			x: left,
			y: first.top,
			width: columnWidth(deepest),
			height: last.top + last.height - first.top,
		},
	};
}

/**
 * A container box, as something an edge can attach to.
 *
 * An agent may say that something calls a container, and a connection that
 * quietly disappeared because its endpoint happened to be drawn as a box would
 * be the renderer lying about the architecture. The whole box is the target,
 * not a strip of title: an arrowhead lands on the frame of the thing it names.
 *
 * Where on that frame is not free, though. The box covers every row it holds,
 * so a port in the middle of a vertical edge would send the route's horizontal
 * run straight through the cards inside — behind them, since lines are painted
 * under cards, which reads as a line that simply stops. The attachable stretch
 * is the zone above its first row: its own title's, and card-free by construction.
 * @param held The placed container.
 * @param capped Whether another container's title band sits above this one's.
 * @returns It, as a routable node.
 */
function containerNode(held: PlacedContainer, capped: boolean): PlacedNode {
	return {
		node: held.node,
		box: held.box,
		chrome: "container",
		titleSize: 0,
		row: held.row,
		regionIndex: held.regionIndex,
		capped,
		attach: { left: held.attach, right: held.attach },
	};
}

/**
 * The deepest nesting any card on the board sits at.
 * @param seating Where everything sits.
 * @returns The depth, and 0 when nothing is nested.
 */
function deepestNesting(seating: Seating): number {
	let deepest = 0;
	for (const { rows } of seating.byRegion.values()) {
		for (const row of rows) {
			deepest = Math.max(deepest, row.depth);
		}
	}
	return deepest;
}

/**
 * Which column-and-row pairs have a container's title band opening at them.
 *
 * A route may not cross a title band — a line through the words on a frame
 * costs the reader both — so everything seated at such a row is marked, and the
 * router reaches it from a flank instead of from above.
 * @param containers Every placed container box.
 * @returns The `column:row` keys a band opens at.
 */
function cappedRows(containers: readonly PlacedContainer[]): Set<string> {
	return new Set(containers.map((held) => `${held.regionIndex}:${held.row}`));
}

/**
 * Whether a container's own top is under another container's title band.
 * @param held The container.
 * @param containers Every placed container box.
 * @returns True when a shallower box opens at the same row of the same column.
 */
function underAnother(held: PlacedContainer, containers: readonly PlacedContainer[]): boolean {
	return containers.some(
		(other) =>
			other !== held &&
			other.regionIndex === held.regionIndex &&
			other.row === held.row &&
			other.depth < held.depth,
	);
}

/**
 * One architecture's geometry.
 * @param regions The columns, in the order they are drawn.
 * @param content The architecture, read for its document order and its edges.
 * @param expansions Extra room granted to individual gaps, when a pass has asked for it.
 * @returns Where everything goes.
 */
function layoutArchitecture(
	regions: readonly Region[],
	content: VariantContent,
	expansions: GapExpansions = NO_EXPANSIONS,
): ArchitectureLayout {
	const seating = seatNodes(regions, content.nodes, content.edges);
	const seats = containerSeats(regions, seating);
	const headerHeight = headerHeightFor(seats);
	const deepest = deepestNesting(seating);
	const rows = gridRows(
		seating.rowCount,
		rowHeights(seating),
		reservesFor(seats, headerHeight),
		expansions,
	);
	const lefts = bandLefts(regions.length, deepest, expansions);
	const containers = placeContainers(seats, { rows, bandX: lefts, headerHeight, deepest });
	const capped = cappedRows(containers);

	const placedNodes: PlacedNode[] = containers.map((held) =>
		containerNode(held, underAnother(held, containers)),
	);
	const placedRegions = regions.map((region, index) => {
		const seated = seating.byRegion.get(index);
		for (const row of seated?.rows ?? []) {
			placedNodes.push(...seatRow(row, lefts[index] ?? 0, rows, index, { deepest, capped }));
		}
		return placeRegion(region, lefts[index] ?? 0, rows, seated, containers, deepest);
	});

	const last = rows[rows.length - 1];
	const bandBottom =
		(last === undefined ? 0 : last.top + last.height + last.reserveBelow) +
		BAND_BOTTOM_PADDING +
		(expansions.bands.get(rows.length) ?? 0);

	return {
		// Whole numbers: the canvas is reported to the pane as pixels, and half a
		// pixel of diagram is not a thing a person can be shown.
		width: Math.ceil((lefts[lefts.length - 1] ?? 0) + columnWidth(deepest) + DIAGRAM_MARGIN),
		height: Math.ceil(bandBottom + DIAGRAM_MARGIN),
		regions: placedRegions,
		containers,
		nodes: placedNodes,
		grid: {
			rows,
			corridors: corridorsFor(lefts, deepest, expansions),
			diagramTop: DIAGRAM_MARGIN,
			bandBottom,
		},
	};
}

export {
	type ArchitectureLayout,
	type Chrome,
	type GapExpansions,
	type GridRow,
	type LayoutGrid,
	type PlacedContainer,
	type PlacedNode,
	type PlacedRegion,
	NO_EXPANSIONS,
	bandChannel,
	cardHeight,
	cardTextWidth,
	layoutArchitecture,
};
