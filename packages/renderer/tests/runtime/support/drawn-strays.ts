// Stray lines: a line that leaves its bus, or kinks for no reason a reader can see. Lines that run
// between the same two cards the same way stand a lane from each other along their whole way; a
// line that crosses the page apart from them reads as a different exchange. A line that steps
// sideways by less than two lanes and runs on the same way reads as a kink, not a route.

import type { VariantContent } from "@archboard/model/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { corridorPoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";

/** How far apart the lines of a bus stand: the router's lane. */
const LANE = 16;

/**
 * How far a point stands from a line.
 * @param point The point.
 * @param line The line's points.
 * @returns The distance to its nearest run.
 */
function distanceTo(point: DrawnPoint, line: readonly DrawnPoint[]): number {
	let nearest = Number.POSITIVE_INFINITY;
	for (const [index, one] of line.entries()) {
		const other = line[index + 1] ?? one;
		const dx = other.x - one.x;
		const dy = other.y - one.y;
		const length = dx * dx + dy * dy;
		const share =
			length === 0
				? 0
				: Math.max(0, Math.min(1, ((point.x - one.x) * dx + (point.y - one.y) * dy) / length));
		nearest = Math.min(
			nearest,
			Math.hypot(point.x - (one.x + share * dx), point.y - (one.y + share * dy)),
		);
	}
	return nearest;
}

/** Up to this, a sideways step reads as a kink in one line, not a route: two lanes. */
const KINK = 2 * LANE;

/**
 * The straight runs of a line, each upright or level, with where it stands across.
 * @param points The line's points, its bridges taken out.
 * @returns Its runs, in order.
 */
function straightRuns(
	points: readonly DrawnPoint[],
): { upright: boolean; at: number; length: number }[] {
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const [dx, dy] = [Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)];
		if (dy > 1 && dx < 0.01) return [{ upright: true, at: point.x, length: dy }];
		return dx > 1 && dy < 0.01 ? [{ upright: false, at: point.y, length: dx }] : [];
	});
}

/**
 * The kinks of a drawing: every line that runs on the same way after stepping sideways by less
 * than `KINK`, two runs on one axis with no run longer than a kink between them.
 * @param drawing The rendered document.
 * @returns Each kinked line's id, once per kink.
 */
function kinksOf(drawing: Pick<RenderedDiagram, "svg">): string[] {
	const kinks: string[] = [];
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const runs = straightRuns(points);
		for (const [index, run] of runs.entries()) {
			const next = runs.slice(index + 1).find((one) => one.upright === run.upright);
			if (next === undefined) continue;
			const between = runs.slice(index + 1, runs.indexOf(next));
			const step = Math.abs(next.at - run.at);
			if (step > 0.5 && step < KINK && between.every((one) => one.length < KINK)) kinks.push(id);
		}
	}
	return kinks;
}

/**
 * The split buses of a drawing: every two lines between the same two cards the same way, one of
 * which strays further from the other than the bus is wide.
 * @param drawing The rendered document.
 * @param content The document.
 * @returns Each split pair, by the ids of its lines.
 */
function splitBuses(drawing: Pick<RenderedDiagram, "svg">, content: VariantContent): string[] {
	const routes = corridorPoints(drawing.svg);
	const buses = new Map<string, string[]>();
	for (const edge of content.edges) {
		if (!routes.has(edge.id)) continue;
		const key = `${edge.from}>${edge.to}`;
		buses.set(key, [...(buses.get(key) ?? []), edge.id]);
	}
	const split: string[] = [];
	for (const lines of buses.values()) {
		const wide = LANE * (lines.length + 1);
		for (const [index, one] of lines.entries()) {
			for (const other of lines.slice(index + 1)) {
				const [a, b] = [routes.get(one)!, routes.get(other)!];
				const apart = Math.max(
					...a.map((point) => distanceTo(point, b)),
					...b.map((point) => distanceTo(point, a)),
				);
				if (apart > wide) split.push(`${one} ${other}`);
			}
		}
	}
	return split;
}

/**
 * The stray lines of a drawing: every pair split from its bus, and every kink.
 * @param drawing The rendered document.
 * @param content The document.
 * @returns Each stray, as the line or pair of lines it is.
 */
function strayLines(drawing: Pick<RenderedDiagram, "svg">, content: VariantContent): string[] {
	return [...splitBuses(drawing, content), ...kinksOf(drawing)];
}

export { splitBuses, strayLines };
