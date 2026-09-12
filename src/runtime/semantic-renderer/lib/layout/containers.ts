// Where every container box goes, at any depth.
//
// New with TASK-172. PR Lens had nothing like it: a lane there was a strip down
// the page with a caption, and the caption was the only thing a group ever was.
// A semantic board states containment, so a container is drawn as a box around
// the rows its contents occupy, and a container inside a container is a smaller
// box inside the larger one.
//
// Two consequences are worth saying out loud, because both are deliberate and
// both are visible.
//
// A box hugs its own rows. A column whose first card sits at rank three starts
// at rank three; it does not open a full-height frame at the top of the page
// with three empty rows in it. That is what the uniform full-height band used
// to do, and over half of such a band could be blank.
//
// A box's title block lives in the row gap immediately above its first row, and
// the gap is widened to hold it. A container nested inside another therefore
// puts its title under its parent's, outermost first, and the row grid pays for
// exactly as many title blocks as the deepest stack in any column needs.

import type { SemanticNode } from "@/shared/semantic-board/index";
import {
	BAND_CONTENT_WIDTH,
	CONTAINER_BOTTOM_PAD,
	CONTAINER_TOP_PAD,
	HEADER_GAP,
	HEADER_HEIGHT,
	HEADER_HEIGHT_WITH_NOTE,
	HEADER_NAME_SIZE,
	HEADER_NAME_TRACKING,
	HEADER_NOTE_SIZE,
	NEST_INSET,
} from "@/runtime/semantic-renderer/lib/design";
import { HEADER_NAME_FONT, HEADER_NOTE_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { measure, trackedWidth } from "@/runtime/semantic-renderer/lib/text";
import type { Box } from "@/runtime/semantic-renderer/lib/geometry";
import type { Region } from "@/runtime/semantic-renderer/lib/regions";
import type { Seating } from "@/runtime/semantic-renderer/lib/layout/seating";

/** One container, and which rows of which column its box has to cover. */
interface ContainerSeat {
	/** The container. */
	readonly node: SemanticNode;
	/** -1 for the column's own container, 0 and up for one nested inside it. */
	readonly depth: number;
	/** The first row of the shared grid its contents occupy. */
	readonly firstRow: number;
	/** The last row of the shared grid its contents occupy. */
	readonly lastRow: number;
	/** Which column it is in. */
	readonly regionIndex: number;
}

/** A stretch of one axis. */
interface Span {
	/** Where it starts. */
	readonly from: number;
	/** Where it ends. */
	readonly to: number;
}

/** One container, placed. */
interface PlacedContainer {
	/** The container. */
	readonly node: SemanticNode;
	/** Its whole box. */
	readonly box: Box;
	/** Its title block, inside the box at the top. */
	readonly header: Box;
	/**
	 * The stretch of its left and right edges a route may attach to: the zone
	 * above its first row, which is its own title's and nothing else's.
	 *
	 * A container's box covers every row of its contents, so a port placed
	 * anywhere else on a vertical edge would send the route's horizontal run
	 * across the cards inside it — behind them, since the lines are painted under
	 * the cards, which is worse than across. The zone above the first row is the
	 * one part of the box that is guaranteed clear.
	 */
	readonly attach: Span;
	/** Which column it is in. */
	readonly regionIndex: number;
	/** -1 for the column's own container, 0 and up for one nested inside it. */
	readonly depth: number;
	/** The first row it covers, which is the row an arrow approaches it at. */
	readonly row: number;
}

/** Extra vertical room a row's gaps owe to the container boxes that meet there. */
interface Reserves {
	/** How much of the gap above each row its title blocks take. */
	readonly above: ReadonlyMap<number, number>;
	/** How much of the gap below each row the boxes closing there take. */
	readonly below: ReadonlyMap<number, number>;
}

/** The rows and column positions a container box is measured against. */
interface Frame {
	/** Each row's top edge and height. */
	readonly rows: readonly { readonly top: number; readonly height: number }[];
	/** Each column's left edge, by column index. */
	readonly bandX: readonly number[];
	/** How tall one title block is. */
	readonly headerHeight: number;
	/** The deepest nesting any card on the board sits at. */
	readonly deepest: number;
}

/**
 * The left edge of the content at one nesting depth.
 * @param bandX The column's left edge.
 * @param depth The nesting depth; -1 is the column container's own box.
 * @returns The left edge.
 */
function contentLeft(bandX: number, depth: number): number {
	return bandX + (depth + 1) * NEST_INSET;
}

/**
 * How wide a whole column is.
 *
 * Nesting grows the column rather than shrinking the cards. Every level sets
 * its contents in by the same step, so a column that holds nothing but a chain
 * of containers would, if the outer width were fixed, reach a negative card
 * width — a box drawn inside out and an atlas entry no click can be inside. So
 * the deepest nesting on the board decides the width, and a card at the bottom
 * of any chain is as wide as a card that is in nothing at all.
 *
 * Every column is still the same width as every other, which is the property
 * that keeps a change in one column from sliding the ones after it sideways.
 * Depth is architecture rather than spelling: a board that gains a level is a
 * board that says something new, and a bigger picture is the honest answer to
 * it (ADR 0023 — large renderings are acceptable, and the viewer navigates).
 * @param deepest The deepest nesting any card on the board sits at.
 * @returns The column's width, both margins included.
 */
function columnWidth(deepest: number): number {
	return BAND_CONTENT_WIDTH + 2 * (deepest + 1) * NEST_INSET;
}

/**
 * How wide the content at one nesting depth is.
 * @param depth The nesting depth; -1 is the column container's own box.
 * @param deepest The deepest nesting any card on the board sits at.
 * @returns The width, which is never less than one card's.
 */
function contentWidth(depth: number, deepest: number): number {
	return columnWidth(deepest) - 2 * (depth + 1) * NEST_INSET;
}

/**
 * Every container of one architecture, with the rows it has to cover.
 *
 * A column's own container is one of these too, at depth -1: it is the same
 * sort of box as the ones inside it, drawn one step further out, and treating
 * it as a special case is how the middle level of a three-level architecture
 * went missing in the first place.
 * @param regions The columns, in the order they are drawn.
 * @param seating Where everything sits.
 * @returns Every container box's seat.
 */
function containerSeats(regions: readonly Region[], seating: Seating): ContainerSeat[] {
	return regions.flatMap((region, regionIndex) => {
		const seated = seating.byRegion.get(regionIndex);
		if (seated === undefined) {
			return [];
		}
		const grids = seated.rows.map((row) => row.grid);
		const nested = seated.containers.map((held) => ({ ...held, regionIndex }));
		if (region.container === undefined) {
			return nested;
		}
		return [
			{
				node: region.container,
				depth: -1,
				firstRow: Math.min(...grids),
				lastRow: Math.max(...grids),
				regionIndex,
			},
			...nested,
		];
	});
}

/**
 * How tall every title block is.
 *
 * One height for the whole diagram rather than one per container: title blocks
 * stack in a row gap and sit beside each other across columns, and blocks of
 * different heights read as a mistake rather than as a distinction. One
 * container with a responsibility anywhere buys the second line for all of them.
 * @param seats Every container box's seat.
 * @returns The title block height, and 0 when there are no containers.
 */
function headerHeightFor(seats: readonly ContainerSeat[]): number {
	if (seats.length === 0) {
		return 0;
	}
	return seats.some((seat) => seat.node.responsibility !== undefined)
		? HEADER_HEIGHT_WITH_NOTE
		: HEADER_HEIGHT;
}

/**
 * The seats that meet at one row, deepest-first or shallowest-first.
 * @param seats Every container box's seat.
 * @param rowOf Which row of the seat to group by.
 * @param outermostFirst True to order each group by depth ascending.
 * @returns The seats sharing each column-and-row, in order.
 */
function meetingAt(
	seats: readonly ContainerSeat[],
	rowOf: (seat: ContainerSeat) => number,
	outermostFirst: boolean,
): Map<string, ContainerSeat[]> {
	const met = new Map<string, ContainerSeat[]>();
	for (const seat of seats) {
		const key = `${seat.regionIndex}:${rowOf(seat)}`;
		met.set(key, [...(met.get(key) ?? []), seat]);
	}
	for (const group of met.values()) {
		group.sort((a, b) => (outermostFirst ? a.depth - b.depth : b.depth - a.depth));
	}
	return met;
}

/**
 * The row a container's contents start at.
 * @param seat The container's seat.
 * @returns Its first row.
 */
function opensAt(seat: ContainerSeat): number {
	return seat.firstRow;
}

/**
 * The row a container's contents end at.
 * @param seat The container's seat.
 * @returns Its last row.
 */
function closesAt(seat: ContainerSeat): number {
	return seat.lastRow;
}

/**
 * How much room the deepest stack of boxes meeting at each row needs.
 * @param met The seats sharing each column-and-row.
 * @param rowOf Which row of the seat the stack is at.
 * @param per What one box in the stack takes.
 * @param extra What the stack as a whole takes on top of that.
 * @returns The room needed, by row.
 */
function deepestStack(
	met: ReadonlyMap<string, ContainerSeat[]>,
	rowOf: (seat: ContainerSeat) => number,
	per: number,
	extra: number,
): Map<number, number> {
	const reserved = new Map<number, number>();
	for (const group of met.values()) {
		const first = group[0];
		if (first !== undefined) {
			const row = rowOf(first);
			reserved.set(row, Math.max(reserved.get(row) ?? 0, group.length * per + extra));
		}
	}
	return reserved;
}

/**
 * The most title blocks, and the most box floors, any one column stacks at each
 * row — which is what the gaps above and below that row have to pay for.
 * @param seats Every container box's seat.
 * @param headerHeight How tall one title block is.
 * @returns The reserved heights, by row.
 */
function reservesFor(seats: readonly ContainerSeat[], headerHeight: number): Reserves {
	return {
		above: deepestStack(
			meetingAt(seats, opensAt, true),
			opensAt,
			headerHeight + HEADER_GAP,
			CONTAINER_TOP_PAD,
		),
		below: deepestStack(meetingAt(seats, closesAt, false), closesAt, CONTAINER_BOTTOM_PAD, 0),
	};
}

/**
 * Where one seat sits in the stack of boxes it shares an edge with.
 * @param met The seats sharing each column-and-row.
 * @param seat The seat.
 * @param row Which of its rows the stack is at.
 * @returns Its place in the stack, and how many are in it.
 */
function stackPlace(
	met: ReadonlyMap<string, ContainerSeat[]>,
	seat: ContainerSeat,
	row: number,
): { place: number; of: number } {
	const group = met.get(`${seat.regionIndex}:${row}`) ?? [seat];
	return { place: Math.max(0, group.indexOf(seat)), of: group.length };
}

/**
 * One container's box and title block.
 * @param seat The container's seat.
 * @param frame The rows and columns to measure against.
 * @param opening The seats sharing each column-and-first-row, outermost first.
 * @param closing The seats sharing each column-and-last-row, innermost first.
 * @returns The placed container.
 */
function placeOne(
	seat: ContainerSeat,
	frame: Frame,
	opening: ReadonlyMap<string, ContainerSeat[]>,
	closing: ReadonlyMap<string, ContainerSeat[]>,
): PlacedContainer {
	const first = frame.rows[seat.firstRow] ?? { top: 0, height: 0 };
	const last = frame.rows[seat.lastRow] ?? first;
	const above = stackPlace(opening, seat, seat.firstRow);
	const under = stackPlace(closing, seat, seat.lastRow);
	const headerY = first.top - (above.of - above.place) * (frame.headerHeight + HEADER_GAP);
	const top = headerY - CONTAINER_TOP_PAD;
	const bottom = last.top + last.height + (under.place + 1) * CONTAINER_BOTTOM_PAD;
	const left = contentLeft(frame.bandX[seat.regionIndex] ?? 0, seat.depth);
	const width = contentWidth(seat.depth, frame.deepest);
	return {
		node: seat.node,
		box: { x: left, y: top, width, height: bottom - top },
		header: {
			x: left + NEST_INSET,
			y: headerY,
			width: width - NEST_INSET * 2,
			height: frame.headerHeight,
		},
		attach: { from: top, to: first.top },
		regionIndex: seat.regionIndex,
		depth: seat.depth,
		row: seat.firstRow,
	};
}

/**
 * Every container box of one architecture, placed.
 * @param seats Every container box's seat.
 * @param frame The rows and columns to measure against.
 * @returns The placed containers, in the order their seats were collected.
 */
function placeContainers(seats: readonly ContainerSeat[], frame: Frame): PlacedContainer[] {
	const opening = meetingAt(seats, opensAt, true);
	const closing = meetingAt(seats, closesAt, false);
	return seats.map((seat) => placeOne(seat, frame, opening, closing));
}

/**
 * The ink a container's title actually puts on the page.
 *
 * The title block spans the whole content width, but its words rarely do, and
 * the difference matters twice: it is the only clear air a label pill riding a
 * route into that container has, and it is where a route dropping into the
 * container's first row can cross without striking the words out. So both
 * passes are given what was written rather than what was reserved.
 * @param placed The container.
 * @returns The box its text occupies.
 */
function headerTextBox(placed: PlacedContainer): Box {
	const { header, node } = placed;
	const name = trackedWidth(
		node.name.toUpperCase(),
		HEADER_NAME_FONT,
		HEADER_NAME_SIZE,
		HEADER_NAME_TRACKING,
	);
	const note =
		node.responsibility === undefined
			? 0
			: measure(node.responsibility, HEADER_NOTE_FONT, HEADER_NOTE_SIZE);
	return {
		x: header.x,
		y: header.y,
		width: Math.min(Math.max(name, note), header.width),
		height: header.height,
	};
}

export {
	type ContainerSeat,
	type Frame,
	type PlacedContainer,
	type Reserves,
	type Span,
	columnWidth,
	containerSeats,
	contentLeft,
	contentWidth,
	headerHeightFor,
	headerTextBox,
	placeContainers,
	reservesFor,
};
