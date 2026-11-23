// The cables of a rendered picture: the lines that start on one card and end on another and run
// side by side as one ribbon, which Blocks draws as the strands of one cable, half a lane apart,
// with one plate for them all.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import {
	type DrawnPoint,
	corridorPoints,
	distanceToFrame,
} from "#tests/runtime/support/drawn-routes.ts";

/** How far apart a cable's strands stand: half a lane. */
const STRAND = 8;

/** How far a route's end may stand off its card's edge and still end on it. */
const ON_EDGE = 0.5;

/** How far off its pitch a strand may stand and still run beside its neighbour: a snapping unit. */
const SNAP = 1;

/**
 * Whether two routes run as neighbouring strands of one ribbon: as many runs each, run for run
 * parallel, and each straight run a strand's pitch from its neighbour's across their lane. A
 * rounded corner's pieces only run parallel, since each strand rounds its own corner.
 * @param one A route, without its bridges.
 * @param other Another route, without its bridges.
 * @returns True when they run side by side the whole way.
 */
function besideAllTheWay(one: readonly DrawnPoint[], other: readonly DrawnPoint[]): boolean {
	if (one.length !== other.length || one.length < 2) return false;
	return one.slice(1).every((end, index) => {
		const [start, otherStart, otherEnd] = [one[index]!, other[index]!, other[index + 1]!];
		const [dx, dy] = [end.x - start.x, end.y - start.y];
		const [ox, oy] = [otherEnd.x - otherStart.x, otherEnd.y - otherStart.y];
		const parallel =
			Math.abs(dx * oy - dy * ox) <= SNAP * (Math.hypot(dx, dy) + Math.hypot(ox, oy));
		const level = dy === 0 && oy === 0;
		const upright = dx === 0 && ox === 0;
		if (!level && !upright) return parallel;
		const across = level ? Math.abs(start.y - otherStart.y) : Math.abs(start.x - otherStart.x);
		return Math.abs(across - STRAND) <= SNAP;
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
	 * @param point.x Its distance from the left edge.
	 * @param point.y Its distance from the top edge.
	 * @returns The card's id, if the end stands on one.
	 */
	const cardAt = (point: { x: number; y: number }) =>
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
 * How far a cable's plate may stand to either side of one of its strands: the plate stands on
 * the cable's middle, half the cable's width from its outermost strand.
 * @param strands The cable's strands.
 * @returns The distance, in page units.
 */
function plateReach(strands: readonly string[]): number {
	return ((strands.length - 1) * STRAND) / 2;
}

export { cablesOf, plateReach };
