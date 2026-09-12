// Reading the lines back off a rendered document, in the same coordinates the
// atlas is written in.
//
// Like `drawn-text.ts`, this takes the SVG at its word: it reads the shift the
// document puts its whole body under rather than being told what it was, so a
// route and the box it is checked against are compared in one frame of
// reference or not at all.

import type { DiagramBox } from "@/shared/semantic-board/index";

/** A position in the page's own units. */
interface DrawnPoint {
	/** Distance from the left edge. */
	readonly x: number;
	/** Distance from the top edge. */
	readonly y: number;
}

/**
 * How far the document moved its body onto the page.
 * @param svg The rendered document.
 * @returns The shift, or the origin when the body was not moved.
 */
function bodyShift(svg: string): DrawnPoint {
	const found = /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)">/.exec(svg);
	return found === null ? { x: 0, y: 0 } : { x: Number(found[1] ?? 0), y: Number(found[2] ?? 0) };
}

/**
 * Every coordinate pair a path command list names, in order.
 * @param d The `d` attribute.
 * @returns The points it passes through, including its control points.
 */
function pointsOf(d: string): DrawnPoint[] {
	return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((pair) => ({
		x: Number(pair[1] ?? 0),
		y: Number(pair[2] ?? 0),
	}));
}

/**
 * Where each drawn route ends, on the page.
 *
 * The last coordinate of a route's own path is where its arrowhead is placed,
 * which is the thing a reader sees touching whatever the route arrives at. The
 * halo path that precedes it in the group carries the same shape, so the first
 * path of the group is the one read.
 *
 * Only routes written as absolute coordinate pairs can be read this way, which
 * is every architecture edge and every straight sequence message. A self-message
 * loop is written in relative commands with no final pair, so it is not one of
 * these and asking for it gives a number that means nothing.
 * @param svg The rendered document.
 * @param kind Which sort of subject to read: `edge` in the architecture grammar, `step` in the data-flow one.
 * @returns Each route's arrival point, by the id of the subject that drew it.
 */
function routeEnds(svg: string, kind: string = "edge"): Map<string, DrawnPoint> {
	const shift = bodyShift(svg);
	const ends = new Map<string, DrawnPoint>();
	for (const group of svg.matchAll(
		new RegExp(
			`<g data-semantic-kind="${kind}" data-semantic-id="([^"]+)"[^>]*>([\\s\\S]*?)</g>`,
			"g",
		),
	)) {
		const id = group[1] ?? "";
		const drawn = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"/g)];
		const last = pointsOf(drawn[drawn.length - 1]?.[1] ?? "").at(-1);
		if (last !== undefined) {
			ends.set(id, { x: last.x + shift.x, y: last.y + shift.y });
		}
	}
	return ends;
}

/**
 * Every point each drawn route passes through, on the page.
 *
 * The control points of the curve as well as its corners. A cubic stays inside
 * the hull of its own control points, so the polyline through all of them is a
 * faithful stand-in for the ink when the question is "does this line go through
 * that box".
 * @param svg The rendered document.
 * @returns Each edge's points, by edge id.
 */
function routePoints(svg: string): Map<string, DrawnPoint[]> {
	const shift = bodyShift(svg);
	const paths = new Map<string, DrawnPoint[]>();
	for (const group of svg.matchAll(
		/<g data-semantic-kind="edge" data-semantic-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
	)) {
		const drawn = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"/g)];
		paths.set(
			group[1] ?? "",
			pointsOf(drawn[drawn.length - 1]?.[1] ?? "").map((point) => ({
				x: point.x + shift.x,
				y: point.y + shift.y,
			})),
		);
	}
	return paths;
}

/**
 * Whether a segment and a box overlap at all.
 *
 * A cheap separating-axis test on the segment's own bounding box. It is a
 * conservative answer — two boxes can overlap where the segment itself misses —
 * which is the safe direction for an assertion that nothing goes through
 * anything: it never misses a real crossing.
 * @param one One end of the segment.
 * @param other The other end.
 * @param box The box.
 * @returns True when the segment's extent reaches into the box.
 */
function segmentMeets(one: DrawnPoint, other: DrawnPoint, box: DiagramBox): boolean {
	return (
		Math.min(one.x, other.x) < box.x + box.width &&
		Math.max(one.x, other.x) > box.x &&
		Math.min(one.y, other.y) < box.y + box.height &&
		Math.max(one.y, other.y) > box.y
	);
}

/**
 * Whether a drawn route passes through a box.
 * @param points The route's points, in order.
 * @param box The box it must stay out of.
 * @returns True when any of its segments reaches into the box.
 */
function routeCrosses(points: readonly DrawnPoint[], box: DiagramBox): boolean {
	return points.some((point, index) => {
		const next = points[index + 1];
		return next !== undefined && segmentMeets(point, next, box);
	});
}

/**
 * How far a point is from the nearest edge of a box, negative inside it.
 * @param point The point.
 * @param box The box.
 * @returns The distance to the box's frame.
 */
function distanceToFrame(point: DrawnPoint, box: DiagramBox): number {
	const sides = [
		Math.abs(point.x - box.x),
		Math.abs(point.x - (box.x + box.width)),
		Math.abs(point.y - box.y),
		Math.abs(point.y - (box.y + box.height)),
	];
	return Math.min(...sides);
}

export { type DrawnPoint, bodyShift, distanceToFrame, routeCrosses, routeEnds, routePoints };
