// The cables of a rendered picture: the lines that start on one card and end on another, which
// Blocks draws as the strands of one cable, half a lane apart, with one plate for them all.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { distanceToFrame, routePoints } from "#tests/runtime/support/drawn-routes.ts";

/** How far apart a cable's strands stand: half a lane. */
const STRAND = 8;

/** How far a route's end may stand off its card's edge and still end on it. */
const ON_EDGE = 0.5;

/**
 * The strands of each line's cable, by the line's id: every line between the same two cards,
 * the same way round, its own id included.
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
	const keys = new Map<string, string>();
	for (const [id, points] of routePoints(drawing.svg)) {
		const [first, last] = [points[0], points.at(-1)];
		const from = first === undefined ? undefined : cardAt(first);
		const to = last === undefined ? undefined : cardAt(last);
		keys.set(id, from === undefined || to === undefined ? id : `${from}>${to}`);
	}
	const strands = new Map<string, string[]>();
	for (const [id, key] of keys) strands.set(key, [...(strands.get(key) ?? []), id]);
	return new Map([...keys].map(([id, key]) => [id, strands.get(key) ?? [id]]));
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
