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
	// Only the group immediately after the document background moves the body.
	// A standing pin has its own translation inside a subject further down.
	const found =
		/<\/defs>\s*<rect[^>]*\/>\s*<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)">/.exec(svg);
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
		const drawn = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/g)];
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
		const drawn = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/g)];
		// A relationship is drawn as more than one group — its route, and the words
		// it says on the layer above every route. Only the arrow-bearing path is
		// a route; warning glyphs in the words group must not replace it.
		if (drawn.length === 0) {
			continue;
		}
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
 * Recognize two circular quarter-arcs, optionally joined by a level crest.
 * Ordinary route corners do not leave and return to the same straight line.
 * @param path A rendered route's path commands.
 * @returns The exact inserted spans and their control points.
 */
function roundBridges(path: string) {
	// Look ahead so a preceding rounded corner cannot consume the bridge's first cubic.
	return [...path.matchAll(/(?=( L[-\d.,]+ C[-\d., ]+(?: L[-\d.,]+)? C[-\d., ]+))/gu)].flatMap(
		(match) => {
			const span = match[1]!.trimEnd();
			const points = pointsOf(span);
			if (points.length !== 7 && points.length !== 8) return [];
			const start = points[0]!;
			const end = points.at(-1)!;
			if ((start.x === end.x) === (start.y === end.y)) return [];
			const horizontal = start.y === end.y;
			const direction = Math.sign(horizontal ? end.x - start.x : end.y - start.y);
			const local = points.map((point) => ({
				x: direction * (horizontal ? point.x - start.x : point.y - start.y),
				y: horizontal ? point.y - start.y : point.x - start.x,
			}));
			const radius = Math.abs(local[3]!.y);
			// Crossing arcs are seven units; ordinary route corners are larger.
			if (Math.abs(radius - 7) > 0.03) return [];
			const lift = Math.sign(local[3]!.y);
			const width = local.at(-1)!.x;
			const kappa = (4 * (Math.sqrt(2) - 1)) / 3;
			const expected = [
				[0, 0],
				[0, kappa * radius],
				[(1 - kappa) * radius, radius],
				[radius, radius],
				...(points.length === 8 ? [[width - radius, radius]] : []),
				[width - (1 - kappa) * radius, radius],
				[width, kappa * radius],
				[width, 0],
			];
			if (
				width < 2 * radius - 0.03 ||
				!local.every(
					(point, index) =>
						Math.abs(point.x - expected[index]![0]!) < 0.03 &&
						Math.abs(lift * point.y - expected[index]![1]!) < 0.03,
				)
			)
				return [];
			return [{ span, points, start, end }];
		},
	);
}

/**
 * Read routing corridors without circular crossing hops.
 * This is only for corridor comparisons: clearance checks use the actual ink.
 * @param svg The rendered document.
 * @returns Each route's points before its crossing decorations.
 */
function corridorPoints(svg: string): Map<string, DrawnPoint[]> {
	const corridors = svg.replace(/ d="([^"]+)"/gu, (attribute, path: string) => {
		let corridor = path;
		for (const bridge of roundBridges(path)) corridor = corridor.replaceAll(bridge.span, "");
		return attribute.replace(path, corridor);
	});
	return new Map([...routePoints(corridors)].map(([id, points]) => [id, withoutSeams(points)]));
}

/**
 * A route with the seams a removed bridge leaves taken out: points a fraction
 * of a unit off the run they sit on, which are neither turns nor lengths a
 * reader follows.
 * @param points The route after its bridges were cut out.
 * @returns The route with each such point dropped or put back on its run.
 */
function withoutSeams(points: readonly DrawnPoint[]): DrawnPoint[] {
	const seam = 0.5;
	const kept: DrawnPoint[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		if (last === undefined) {
			kept.push(point);
			continue;
		}
		const x = Math.abs(point.x - last.x) < seam ? last.x : point.x;
		const y = Math.abs(point.y - last.y) < seam ? last.y : point.y;
		if (x !== last.x || y !== last.y) kept.push({ ...point, x, y });
	}
	return kept;
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

/**
 * Where each drawn label pill ended up, on the page. A relationship is drawn as
 * two groups under one id, so the pill comes from the one holding a rect.
 * @param svg The rendered document.
 * @returns Each labelled subject's pill box, by the id of the subject that drew it.
 */
function routeLabels(svg: string): Map<string, DiagramBox> {
	const shift = bodyShift(svg);
	const pills = new Map<string, DiagramBox>();
	for (const group of svg.matchAll(
		/<g data-semantic-kind="(?:edge|step)" data-semantic-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
	)) {
		const rect = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
			group[2] ?? "",
		);
		if (rect === null) {
			continue;
		}
		pills.set(group[1] ?? "", {
			x: Number(rect[1]) + shift.x,
			y: Number(rect[2]) + shift.y,
			width: Number(rect[3]),
			height: Number(rect[4]),
		});
	}
	return pills;
}

/**
 * How far a box is from a drawn route: zero when the route passes through it.
 * Measured to the polyline through the route's points, control points included,
 * as `routeCrosses` does.
 * @param box The box.
 * @param points The route's points, in order.
 * @returns The distance, or Infinity for a route with no segment at all.
 */
function distanceToRoute(box: DiagramBox, points: readonly DrawnPoint[]): number {
	const corners: DrawnPoint[] = [
		{ x: box.x, y: box.y },
		{ x: box.x + box.width, y: box.y },
		{ x: box.x + box.width, y: box.y + box.height },
		{ x: box.x, y: box.y + box.height },
		{ x: box.x + box.width / 2, y: box.y },
		{ x: box.x + box.width / 2, y: box.y + box.height },
		{ x: box.x, y: box.y + box.height / 2 },
		{ x: box.x + box.width, y: box.y + box.height / 2 },
	];
	let nearest = Number.POSITIVE_INFINITY;
	points.forEach((point, index) => {
		const next = points[index + 1];
		if (next === undefined) {
			return;
		}
		if (segmentMeets(point, next, box)) {
			nearest = 0;
		}
		for (const corner of corners) {
			nearest = Math.min(nearest, distanceToSegment(corner, point, next));
		}
	});
	return nearest;
}

/**
 * How far a point is from a line segment.
 * @param point The point.
 * @param one One end of the segment.
 * @param other The other end.
 * @returns The distance.
 */
function distanceToSegment(point: DrawnPoint, one: DrawnPoint, other: DrawnPoint): number {
	const run = { x: other.x - one.x, y: other.y - one.y };
	const length = run.x * run.x + run.y * run.y;
	const along =
		length === 0
			? 0
			: Math.min(Math.max(((point.x - one.x) * run.x + (point.y - one.y) * run.y) / length, 0), 1);
	return Math.hypot(point.x - (one.x + run.x * along), point.y - (one.y + run.y * along));
}

/**
 * Whether two boxes overlap.
 * @param one One box.
 * @param other The other.
 * @returns True when they share any area.
 */
function boxesOverlap(one: DiagramBox, other: DiagramBox): boolean {
	return (
		one.x < other.x + other.width &&
		other.x < one.x + one.width &&
		one.y < other.y + other.height &&
		other.y < one.y + one.height
	);
}

export {
	type DrawnPoint,
	bodyShift,
	boxesOverlap,
	corridorPoints,
	roundBridges,
	distanceToFrame,
	distanceToRoute,
	routeCrosses,
	routeEnds,
	routeLabels,
	routePoints,
};
