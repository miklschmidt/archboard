// The cables of a rendered picture: the lines that start on one card and end on another and run
// side by side as one ribbon, which Blocks draws as the strands of one cable, half a lane apart
// along its body and a lane apart where it reaches its cards, where each strand fans out to a port
// of its own, with one plate for them all.

import type { DiagramBox } from "@archboard/model/render-reply";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import {
	type DrawnPoint,
	corridorPoints,
	distanceToFrame,
} from "#tests/runtime/support/drawn-routes.ts";

/** How far apart a cable's strands stand along its body: half a lane. */
const STRAND = 8;

/** How far apart a cable's strands stand where they reach a card and fan out: a lane. */
const FAN = 16;

/** How far a route's end may stand off its card's edge and still end on it. */
const ON_EDGE = 0.5;

/** How far off its pitch a strand may stand and still run beside its neighbour: a snapping unit. */
const SNAP = 1;

/**
 * The nearest distance from a point to a route.
 * @param point The point.
 * @param route The route.
 * @returns The distance, in page units.
 */
function distanceTo(point: DrawnPoint, route: readonly DrawnPoint[]): number {
	return route.slice(1).reduce((nearest, end, index) => {
		const start = route[index]!;
		const [dx, dy] = [end.x - start.x, end.y - start.y];
		const length = dx * dx + dy * dy;
		const share =
			length === 0
				? 0
				: Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
		const [x, y] = [start.x + share * dx, start.y + share * dy];
		return Math.min(nearest, Math.hypot(point.x - x, point.y - y));
	}, Number.POSITIVE_INFINITY);
}

/**
 * Points along a route, a unit or so apart.
 * @param route The route.
 * @returns The points.
 */
function along(route: readonly DrawnPoint[]): DrawnPoint[] {
	return route.slice(1).flatMap((end, index) => {
		const start = route[index]!;
		const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
		return Array.from({ length: steps }, (_, step) => ({
			x: start.x + ((end.x - start.x) * step) / steps,
			y: start.y + ((end.y - start.y) * step) / steps,
		}));
	});
}

/**
 * Whether two routes run as neighbouring strands of one ribbon: every point of each stands within
 * two lanes of the other, as near as neighbouring strands come where one has stepped out to its
 * port and the next not yet, and never nearer than half a lane, so the two never touch.
 * @param one A route, without its bridges.
 * @param other Another route, without its bridges.
 * @returns True when they run side by side the whole way.
 */
function besideAllTheWay(one: readonly DrawnPoint[], other: readonly DrawnPoint[]): boolean {
	if (one.length < 2 || other.length < 2) return false;
	return staysBeside(one, other) && staysBeside(other, one);
}

/**
 * Whether every point of a route stands within two lanes of another route and no nearer than
 * half a lane.
 * @param route The route.
 * @param next The other route.
 * @returns True when it stays beside the other the whole way.
 */
function staysBeside(route: readonly DrawnPoint[], next: readonly DrawnPoint[]): boolean {
	return along(route).every((point) => {
		const distance = distanceTo(point, next);
		return distance >= STRAND - SNAP && distance <= 2 * FAN + SNAP;
	});
}

/**
 * The strands of each line's cable, by the line's id: the lines between the same two cards, the
 * same way round, that run as one ribbon, each beside the next all the way, its own id included.
 * A line between those cards that takes a way of its own is a lone line.
 * @param drawing The rendered picture.
 * @returns The strands of each line's cable.
 */
function cablesOf(drawing: RenderedDiagram): Map<string, string[]> {
	const cards = Object.entries(drawing.atlas.nodes);
	/**
	 * The card a route ends on.
	 * @param point The route's end.
	 * @returns The card's id, if the end stands on one.
	 */
	const cardAt = (point: DrawnPoint) =>
		cards.find(
			([, box]) =>
				point.x >= box.x - ON_EDGE &&
				point.x <= box.x + box.width + ON_EDGE &&
				point.y >= box.y - ON_EDGE &&
				point.y <= box.y + box.height + ON_EDGE &&
				distanceToFrame(point, box) < ON_EDGE,
		)?.[0];
	const routes = corridorPoints(drawing.svg);
	const pairs = new Map<string, string[]>();
	for (const [id, points] of routes) {
		const [first, last] = [points[0], points.at(-1)];
		const from = first === undefined ? undefined : cardAt(first);
		const to = last === undefined ? undefined : cardAt(last);
		const key = from === undefined || to === undefined ? id : `${from}>${to}`;
		pairs.set(key, [...(pairs.get(key) ?? []), id]);
	}
	const strands = new Map<string, string[]>();
	for (const lines of pairs.values()) {
		// Each line joins the cable of the first line it runs beside; cables merge where it runs
		// beside several.
		const cable = new Map(lines.map((id) => [id, id]));
		const root = (id: string): string => {
			let at = id;
			while (cable.get(at) !== at) at = cable.get(at)!;
			return at;
		};
		for (const [index, one] of lines.entries()) {
			for (const other of lines.slice(index + 1)) {
				if (besideAllTheWay(routes.get(one)!, routes.get(other)!))
					cable.set(root(other), root(one));
			}
		}
		const members = new Map<string, string[]>();
		for (const id of lines) members.set(root(id), [...(members.get(root(id)) ?? []), id]);
		for (const group of members.values()) for (const id of group) strands.set(id, group);
	}
	return strands;
}

/**
 * Whether a cable's plate stands on the cable's middle: each strand has a straight run that
 * carries the whole plate across its centre, all the same way, and the plate's centre stands
 * half way between the outermost of those runs. A lone line's plate stands on its own run.
 * @param strands The cable's strands.
 * @param routes Each line's route, by id, without its bridges.
 * @param plate The plate's box.
 * @returns True when the plate stands on the middle.
 */
function onCableMiddle(
	strands: readonly string[],
	routes: ReadonlyMap<string, readonly DrawnPoint[]>,
	plate: DiagramBox,
): boolean {
	const centre = { x: plate.x + plate.width / 2, y: plate.y + plate.height / 2 };
	const reach = ((strands.length - 1) * FAN) / 2 + SNAP;
	const runs = strands.map((strand) => {
		const route = routes.get(strand) ?? [];
		return route.slice(1).flatMap((end, index) => {
			const start = route[index]!;
			const level = start.y === end.y && Math.abs(start.y - centre.y) <= reach;
			const upright = start.x === end.x && Math.abs(start.x - centre.x) <= reach;
			const carries = level
				? Math.min(start.x, end.x) <= plate.x && Math.max(start.x, end.x) >= plate.x + plate.width
				: upright &&
					Math.min(start.y, end.y) <= plate.y &&
					Math.max(start.y, end.y) >= plate.y + plate.height;
			return carries ? [{ level, across: level ? start.y : start.x }] : [];
		});
	});
	return [true, false].some((level) => {
		const across = runs.map((each) => each.filter((run) => run.level === level));
		if (across.some((each) => each.length === 0)) return false;
		const near = across.map((each) =>
			each.reduce((best, run) =>
				Math.abs(run.across - (level ? centre.y : centre.x)) <
				Math.abs(best.across - (level ? centre.y : centre.x))
					? run
					: best,
			),
		);
		const positions = near.map((run) => run.across);
		const middle = (Math.min(...positions) + Math.max(...positions)) / 2;
		return Math.abs(middle - (level ? centre.y : centre.x)) < SNAP;
	});
}

/**
 * How far a cable's plate may stand to either side of its nearest strand: half the cable at its
 * widest, where its strands fan out a lane apart.
 * @param strands The cable's strands.
 * @returns The distance, in page units.
 */
function plateReach(strands: readonly string[]): number {
	return ((strands.length - 1) * FAN) / 2;
}

export { cablesOf, onCableMiddle, plateReach };
