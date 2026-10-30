// Reading the lines back off a rendered document, in the same coordinates the
// atlas is written in.
//
// Like `drawn-text.ts`, this takes the SVG at its word: it reads the shift the
// document puts its whole body under rather than being told what it was, so a
// route and the box it is checked against are compared in one frame of
// reference or not at all.

import type { DiagramBox } from "@archboard/board/render-reply";

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
	// Only the groups immediately after the document background move the body: a
	// planned frame's or a title band's (`translate(16 24)`, after the slot that
	// draws the frame or the title), then the canvas shift (`translate(x,y)`), each
	// opening inside the one before. A standing pin has its own translation inside
	// a subject further down.
	const background = /<\/defs>\s*<rect[^>]*\/>\s*/g;
	if (background.exec(svg) === null) return { x: 0, y: 0 };
	const step =
		/(?:<g data-slot="(?:planned-frame|export-title)">[\s\S]*?<\/g>\s*)?<g transform="translate\((-?[\d.]+)[ ,](-?[\d.]+)\)">\s*/y;
	step.lastIndex = background.lastIndex;
	let x = 0;
	let y = 0;
	for (let found = step.exec(svg); found !== null; found = step.exec(svg)) {
		x += Number(found[1] ?? 0);
		y += Number(found[2] ?? 0);
	}
	return { x, y };
}

/**
 * A rendered path's points, including curve controls and relative message ends.
 * @param d The `d` attribute.
 * @returns The points it passes through, including its control points.
 */
function pointsOf(d: string): DrawnPoint[] {
	const points: DrawnPoint[] = [];
	for (const [, command, values] of d.matchAll(/([MLCQHVAhvaZz])([^MLCQHVAhvaZz]*)/gu)) {
		const numbers = (values!.match(/-?[\d.]+/gu) ?? []).map(Number);
		const last = points.at(-1) ?? { x: 0, y: 0 };
		if (command === "H" || command === "h") {
			points.push({ x: numbers[0]! + (command === "h" ? last.x : 0), y: last.y });
		} else if (command === "V" || command === "v") {
			points.push({ x: last.x, y: numbers[0]! + (command === "v" ? last.y : 0) });
		} else if (command === "A" || command === "a") {
			// Arc radii and flags are not positions on the route.
			points.push({
				x: numbers.at(-2)! + (command === "a" ? last.x : 0),
				y: numbers.at(-1)! + (command === "a" ? last.y : 0),
			});
		} else {
			for (let index = 0; index < numbers.length; index += 2)
				points.push({ x: numbers[index]!, y: numbers[index + 1]! });
		}
	}
	return points;
}

/**
 * Where each drawn route ends, on the page.
 *
 * The last point of a route's own path is where its arrowhead stands.
 * @param svg The rendered document.
 * @param kind Which sort of subject to read: `edge` in the architecture grammar, `step` in the sequence one.
 * @returns Each route's arrival point, by the id of the subject that drew it.
 */
function routeEnds(svg: string, kind: "edge" | "step" = "edge"): Map<string, DrawnPoint> {
	return new Map(
		[...routePoints(svg, kind)].flatMap(([id, points]) => {
			const last = points.at(-1);
			return last === undefined ? [] : [[id, last] as const];
		}),
	);
}

/**
 * Every point each drawn route passes through, on the page.
 *
 * The control points of the curve as well as its corners. A cubic stays inside
 * the hull of its own control points, so the polyline through all of them is a
 * faithful stand-in for the ink when the question is "does this line go through
 * that box".
 * @param svg The rendered document.
 * @param kind The semantic subject that carries each route.
 * @returns Each route's points, by subject id.
 */
function routePoints(svg: string, kind: "edge" | "step" = "edge"): Map<string, DrawnPoint[]> {
	const shift = bodyShift(svg);
	const paths = new Map<string, DrawnPoint[]>();
	for (const group of svg.matchAll(
		new RegExp(
			`<g data-semantic-kind="${kind}" data-semantic-id="([^"]+)"[^>]*>([\\s\\S]*?)</g>`,
			"g",
		),
	)) {
		const drawn = [...(group[2] ?? "").matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/g)];
		// Labels repeat the subject's ID. The arrow or the line group's explicit
		// headless treatment identifies its route, rather than a warning glyph.
		const path =
			drawn.at(-1)?.[1] ??
			(/^<g[^>]*data-arrowhead="none"/u.test(group[0])
				? /<path(?![^>]*class=)[^>]*\sd="([^"]*)"/u.exec(group[2] ?? "")?.[1]
				: undefined);
		if (path === undefined) continue;
		paths.set(
			group[1] ?? "",
			pointsOf(path).map((point) => ({
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
 * @param kind The semantic subject that carries each route.
 * @returns Each route's points before its crossing decorations.
 */
function corridorPoints(svg: string, kind: "edge" | "step" = "edge"): Map<string, DrawnPoint[]> {
	const corridors = svg.replace(/ d="([^"]+)"/gu, (attribute, path: string) => {
		let corridor = path;
		for (const bridge of roundBridges(path)) corridor = corridor.replaceAll(bridge.span, "");
		return attribute.replace(path, corridor);
	});
	return new Map(
		[...routePoints(corridors, kind)].map(([id, points]) => [id, withoutSeams(points)]),
	);
}

/**
 * A route with the seams a removed bridge leaves taken out: points up to a
 * unit off the run they sit on, which are neither turns nor lengths a
 * reader follows.
 * @param points The route after its bridges were cut out.
 * @returns The route with each such point dropped or put back on its run.
 */
function withoutSeams(points: readonly DrawnPoint[]): DrawnPoint[] {
	const seam = 1;
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
	// SVG coordinates have two decimals. Adding a box's size can put an exact
	// boundary attachment a floating-point rounding error inside that box.
	const rounding = 1e-6;
	return (
		Math.min(one.x, other.x) < box.x + box.width - rounding &&
		Math.max(one.x, other.x) > box.x + rounding &&
		Math.min(one.y, other.y) < box.y + box.height - rounding &&
		Math.max(one.y, other.y) > box.y + rounding
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
 * The stretches of ink two drawn routes share: each run of the first
 * route's segments that lie on the second, within a point, as its length.
 * @param one A route's points.
 * @param other Another's.
 * @returns Each shared stretch's length, in order along the first route.
 */
function sharedStretches(one: readonly DrawnPoint[], other: readonly DrawnPoint[]): number[] {
	const on = (point: DrawnPoint): boolean =>
		other.slice(1).some((next, index) => distanceToSegment(point, other[index]!, next) < 1);
	const stretches: number[] = [];
	let open = false;
	one.slice(1).forEach((next, index) => {
		const last = one[index]!;
		const shared =
			on(last) && on({ x: (last.x + next.x) / 2, y: (last.y + next.y) / 2 }) && on(next);
		if (shared && !open) stretches.push(0);
		if (shared) stretches.push(stretches.pop()! + Math.hypot(next.x - last.x, next.y - last.y));
		open = shared;
	});
	return stretches.filter((length) => length > 1);
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

/**
 * The corners of a drawn line: its ends, and where each straight run meets
 * the next square to it, with its rounded turns taken out.
 * @param points The drawn points, curve controls included.
 * @returns The corners.
 */
function cornersOf(points: readonly DrawnPoint[]): DrawnPoint[] {
	const runs = points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const [dx, dy] = [Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)];
		if (dx > 1 && dy < 0.01) return [{ vertical: false, at: point.y }];
		return dy > 1 && dx < 0.01 ? [{ vertical: true, at: point.x }] : [];
	});
	const turns = runs.slice(1).flatMap((run, index) => {
		const previous = runs[index]!;
		if (run.vertical === previous.vertical) return [];
		return [run.vertical ? { x: run.at, y: previous.at } : { x: previous.at, y: run.at }];
	});
	return [points[0]!, ...turns, points.at(-1)!];
}

/**
 * How many times a route turns: its points off the straight line through
 * their neighbours.
 * @param points The route's corridor.
 * @returns Its turns.
 */
function turnsOf(points: readonly DrawnPoint[]): number {
	return points.slice(1, -1).filter((point, index) => {
		const [before, after] = [points[index]!, points[index + 2]!];
		const straight =
			(before.x === point.x && point.x === after.x) ||
			(before.y === point.y && point.y === after.y);
		return !straight;
	}).length;
}

/**
 * A route's runs, each from one point to the next.
 * @param points The route.
 * @returns Its runs.
 */
function runsBetween(points: readonly DrawnPoint[]): (readonly [DrawnPoint, DrawnPoint])[] {
	return points.slice(1).map((to, index) => [points[index]!, to] as const);
}

/**
 * Whether a value lies strictly between two others, half a unit in.
 * @param value The value.
 * @param one One bound.
 * @param other The other.
 * @returns True when it does.
 */
function strictlyBetween(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 0.5 && value < Math.max(one, other) - 0.5;
}

/**
 * Whether two drawn routes cross at a right angle, strictly inside both runs.
 * @param one A route's corridor.
 * @param other Another's.
 * @returns True when they do.
 */
function routesCross(one: readonly DrawnPoint[], other: readonly DrawnPoint[]): boolean {
	return runsBetween(one).some(([from, to]) =>
		runsBetween(other).some(([start, end]) => {
			const [level, upright] =
				from.y === to.y
					? [
							[from, to],
							[start, end],
						]
					: [
							[start, end],
							[from, to],
						];
			return (
				level[0]!.y === level[1]!.y &&
				upright[0]!.x === upright[1]!.x &&
				strictlyBetween(upright[0]!.x, level[0]!.x, level[1]!.x) &&
				strictlyBetween(level[0]!.y, upright[0]!.y, upright[1]!.y)
			);
		}),
	);
}

export {
	type DrawnPoint,
	cornersOf,
	bodyShift,
	boxesOverlap,
	corridorPoints,
	roundBridges,
	distanceToFrame,
	distanceToRoute,
	pointsOf,
	routeCrosses,
	routeEnds,
	routeLabels,
	routePoints,
	routesCross,
	sharedStretches,
	turnsOf,
};
