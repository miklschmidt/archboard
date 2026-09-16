// Straightening the short sideways step a route takes at a card.
//
// The engine places a route's lane between two rows and its port on the card
// separately, so the leg into a card often steps sideways by less than a
// badge's width and then continues straight (the 2026-09-16 "Semantic
// renderer" proposal stepped 17, 21 and 28 units at three cards). A port
// anywhere on a face means the same thing, so the port slides onto the lane
// when the face still holds it and no other route runs where the leg would.

import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";

/** The longest sideways step at a card that is a jog rather than a turn. */
const JOG = 32;
/** A port keeps this much of the face on either side of it. */
const FACE_INSET = 16;
/** Another route's run must stay this far from the straightened leg. */
const LANE_CLEARANCE = 16;

/** One straight piece of a route. */
interface Run {
	readonly from: Point;
	readonly to: Point;
}

/**
 * Every straight piece of a route.
 * @param route The route's corners.
 * @returns Its runs in order.
 */
function runsOf(route: readonly Point[]): Run[] {
	return route.slice(1).map((to, index) => ({ from: route[index]!, to }));
}

/**
 * Whether a run is vertical and passes within a clearance of a vertical leg.
 * @param run Another route's run.
 * @param x Where the leg would run.
 * @param top The leg's upper end.
 * @param bottom The leg's lower end.
 * @returns True when the run would lie beside or on the leg.
 */
function besideLeg(run: Run, x: number, top: number, bottom: number): boolean {
	if (Math.abs(run.from.x - run.to.x) > 0.01) return false;
	if (Math.abs(run.from.x - x) >= LANE_CLEARANCE) return false;
	return Math.max(run.from.y, run.to.y) >= top && Math.min(run.from.y, run.to.y) <= bottom;
}

/**
 * The card face an endpoint lies on, when it lies on a top or bottom face.
 * @param end The route's first or last point.
 * @param boxes Every drawn card and frame.
 * @returns The box, or nothing when the endpoint is on a flank or nowhere.
 */
function faceUnder(end: Point, boxes: readonly Box[]): Box | undefined {
	return boxes.find(
		(box) =>
			end.x >= box.x &&
			end.x <= box.x + box.width &&
			(Math.abs(end.y - box.y) < 0.01 || Math.abs(end.y - box.y - box.height) < 0.01),
	);
}

/**
 * Whether two points lie on one vertical line.
 * @param a One point.
 * @param b The other.
 * @returns True when they share an x within rounding.
 */
function isVertical(a: Point, b: Point): boolean {
	return Math.abs(a.x - b.x) < 0.01;
}

/** The last leg of a route when it is a vertical jog off a vertical lane. */
interface JoggedLeg {
	readonly end: Point;
	readonly corner: Point;
	readonly lane: Point;
}

/**
 * Whether a leg steps sideways off its lane by a jog rather than a turn.
 * @param leg The leg.
 * @returns True for a step shorter than a badge and longer than rounding noise.
 */
function isJog(leg: JoggedLeg): boolean {
	const step = Math.abs(leg.corner.x - leg.lane.x);
	return step > 0.01 && step <= JOG;
}

/**
 * Read the last leg of a route when it steps sideways off its lane.
 * @param route The route, oriented so the end in question comes last.
 * @returns The leg, or nothing when the end is not a short vertical jog.
 */
function joggedLeg(route: readonly Point[]): JoggedLeg | undefined {
	const tail = route.slice(-4);
	if (tail.length < 4) return undefined;
	const [before, lane, corner, end] = tail.map((point) => point);
	const leg = { end: end!, corner: corner!, lane: lane! };
	const vertical = isVertical(leg.corner, leg.end) && isVertical(before!, leg.lane);
	return vertical && isJog(leg) ? leg : undefined;
}

/**
 * Whether the face the leg ends on still holds a port at the lane.
 * @param leg The jogged leg.
 * @param boxes Every drawn card and frame.
 * @returns True when the lane crosses the face with an inset to spare.
 */
function faceHoldsLane(leg: JoggedLeg, boxes: readonly Box[]): boolean {
	const face = faceUnder(leg.end, boxes);
	if (face === undefined) return false;
	return leg.lane.x >= face.x + FACE_INSET && leg.lane.x <= face.x + face.width - FACE_INSET;
}

/**
 * Straighten the leg at one end of a route by sliding its port onto the lane.
 * @param route The route, oriented so the end in question comes last.
 * @param boxes Every drawn card and frame.
 * @param others Every other route's runs.
 * @returns The route with its last leg straight, or the same route.
 */
function straightenLast(
	route: readonly Point[],
	boxes: readonly Box[],
	others: readonly Run[],
): readonly Point[] {
	const leg = joggedLeg(route);
	if (leg === undefined || !faceHoldsLane(leg, boxes)) return route;
	const top = Math.min(leg.corner.y, leg.end.y);
	const bottom = Math.max(leg.corner.y, leg.end.y);
	if (others.some((run) => besideLeg(run, leg.lane.x, top, bottom))) return route;
	return [...route.slice(0, -3), leg.lane, { x: leg.lane.x, y: leg.end.y }];
}

/**
 * Straighten the short sideways steps every route takes at its cards.
 * @param routes Every route by relationship id.
 * @param boxes Every drawn card and frame.
 * @returns The routes with their end legs straight where a face allows it.
 */
function straightenJogs(
	routes: ReadonlyMap<string, readonly Point[]>,
	boxes: readonly Box[],
): Map<string, readonly Point[]> {
	const straightened = new Map(routes);
	for (const [id, route] of routes) {
		const others = [...straightened]
			.filter(([other]) => other !== id)
			.flatMap(([, other]) => runsOf(other));
		const atEnd = straightenLast(route, boxes, others);
		const atStart = straightenLast(atEnd.toReversed(), boxes, others).toReversed();
		straightened.set(id, atStart);
	}
	return straightened;
}

export { straightenJogs };
