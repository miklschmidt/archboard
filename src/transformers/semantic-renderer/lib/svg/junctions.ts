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
//
// A dot sits where the ink actually parts: a route that turns off a lane
// leaves it where its rounded bend begins, not at the corner the bend cuts.
// Joins a few units apart along one lane are one place to a reader, so they
// are marked by one bar along the lane rather than by dots that overlap.

import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf, type Curve } from "@/transformers/semantic-renderer/lib/layout/curves";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { MEMBERS_ATTRIBUTE } from "@/transformers/semantic-renderer/lib/svg/standing";

/** How far a junction mark reaches past the line it sits on, so it reads as a dot and not a kink. */
const JUNCTION_REACH = 1.6;

/** How far a route must go on from a point to count as leaving it that way. */
const ONWARD = 0.5;

/** How much clear space two marks along one lane need to read as two. */
const APART = 2;

/** One straight stretch of a route, along one axis. */
interface Stretch {
	readonly route: number;
	/** Whether it runs across the page rather than down it. */
	readonly across: boolean;
	/** The coordinate it keeps: y for a stretch across, x for one down. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
	/** How far before each end the route's ink turns away: its bend's radius there, none at a route's end. */
	readonly fromBend: number;
	readonly toBend: number;
	/** How thick its line is drawn. */
	readonly width: number;
}

/** A place two routes join or part, and the heavier of the lines there; a bar when it runs on to `until`. */
interface Junction {
	readonly point: Point;
	readonly until?: Point;
	readonly route: number;
	readonly width: number;
	/** Every route that joins or parts here, by its place among the routes. */
	readonly routes: readonly number[];
}

/** One route, as the joins are found from it. */
interface JoinRoute {
	/** Its ends and corners, in order. */
	readonly corners: readonly Point[];
	/** How far before each corner its ink starts to turn: its bend's radius there, none at its ends. */
	readonly bends?: readonly number[];
	readonly width: number;
}

/**
 * The straight stretches of one route, from its corners.
 * @param route The route.
 * @param index Which route it is.
 * @returns Its stretches along either axis.
 */
function stretchesOf(route: JoinRoute, index: number): Stretch[] {
	const { corners, bends = [], width } = route;
	return corners.slice(1).flatMap((to, at) => {
		const from = corners[at]!;
		const ends = { from, to, bends: [bends[at] ?? 0, bends[at + 1] ?? 0] as const };
		return stretchBetween(ends, index, width);
	});
}

/**
 * The stretch between two corners of a route, when they share a row or a column.
 * @param ends The two corners and how far before each the route's ink turns.
 * @param ends.from The first corner.
 * @param ends.to The second.
 * @param ends.bends The bends' radii at each.
 * @param route Which route it is.
 * @param width How thick its line is drawn.
 * @returns The stretch, or none for a diagonal or a point.
 */
function stretchBetween(
	ends: { readonly from: Point; readonly to: Point; readonly bends: readonly [number, number] },
	route: number,
	width: number,
): Stretch[] {
	const { from: a, to: b, bends } = ends;
	const across = Math.abs(a.y - b.y) < ONWARD;
	if (across === Math.abs(a.x - b.x) < ONWARD) return [];
	const axis = across ? "x" : "y";
	const forward = a[axis] <= b[axis];
	return [
		{
			route,
			across,
			at: across ? a.y : a.x,
			from: Math.min(a[axis], b[axis]),
			to: Math.max(a[axis], b[axis]),
			fromBend: forward ? bends[0] : bends[1],
			toBend: forward ? bends[1] : bends[0],
			width,
		},
	];
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
 * Where two stretches begin and stop running together as one drawn line, and
 * where along it their ink parts at each end: a route that turns off at an
 * end has already left the line where its bend begins.
 * @param one A stretch of one route.
 * @param other A stretch of another route.
 * @returns Each end with where the ink parts there, and how near their lines are, or null when they share none.
 */
function sharedEnds(
	one: Stretch,
	other: Stretch,
): {
	readonly ends: readonly { readonly end: Point; readonly parts: Point }[];
	readonly near: number;
} | null {
	if (one.route === other.route || one.across !== other.across) return null;
	const near = Math.max((one.width + other.width) / 2, ONWARD);
	const from = Math.max(one.from, other.from);
	const to = Math.min(one.to, other.to);
	if (Math.abs(one.at - other.at) > near || to - from <= near) return null;
	const at = (one.at + other.at) / 2;
	/**
	 * The point on the shared line at one coordinate along it.
	 * @param along The coordinate.
	 * @returns The point.
	 */
	const point = (along: number): Point => (one.across ? { x: along, y: at } : { x: at, y: along });
	const middle = (from + to) / 2;
	/**
	 * How far in from one end of the shared stretch the ink parts.
	 * @param along The end.
	 * @param bend Which end of each stretch it is.
	 * @returns The distance, never past the middle.
	 */
	const inward = (along: number, bend: "fromBend" | "toBend"): number =>
		Math.min(
			Math.abs(middle - along),
			Math.max(
				...[one, other].map((stretch) => {
					const end = bend === "fromBend" ? stretch.from : stretch.to;
					return Math.abs(end - along) <= near ? stretch[bend] : 0;
				}),
			),
		);
	return {
		ends: [
			{ end: point(from), parts: point(from + inward(from, "fromBend")) },
			{ end: point(to), parts: point(to - inward(to, "toBend")) },
		],
		near,
	};
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
		.filter(({ end }) => partAt(byRoute[one.route]!, byRoute[other.route]!, end, shared.near))
		.map(({ parts }) => ({
			point: parts,
			route: heavier.route,
			width: heavier.width,
			routes: [one.route, other.route],
		}));
}

/**
 * Keep one join per place, carrying the heavier line there.
 * @param found The joins so far, by place.
 * @param junction The join found now.
 */
function keep(found: Map<string, Junction>, junction: Junction): void {
	const key = `${Math.round(junction.point.x / 2)},${Math.round(junction.point.y / 2)}`;
	const held = found.get(key);
	const routes = [...new Set([...(held?.routes ?? []), ...junction.routes])];
	const kept = held === undefined || held.width < junction.width ? junction : held;
	found.set(key, { ...kept, routes });
}

/**
 * Joins close together along one lane, gathered into one mark: a bar from the
 * first to the last, carrying the heaviest line among them.
 * @param junctions The joins, one per place.
 * @returns The marks.
 */
function gathered(junctions: readonly Junction[]): Junction[] {
	const pending = [...junctions];
	const marks: Junction[] = [];
	while (pending.length > 0) {
		const cluster = [pending.pop()!];
		// Grow the cluster until no pending join touches any of it.
		for (let index = pending.findIndex((one) => touchesAny(cluster, one)); index !== -1;) {
			cluster.push(...pending.splice(index, 1));
			index = pending.findIndex((one) => touchesAny(cluster, one));
		}
		marks.push(markOf(cluster));
	}
	return marks;
}

/**
 * Whether a join touches any join of a cluster.
 * @param cluster The cluster.
 * @param junction The join.
 * @returns True when it does.
 */
function touchesAny(cluster: readonly Junction[], junction: Junction): boolean {
	return cluster.some((held) => touching(held, junction));
}

/**
 * One mark for a cluster of joins: a dot for one, a bar along the lane for several.
 * @param cluster The joins, all on one lane.
 * @returns The mark, carrying the heaviest line among them.
 */
function markOf(cluster: readonly Junction[]): Junction {
	const heaviest = cluster.reduce((best, one) => (one.width > best.width ? one : best));
	if (cluster.length === 1) return heaviest;
	const ordered = cluster.toSorted((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);
	const routes = [...new Set(cluster.flatMap((one) => one.routes))];
	return { ...heaviest, point: ordered[0]!.point, until: ordered.at(-1)!.point, routes };
}

/**
 * Whether two joins on one lane are too close to read as two dots.
 * @param a One join.
 * @param b Another.
 * @returns True when they share a lane and their dots would touch.
 */
function touching(a: Junction, b: Junction): boolean {
	const dx = Math.abs(a.point.x - b.point.x);
	const dy = Math.abs(a.point.y - b.point.y);
	const reach = a.width + b.width + JUNCTION_REACH * 2 + APART;
	return (dx < ONWARD && dy < reach) || (dy < ONWARD && dx < reach);
}

/**
 * The joins of routes, one per place, before close ones are gathered into a mark.
 * @param routes Every route's corners, its bends' radii and its line width.
 * @returns The joins.
 */
function joinsOf(routes: readonly JoinRoute[]): Junction[] {
	const byRoute = routes.map(stretchesOf);
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
 * The stretches each route shares with another as one drawn line, where a
 * reader cannot tell the two routes' traffic apart.
 * @param routes Every route's corners, its bends' radii and its line width.
 * @returns For each route, by its place among them, the boxes of the lines it shares.
 */
function sharedStretches(routes: readonly JoinRoute[]): Box[][] {
	const stretches = routes.flatMap(stretchesOf);
	const shared: Box[][] = routes.map(() => []);
	for (const [index, one] of stretches.entries()) {
		for (const other of stretches.slice(index + 1)) {
			const found = sharedEnds(one, other);
			if (found === null) continue;
			const [from, to] = found.ends.map(({ end }) => end);
			const box = {
				x: Math.min(from!.x, to!.x),
				y: Math.min(from!.y, to!.y),
				width: Math.abs(to!.x - from!.x),
				height: Math.abs(to!.y - from!.y),
			};
			shared[one.route]!.push(box);
			shared[other.route]!.push(box);
		}
	}
	return shared;
}

/**
 * Every place two routes join or part, one mark per place.
 *
 * Two stretches draw as one line when their strokes touch, which a shared lane
 * does even when routing nudged its routes a unit apart; where such a shared
 * stretch begins and ends, the routes on it either go on together, which is a
 * corner they share, or part, which is a join.
 * @param routes Every route's corners, its bends' radii and its line width.
 * @returns The joins.
 */
function junctionsOf(routes: readonly JoinRoute[]): Junction[] {
	return gathered(joinsOf(routes));
}

/**
 * How far before each of a route's corners its ink starts to turn.
 * @param curve The route, before any hop is drawn.
 * @returns One radius per corner, ends included at zero.
 */
function bendsOf(curve: Curve): number[] {
	let from = curve.from;
	const radii = [0];
	for (const segment of curve.segments) {
		if (segment.kind === "cubic") {
			radii.push(Math.max(Math.abs(segment.to.x - from.x), Math.abs(segment.to.y - from.y)));
		}
		from = segment.to;
	}
	radii.push(0);
	return radii;
}

/**
 * Drawn routes as the joins are found from them.
 * @param routes The routes as drawn, before crossings are bridged.
 * @param widthOf How thick one route's line is drawn, by its place among them.
 * @returns The routes' corners, bends and widths.
 */
function joinRoutes(
	routes: readonly Pick<DrawingEdge, "curve">[],
	widthOf: (index: number) => number,
): JoinRoute[] {
	return routes.map(({ curve }, index) => ({
		corners: verticesOf(curve),
		bends: bendsOf(curve),
		width: widthOf(index),
	}));
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
	const junctions = junctionsOf(joinRoutes(routes, (index) => lines[index]!.width));

	if (junctions.length === 0) return "";
	const marks = junctions.map(({ point, until, route, width, routes: joined }) => {
		const ink = lines[route]!.ink;
		const radius = markRadius(width);
		// What a viewer lights the mark with: the relationships that meet at it.
		const members = { [MEMBERS_ATTRIBUTE]: joined.map((at) => routes[at]!.edge.id).join(" ") };
		return until === undefined
			? tag("circle", {
					cx: coord(point.x),
					cy: coord(point.y),
					r: coord(radius),
					fill: ink,
					...members,
				})
			: tag("path", {
					d: `M${coord(point.x)},${coord(point.y)} L${coord(until.x)},${coord(until.y)}`,
					fill: "none",
					stroke: ink,
					"stroke-width": coord(radius * 2),
					"stroke-linecap": "round",
					...members,
				});
	});
	return wrap("g", { class: "ab-junctions", "pointer-events": "none" }, marks.join(""));
}

/**
 * How far a junction mark reaches from its point on a line of some width.
 * @param width The line's width.
 * @returns The mark's radius.
 */
function markRadius(width: number): number {
	return width + JUNCTION_REACH;
}

export { joinRoutes, junctionMarks, junctionsOf, markRadius, sharedStretches };
