// The shape of every route's journey: which face it leaves by, which gaps it
// travels through, and which face it arrives at. Decided from band and row
// indices alone, so that everything downstream — trunks, ports, tracks — has
// firm ground to stand on.
//
// Forked from PR Lens's `layout/edges.ts`. The exile plan, which sent a retired
// connection out past the last lane and back, went with the pull-request model.
// Band 0 gained a meaning: PR Lens had no band above the first row because that
// space was the lane header, and here the header is a place an edge can attach
// to, so the gap between it and the first row is an ordinary band.

import type { SemanticEdge } from "@/shared/semantic-board/index";
import { boxCentre, type Side } from "@/runtime/semantic-renderer/lib/geometry";
import type {
	LayoutGrid,
	PlacedNode,
	PlacedRegion,
} from "@/runtime/semantic-renderer/lib/layout/architecture";

/**
 * The gaps a route travels through, in order. A corridor is the vertical strip
 * beside a band's cards; a band is the horizontal strip between two rows. Band
 * `i` sits above row `i`, so band 0 is the gap under the region headers, and
 * the band after the last row is the sliver of band bottom padding — a last
 * resort only.
 */
type Channel =
	| { readonly kind: "corridor"; readonly index: number }
	| { readonly kind: "band"; readonly index: number };

/** A face a route can leave by or arrive at sideways. */
type Flank = "left" | "right";

/** One route, fully planned. */
interface Route {
	/** What it depicts. */
	readonly edge: SemanticEdge;
	/** Its position in document order, the stable tiebreak everywhere downstream. */
	readonly order: number;
	/** Where it starts. */
	readonly from: PlacedNode;
	/** Where it ends. */
	readonly to: PlacedNode;
	/** The face it leaves by. */
	readonly fromSide: Side;
	/** The face it arrives at. */
	readonly toSide: Side;
	/** The gaps it travels through, in order. */
	readonly channels: readonly Channel[];
	/** Key of the shared-port group it departs through, if any. */
	readonly trunk: string | undefined;
}

/** Just the journey: what a planner decides and a route carries. */
type Journey = Pick<Route, "fromSide" | "toSide" | "channels">;

/** Which side faces a pair partner sits against. */
interface Blocked {
	/** True when something shares this card's row to its left. */
	left: boolean;
	/** True when something shares this card's row to its right. */
	right: boolean;
}

const RIGHT_FIRST: readonly Flank[] = ["right", "left"];
const LEFT_FIRST: readonly Flank[] = ["left", "right"];

/**
 * Whether two placed nodes share one row of one band.
 *
 * Cards only. A container box covers a run of rows and the whole width of its
 * level, so it shares a row with everything inside it without any of them being
 * beside it; counting that as a blocked face would send every route out of a
 * container's far side for no reason.
 * @param a One node.
 * @param b The other.
 * @returns True when they sit side by side.
 */
function sharesRow(a: PlacedNode, b: PlacedNode): boolean {
	return (
		a !== b &&
		a.chrome === "card" &&
		b.chrome === "card" &&
		a.regionIndex === b.regionIndex &&
		a.row === b.row
	);
}

/**
 * Record that one face of a card has a neighbour against it.
 * @param entry The card's record.
 * @param onTheRight Which face the neighbour is on.
 */
function mark(entry: Blocked, onTheRight: boolean): void {
	if (onTheRight) {
		entry.right = true;
	} else {
		entry.left = true;
	}
}

/**
 * Which faces of each card are blocked by the card it shares a row with.
 * @param placed Every routable node.
 * @returns Each node's blocked faces, by id.
 */
function blockedFaces(placed: readonly PlacedNode[]): Map<string, Blocked> {
	const blocked = new Map<string, Blocked>(
		placed.map(({ node }) => [node.id, { left: false, right: false }]),
	);
	for (const node of placed) {
		const entry = blocked.get(node.node.id);
		for (const other of placed) {
			if (entry !== undefined && sharesRow(node, other)) {
				mark(entry, other.box.x > node.box.x);
			}
		}
	}
	return blocked;
}

/**
 * A band index that exists.
 * @param index The band asked for.
 * @param grid The gaps of the layout.
 * @returns The nearest band that is really there.
 */
function clampBand(index: number, grid: LayoutGrid): number {
	return Math.min(Math.max(index, 0), grid.rows.length);
}

/**
 * The band a route leaves into on its way up or down.
 * @param row The row it leaves from.
 * @param headingDown Whether it is heading down the page.
 * @param grid The gaps of the layout.
 * @returns The band index.
 */
function bandToward(row: number, headingDown: boolean, grid: LayoutGrid): number {
	return clampBand(headingDown ? row + 1 : row, grid);
}

/**
 * The band a route arrives from.
 * @param row The row it arrives at.
 * @param fromAbove Whether it is coming down onto that row.
 * @param grid The gaps of the layout.
 * @returns The band index.
 */
function bandApproaching(row: number, fromAbove: boolean, grid: LayoutGrid): number {
	return clampBand(fromAbove ? row : row + 1, grid);
}

/**
 * Whether a card's face is clear of a row partner.
 * @param placed The card.
 * @param side Which face.
 * @param blocked Every card's blocked faces.
 * @returns True when the face is free.
 */
function faceFree(placed: PlacedNode, side: Flank, blocked: ReadonlyMap<string, Blocked>): boolean {
	return !(blocked.get(placed.node.id)?.[side] ?? false);
}

/**
 * The corridor on one side of a band.
 * @param regionIndex Which band.
 * @param side Which of its two flanks.
 * @returns The channel.
 */
function corridorBeside(regionIndex: number, side: Flank): Channel {
	return { kind: "corridor", index: regionIndex + (side === "right" ? 1 : 0) };
}

/**
 * Which flank both ends of a same-band route lean toward.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param regions The bands.
 * @returns The two flanks, preferred one first.
 */
function preferredFlanks(
	from: PlacedNode,
	to: PlacedNode,
	regions: readonly PlacedRegion[],
): readonly Flank[] {
	const bandBox = regions[from.regionIndex]?.box;
	const bandCentre = bandBox === undefined ? 0 : boxCentre(bandBox).x;
	return (boxCentre(from.box).x + boxCentre(to.box).x) / 2 > bandCentre ? RIGHT_FIRST : LEFT_FIRST;
}

/**
 * The first flank that is clear on both cards, when there is one.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param flanks The flanks to try, in order.
 * @param blocked Every card's blocked faces.
 * @returns The shared flank, or undefined.
 */
function sharedFlank(
	from: PlacedNode,
	to: PlacedNode,
	flanks: readonly Flank[],
	blocked: ReadonlyMap<string, Blocked>,
): Flank | undefined {
	return flanks.find((side) => faceFree(from, side, blocked) && faceFree(to, side, blocked));
}

/**
 * Down (or up) the corridor beside the route's own band, past the rows in
 * between: cards fill their band's width, so a straight drop would vanish
 * behind every one of them. The corridor is picked on the side the endpoints
 * lean toward; a face a pair partner blocks pushes the route to the other side,
 * and a target reachable on neither side is entered from above or below instead.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param regions The bands.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The journey.
 */
function planRegionSkip(
	from: PlacedNode,
	to: PlacedNode,
	regions: readonly PlacedRegion[],
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Journey {
	const flanks = preferredFlanks(from, to, regions);
	const shared = sharedFlank(from, to, flanks, blocked);
	if (shared !== undefined) {
		return {
			fromSide: shared,
			toSide: shared,
			channels: [corridorBeside(from.regionIndex, shared)],
		};
	}

	// No side serves both cards; leave on the free side and come in over the
	// target's top or bottom instead.
	const exit = flanks.find((side) => faceFree(from, side, blocked));
	if (exit !== undefined) {
		const fromAbove = to.row > from.row && to.capped !== true;
		return {
			fromSide: exit,
			toSide: fromAbove ? "top" : "bottom",
			channels: [
				corridorBeside(from.regionIndex, exit),
				{ kind: "band", index: bandApproaching(to.row, fromAbove, grid) },
			],
		};
	}

	// A pair member always has its outward face free, so both sides blocked
	// cannot happen; the compiler still wants an answer.
	return {
		fromSide: "bottom",
		toSide: "top",
		channels: [{ kind: "band", index: bandToward(from.row, to.row > from.row, grid) }],
	};
}

/** One end of a cross-band route: the face it uses and what that costs. */
interface Leg {
	/** The face. */
	readonly side: Side;
	/** The gaps the detour around a blocked face adds. */
	readonly channels: readonly Channel[];
}

/**
 * How a route leaves its card when the flank it wants may be blocked.
 * @param from Where the route starts.
 * @param flank The flank it is heading for.
 * @param dRow How far down the page the target is.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The departure leg.
 */
function departureLeg(
	from: PlacedNode,
	flank: Flank,
	dRow: number,
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Leg {
	if (faceFree(from, flank, blocked)) {
		return { side: flank, channels: [] };
	}
	// Upward out of the top face only when no title band is standing on it.
	const upward = dRow < 0 && from.capped !== true;
	return {
		side: upward ? "top" : "bottom",
		channels: [{ kind: "band", index: bandToward(from.row, !upward, grid) }],
	};
}

/**
 * How a route reaches its card when the flank it wants may be blocked.
 * @param to Where the route ends.
 * @param flank The flank it is arriving on.
 * @param dRow How far down the page the target is.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The arrival leg.
 */
function arrivalLeg(
	to: PlacedNode,
	flank: Flank,
	dRow: number,
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Leg {
	if (faceFree(to, flank, blocked)) {
		return { side: flank, channels: [] };
	}
	// Down onto the top face only when no title band is standing on it.
	const fromAbove = (dRow > 0 || (dRow === 0 && to.row >= 1)) && to.capped !== true;
	return {
		side: fromAbove ? "top" : "bottom",
		channels: [{ kind: "band", index: bandApproaching(to.row, fromAbove, grid) }],
	};
}

/**
 * The corridors between two bands: one when they are neighbours, and a hop
 * through a band in between when they are not.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param rightward Whether the target band is to the right.
 * @param dRow How far down the page the target is.
 * @param grid The gaps of the layout.
 * @returns The channels of the crossing.
 */
function crossingChannels(
	from: PlacedNode,
	to: PlacedNode,
	rightward: boolean,
	dRow: number,
	grid: LayoutGrid,
): Channel[] {
	const first = corridorBeside(from.regionIndex, rightward ? "right" : "left");
	if (Math.abs(to.regionIndex - from.regionIndex) < 2) {
		return [first];
	}
	return [
		first,
		{ kind: "band", index: bandApproaching(to.row, dRow > 0, grid) },
		corridorBeside(to.regionIndex, rightward ? "left" : "right"),
	];
}

/**
 * Out of the band sideways, along a corridor, and into the target band.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The journey.
 */
function planCrossRegion(
	from: PlacedNode,
	to: PlacedNode,
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Journey {
	const rightward = to.regionIndex > from.regionIndex;
	const dRow = to.row - from.row;
	const departure = departureLeg(from, rightward ? "right" : "left", dRow, grid, blocked);
	const arrival = arrivalLeg(to, rightward ? "left" : "right", dRow, grid, blocked);
	return {
		fromSide: departure.side,
		toSide: arrival.side,
		channels: [
			...departure.channels,
			...crossingChannels(from, to, rightward, dRow, grid),
			...arrival.channels,
		],
	};
}

/**
 * Whether two placed nodes overlap horizontally.
 *
 * Sharing a row does not make two things neighbours any more. A container's box
 * covers the rows it holds, so a container, a container inside it and a card
 * inside that all sit on the same row while standing one inside the other, and
 * a straight left-to-right run between any two of them would be drawn through
 * everything between. Overlapping x is the test for that: two things really
 * side by side do not.
 * @param a One node.
 * @param b The other.
 * @returns True when one's horizontal extent reaches into the other's.
 */
function overlapsAcross(a: PlacedNode, b: PlacedNode): boolean {
	return a.box.x < b.box.x + b.box.width && b.box.x < a.box.x + a.box.width;
}

/**
 * Whether the straight drop between two rows would cross a container's title
 * band. A line through the words on a frame costs the reader the words and the
 * line, so such a route goes round through a corridor instead.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @returns True when a vertical face at one end is under a title band.
 */
function cappedVertically(from: PlacedNode, to: PlacedNode): boolean {
	return (to.row > from.row ? to.capped : from.capped) === true;
}

/**
 * Two cards sharing a row reach each other across the gap between them.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @returns The journey.
 */
function planSideBySide(from: PlacedNode, to: PlacedNode): Journey {
	const rightward = boxCentre(to.box).x > boxCentre(from.box).x;
	return {
		fromSide: rightward ? "right" : "left",
		toSide: rightward ? "left" : "right",
		channels: [],
	};
}

/**
 * Two cards one row apart drop straight through the band between them.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param grid The gaps of the layout.
 * @returns The journey.
 */
function planAdjacentRows(from: PlacedNode, to: PlacedNode, grid: LayoutGrid): Journey {
	const headingDown = to.row > from.row;
	return {
		fromSide: headingDown ? "bottom" : "top",
		toSide: headingDown ? "top" : "bottom",
		channels: [{ kind: "band", index: clampBand(Math.max(from.row, to.row), grid) }],
	};
}

/**
 * Sides and channels for one route.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param regions The bands.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The journey.
 */
function planRoute(
	from: PlacedNode,
	to: PlacedNode,
	regions: readonly PlacedRegion[],
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Journey {
	if (to.regionIndex !== from.regionIndex) {
		return planCrossRegion(from, to, grid, blocked);
	}
	// Neither shortcut survives containment. A shared row is only a neighbour
	// when the two do not stand one inside the other, and a one-row drop is only
	// a drop when nothing's title band is in the way. Where either is false the
	// route leaves through a flank and travels in the corridor, which is outside
	// every box in the column and therefore crosses nothing.
	if (to.row === from.row && !overlapsAcross(from, to)) {
		return planSideBySide(from, to);
	}
	if (Math.abs(to.row - from.row) === 1 && !cappedVertically(from, to)) {
		return planAdjacentRows(from, to, grid);
	}
	return planRegionSkip(from, to, regions, grid, blocked);
}

/**
 * Siblings that leave one card in the same direction share a single departure
 * port. Sharing the port is the whole trick: give each member its own and the
 * group converges before it diverges — a bowtie at the face, which is exactly
 * the junction pinch this design retired. A stem only gathers siblings headed
 * down (or up) the card's own band: a connection to another band leaves through
 * a side face and is travelling somewhere else, not fanning out here.
 * @param edge The relationship.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @returns The trunk key, or undefined when this route cannot share a stem.
 */
function trunkKey(edge: SemanticEdge, from: PlacedNode, to: PlacedNode): string | undefined {
	if (from.regionIndex !== to.regionIndex) {
		return undefined;
	}
	const direction = Math.sign(to.row - from.row);
	return direction === 0 ? undefined : `${edge.from} ${direction}`;
}

/**
 * A trunk only gathers same-band siblings, so a member's target is always in
 * its own band.
 * @param from Where the route starts.
 * @param to Where it ends.
 * @param regions The bands.
 * @param grid The gaps of the layout.
 * @param blocked Every card's blocked faces.
 * @returns The journey.
 */
function planTrunkMember(
	from: PlacedNode,
	to: PlacedNode,
	regions: readonly PlacedRegion[],
	grid: LayoutGrid,
	blocked: ReadonlyMap<string, Blocked>,
): Journey {
	const headingDown = to.row > from.row;
	const home: Channel = { kind: "band", index: bandToward(from.row, headingDown, grid) };
	const fromSide: Side = headingDown ? "bottom" : "top";

	// A stem leaves through a vertical face, so a stem under a title band is no
	// stem at all: that member takes the long way round like any other route.
	if (cappedVertically(from, to)) {
		return planRegionSkip(from, to, regions, grid, blocked);
	}
	if (Math.abs(to.row - from.row) === 1) {
		return { fromSide, toSide: headingDown ? "top" : "bottom", channels: [home] };
	}
	const tail = planRegionSkip(from, to, regions, grid, blocked);
	return { fromSide, toSide: tail.toSide, channels: [home, ...tail.channels] };
}

export {
	type Channel,
	type Route,
	type Journey,
	type Blocked,
	blockedFaces,
	planRoute,
	planTrunkMember,
	trunkKey,
};
