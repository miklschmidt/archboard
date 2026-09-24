// Where routes join a shared lane.
//
// Relationships of one kind may share a lane on purpose: one line reads cleaner
// than several parallel ones. But two relationships that finish on one line
// with one arrowhead read as one relationship, unless the join says otherwise.
// A circuit diagram marks a join with a dot, and so does this painter: at
// every point where two routes start or stop running together. Two routes that
// only end at the same point of a card do not join anywhere, so that point is
// not marked. The marks change nothing about where anything is placed or
// routed; they are found from the finished routes and painted over them.

import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";

/** How far a junction mark reaches past the line it sits on, so it reads as a dot and not a kink. */
const JUNCTION_REACH = 1.6;

/** How far a route must go on from a point to count as leaving it that way. */
const ONWARD = 0.5;

/** One straight stretch of a route, along one axis. */
interface Stretch {
	readonly route: number;
	/** Whether it runs across the page rather than down it. */
	readonly across: boolean;
	/** The coordinate it keeps: y for a stretch across, x for one down. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
	/** How thick its line is drawn. */
	readonly width: number;
}

/** A place two routes join or part, and the heavier of the lines there. */
interface Junction {
	readonly point: Point;
	readonly route: number;
	readonly width: number;
}

/**
 * The straight stretches of one route, from its corners.
 * @param corners The route's ends and corners, in order.
 * @param route Which route it is.
 * @param width How thick its line is drawn.
 * @returns Its stretches along either axis.
 */
function stretchesOf(corners: readonly Point[], route: number, width: number): Stretch[] {
	const stretches: Stretch[] = [];
	for (let index = 1; index < corners.length; index += 1) {
		const a = corners[index - 1]!;
		const b = corners[index]!;
		const across = Math.abs(a.y - b.y) < ONWARD;
		const down = Math.abs(a.x - b.x) < ONWARD;
		if (across === down) continue;
		stretches.push(
			across
				? { route, across, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), width }
				: { route, across, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), width },
		);
	}
	return stretches;
}

/**
 * Whether a point lies on a stretch's drawn line, ends included.
 * @param stretch The stretch.
 * @param point The point.
 * @param near How far off the stretch the point may be and still be on it.
 * @returns True when it does.
 */
function onStretch(stretch: Stretch, point: Point, near: number): boolean {
	const off = stretch.across ? point.y : point.x;
	const along = stretch.across ? point.x : point.y;
	return (
		Math.abs(off - stretch.at) <= near && along >= stretch.from - near && along <= stretch.to + near
	);
}

/**
 * The ways one stretch goes on from a point on it.
 * @param stretch The stretch.
 * @param point The point.
 * @param near How far off the stretch the point may be and still be on it.
 * @returns The directions, spelled so two routes' sets compare; none when the point is not on it.
 */
function stretchWays(stretch: Stretch, point: Point, near: number): string[] {
	if (!onStretch(stretch, point, near)) return [];
	const along = stretch.across ? point.x : point.y;
	const [back, forth] = stretch.across ? ["left", "right"] : ["up", "down"];
	return [
		...(along - stretch.from > near ? [back] : []),
		...(stretch.to - along > near ? [forth] : []),
	];
}

/**
 * The ways a route goes on from a point on its line, along its own stretches.
 * @param stretches The route's stretches.
 * @param point The point.
 * @param near How far off the route's line the point may be and still be on it.
 * @returns The directions, spelled so two routes' sets compare.
 */
function waysOut(stretches: readonly Stretch[], point: Point, near: number): Set<string> {
	return new Set(stretches.flatMap((stretch) => stretchWays(stretch, point, near)));
}

/**
 * Whether two routes part at a point where they begin or stop running together.
 * @param one The first route's stretches.
 * @param other The second route's stretches.
 * @param point Where they begin or stop running together.
 * @param near How far apart two lines may be and still draw as one.
 * @returns True when they go on from it different ways.
 */
function partAt(
	one: readonly Stretch[],
	other: readonly Stretch[],
	point: Point,
	near: number,
): boolean {
	const a = waysOut(one, point, near);
	const b = waysOut(other, point, near);
	return a.size !== b.size || [...a].some((way) => !b.has(way));
}

/**
 * Where two stretches begin and stop running together as one drawn line.
 * @param one A stretch of one route.
 * @param other A stretch of another route.
 * @returns The two ends of the stretch they share and how near their lines are, or null when they share none.
 */
function sharedEnds(
	one: Stretch,
	other: Stretch,
): { readonly ends: readonly Point[]; readonly near: number } | null {
	if (one.route === other.route || one.across !== other.across) return null;
	const near = Math.max((one.width + other.width) / 2, ONWARD);
	const from = Math.max(one.from, other.from);
	const to = Math.min(one.to, other.to);
	if (Math.abs(one.at - other.at) > near || to - from <= near) return null;
	const at = (one.at + other.at) / 2;
	const ends = [from, to].map((along) => (one.across ? { x: along, y: at } : { x: at, y: along }));
	return { ends, near };
}

/**
 * Keep one join per place, carrying the heavier line there.
 * @param found The joins so far, by place.
 * @param junction The join found now.
 */
function keep(found: Map<string, Junction>, junction: Junction): void {
	const key = `${Math.round(junction.point.x / 2)},${Math.round(junction.point.y / 2)}`;
	const held = found.get(key);
	if (held === undefined || held.width < junction.width) found.set(key, junction);
}

/**
 * Where two stretches of two routes join or part.
 * @param one A stretch of one route.
 * @param other A stretch of another route.
 * @param byRoute Every route's stretches.
 * @returns The joins, carrying the heavier line.
 */
function joinsBetween(
	one: Stretch,
	other: Stretch,
	byRoute: readonly (readonly Stretch[])[],
): Junction[] {
	const shared = sharedEnds(one, other);
	if (shared === null) return [];
	const heavier = one.width >= other.width ? one : other;
	return shared.ends
		.filter((point) => partAt(byRoute[one.route]!, byRoute[other.route]!, point, shared.near))
		.map((point) => ({ point, route: heavier.route, width: heavier.width }));
}

/**
 * Every place two routes join or part, one per place.
 *
 * Two stretches draw as one line when their strokes touch, which a shared lane
 * does even when routing nudged its routes a unit apart; where such a shared
 * stretch begins and ends, the routes on it either go on together, which is a
 * corner they share, or part, which is a join.
 * @param routes Every route's corners and line width.
 * @returns The joins.
 */
function junctionsOf(
	routes: readonly { readonly corners: readonly Point[]; readonly width: number }[],
): Junction[] {
	const byRoute = routes.map(({ corners, width }, route) => stretchesOf(corners, route, width));
	const stretches = byRoute.flat();
	const found = new Map<string, Junction>();
	for (const [index, one] of stretches.entries()) {
		for (const other of stretches.slice(index + 1)) {
			for (const junction of joinsBetween(one, other, byRoute)) keep(found, junction);
		}
	}
	return [...found.values()];
}

/**
 * The marks for every join, in the ink and weight of the heavier line there.
 * @param routes The routes as drawn, before crossings are bridged.
 * @param inkOf The ink and width of one route's line.
 * @returns The marks' markup, or nothing where no routes join.
 */
function junctionMarks(
	routes: readonly DrawingEdge[],
	inkOf: (route: DrawingEdge) => { readonly ink: string; readonly width: number },
): string {
	const lines = routes.map(inkOf);
	const junctions = junctionsOf(
		routes.map(({ curve }, index) => ({ corners: verticesOf(curve), width: lines[index]!.width })),
	);
	if (junctions.length === 0) return "";
	const marks = junctions.map(
		({ point, route, width }) =>
			`<circle cx="${coord(point.x)}" cy="${coord(point.y)}" r="${coord(width + JUNCTION_REACH)}" fill="${lines[route]!.ink}"/>`,
	);
	return `<g class="ab-junctions" pointer-events="none">${marks.join("")}</g>`;
}

export { junctionMarks, junctionsOf };
