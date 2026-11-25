// Join marks a reader cannot read as one clear join: two marks where lines join or part standing
// so close they read as one knot, or a mark standing against the hop of a line that crosses.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import {
	bodyShift,
	pointsOf,
	roundBridges,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";

/** One join mark: a dot, or a bar from one end to the other. */
type Mark = readonly [DrawnPoint, DrawnPoint];

/**
 * How far apart two join marks must stand to read as two joins: two lanes. One lane apart, two
 * dots on a run read as one knot, which is what the owner pointed at in Packages.
 */
const KNOT = 32;

/**
 * How far a join mark must stand from the middle of a hop: the hop's own radius of seven and a
 * lane beyond it, so a run of plain line shows between them.
 */
const HOP_REACH = 7 + 16;

/**
 * The join marks of a drawing, on the page.
 * @param svg The rendered document.
 * @returns Each mark's two ends; a dot's are one point.
 */
function marksOf(svg: string): Mark[] {
	const shift = bodyShift(svg);
	const group = /<g class="ab-junctions"[^>]*>([\s\S]*?)<\/g>/u.exec(svg)?.[1] ?? "";
	const moved = (point: DrawnPoint) => ({ x: point.x + shift.x, y: point.y + shift.y });
	const dots = [...group.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/gu)].map(
		(found): Mark => {
			const centre = moved({ x: Number(found[1]), y: Number(found[2]) });
			return [centre, centre];
		},
	);
	const bars = [...group.matchAll(/<path d="([^"]*)"/gu)].flatMap((found): Mark[] => {
		const points = pointsOf(found[1] ?? "");
		const [first, last] = [points[0], points.at(-1)];
		return first === undefined || last === undefined ? [] : [[moved(first), moved(last)]];
	});
	return [...dots, ...bars];
}

/**
 * The middle of every hop a line makes over another, on the page.
 * @param svg The rendered document.
 * @returns The hops.
 */
function hopsOf(svg: string): DrawnPoint[] {
	const shift = bodyShift(svg);
	// A line's halo repeats its hops: each place counts once.
	const places = new Map<string, DrawnPoint>();
	for (const found of svg.matchAll(/ d="([^"]+)"/gu)) {
		for (const { start, end } of roundBridges(found[1] ?? "")) {
			const hop = { x: (start.x + end.x) / 2 + shift.x, y: (start.y + end.y) / 2 + shift.y };
			places.set(`${hop.x.toFixed(1)},${hop.y.toFixed(1)}`, hop);
		}
	}
	return [...places.values()];
}

/**
 * How far a point stands from a mark.
 * @param point The point.
 * @param mark The mark.
 * @returns The distance to the nearest point of the mark.
 */
function distanceTo(point: DrawnPoint, [one, other]: Mark): number {
	const dx = other.x - one.x;
	const dy = other.y - one.y;
	const length = dx * dx + dy * dy;
	const share =
		length === 0
			? 0
			: Math.max(0, Math.min(1, ((point.x - one.x) * dx + (point.y - one.y) * dy) / length));
	return Math.hypot(point.x - (one.x + share * dx), point.y - (one.y + share * dy));
}

/**
 * The knots of a drawing: every two join marks closer than `KNOT`, and every join mark closer
 * than `HOP_REACH` to a hop.
 * @param drawing The rendered document.
 * @returns Each knot, as the places that make it.
 */
function junctionKnots(drawing: Pick<RenderedDiagram, "svg">): DrawnPoint[][] {
	const marks = marksOf(drawing.svg);
	const knots: DrawnPoint[][] = [];
	for (const [index, mark] of marks.entries()) {
		for (const other of marks.slice(index + 1)) {
			// Each mark's ends against the other's bar, both ways round, so the order the marks
			// were drawn in does not matter.
			const apart = Math.min(
				...mark.map((end) => distanceTo(end, other)),
				...other.map((end) => distanceTo(end, mark)),
			);
			if (apart < KNOT) knots.push([mark[0], other[0]]);
		}
	}
	for (const hop of hopsOf(drawing.svg)) {
		for (const mark of marks) if (distanceTo(hop, mark) < HOP_REACH) knots.push([mark[0], hop]);
	}
	return knots;
}

export { junctionKnots };
