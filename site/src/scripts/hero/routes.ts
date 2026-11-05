// The routes of the picture's lines as the table's shader reads them. Each line is a beam of light
// that floats above its route, so every pixel near one must know which beam it sees, how far off,
// and how far along it. The routes become straight runs in one texture, and a grid over the
// picture names, for each of its cells, every run whose light reaches it. A ray reads the cells it
// crosses on its way down through the beams, so it reads a few runs instead of every one, and
// never misses one whose light reaches it.

import type { Plan } from "./plan";

/** How many texels wide each texture is. */
export const ROUTE_TEXELS = 1024;

/** How wide a cell of the grid is, in the picture's units. */
export const CELL = 16;

/** How far a beam's light reaches from its axis, in the picture's units: its smoke is gone by then. */
export const SHINE = 24;

/** How far a beam takes to rise from its tile to its own height at each end, in the picture's units. */
export const RAMP = 32;

/** How far a straight run may pass from the points of a bend it stands for, in the picture's units. */
const STRAY = 0.25;

/** A point of the picture, in its units. */
interface Point {
	x: number;
	y: number;
}

/** The routes, ready to load into two float textures. */
export interface Routes {
	/**
	 * Three texels a run: its ends; where it starts along its line, its length and the line; and
	 * where the straight stretch it lies on starts along the line, and how long that is.
	 */
	readonly runs: Float32Array;
	readonly runRows: number;
	/** `stride` texels a cell, each run's number or -1 after the last. */
	readonly grid: Float32Array;
	readonly gridRows: number;
	/** How many texels each cell takes: as many as the fullest cell needs. */
	readonly stride: number;
	/** How many cells across and down the grid has. */
	readonly cells: readonly [number, number];
}

/**
 * Cut the routes into runs and grid them.
 * @param plan The picture.
 * @returns The textures' contents.
 */
export function buildRoutes(plan: Plan): Routes {
	const runs: number[][] = [];
	plan.lines.forEach((line, index) => {
		// A beam's height follows a curve near each end, so the runs there are short enough to follow it.
		const cuts = [0.25, 0.5, 0.75, 1].flatMap((part) => [RAMP * part, line.length - RAMP * part]);
		let along = 0;
		for (const piece of line.route) {
			const points: Point[] = [];
			for (let at = 0; at + 1 < piece.length; at += 2)
				points.push({ x: piece[at] ?? 0, y: piece[at + 1] ?? 0 });
			// A straight stretch is a row of legs that keep one heading: a bend ends it.
			const legs: {
				a: Point;
				b: Point;
				span: number;
				stretch: { from: number; length: number };
			}[] = [];
			let stretch = { from: along, length: 0 };
			let heading = { x: 0, y: 0 };
			for (const [a, b] of pairs(straighten(points))) {
				const span = Math.hypot(b.x - a.x, b.y - a.y);
				if (span < 1e-3) continue;
				const way = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
				if (way.x * heading.x + way.y * heading.y < 0.9998)
					stretch = { from: stretch.from + stretch.length, length: 0 };
				stretch.length += span;
				heading = way;
				legs.push({ a, b, span, stretch });
			}
			for (const { a, b, span, stretch } of legs) {
				const within = cuts.filter((cut) => cut > along + 0.5 && cut < along + span - 0.5);
				const marks = [0, ...within.map((cut) => (cut - along) / span).sort((x, y) => x - y), 1];
				for (const [from, to] of pairs(marks)) {
					runs.push([
						a.x + (b.x - a.x) * from,
						a.y + (b.y - a.y) * from,
						a.x + (b.x - a.x) * to,
						a.y + (b.y - a.y) * to,
						along + span * from,
						span * (to - from),
						index,
						0,
						stretch.from,
						stretch.length,
						0,
						0,
					]);
				}
				along += span;
			}
		}
	});

	const across = Math.ceil(plan.width / CELL);
	const down = Math.ceil(plan.height / CELL);
	const cells: number[][] = Array.from({ length: across * down }, () => []);
	runs.forEach(([ax = 0, ay = 0, bx = 0, by = 0], run) => {
		const [left, right] = [Math.min(ax, bx) - SHINE, Math.max(ax, bx) + SHINE];
		const [top, bottom] = [Math.min(ay, by) - SHINE, Math.max(ay, by) + SHINE];
		for (
			let y = Math.max(0, Math.floor(top / CELL));
			y <= Math.min(down - 1, Math.floor(bottom / CELL));
			y++
		) {
			for (
				let x = Math.max(0, Math.floor(left / CELL));
				x <= Math.min(across - 1, Math.floor(right / CELL));
				x++
			) {
				// A run is named by every cell that holds a point its light reaches.
				const middle = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
				if (distance(middle, ax, ay, bx, by) > SHINE + CELL * 0.71) continue;
				cells[y * across + x]?.push(run);
			}
		}
	});
	const runTexels = runs.length * 3;
	const runRows = Math.max(1, Math.ceil(runTexels / ROUTE_TEXELS));
	const runData = new Float32Array(runRows * ROUTE_TEXELS * 4);
	runs.forEach((run, index) => runData.set(run, index * 12));

	const stride = Math.max(1, Math.ceil(Math.max(...cells.map((list) => list.length)) / 4));
	const gridRows = Math.max(1, Math.ceil((cells.length * stride) / ROUTE_TEXELS));
	const gridData = new Float32Array(gridRows * ROUTE_TEXELS * 4).fill(-1);
	cells.forEach((list, cell) => gridData.set(list, cell * stride * 4));
	return { runs: runData, runRows, grid: gridData, gridRows, stride, cells: [across, down] };
}

/**
 * Each item of a list beside the next.
 * @param items The list.
 * @returns The pairs.
 */
function pairs<T>(items: readonly T[]): [T, T][] {
	return items.slice(1).map((item, index) => [items[index] as T, item]);
}

/**
 * A route's points with each bend kept as the fewest straight runs that pass within STRAY of it.
 * @param points The points.
 * @returns The points kept.
 */
function straighten(points: readonly Point[]): Point[] {
	const first = points[0];
	if (!first || points.length < 3) return [...points];
	const kept = [first];
	let anchor = 0;
	for (let index = 2; index < points.length; index++) {
		const [a = first, b = first] = [points[anchor], points[index]];
		const fits = points
			.slice(anchor + 1, index)
			.every((point) => distance(point, a.x, a.y, b.x, b.y) <= STRAY);
		if (!fits) {
			anchor = index - 1;
			kept.push(points[anchor] ?? first);
		}
	}
	kept.push(points.at(-1) ?? first);
	return kept;
}

/**
 * How far a point lies from a straight run.
 * @param point The point.
 * @param ax The run's start, across.
 * @param ay Its start, down.
 * @param bx Its end, across.
 * @param by Its end, down.
 * @returns The distance.
 */
function distance(point: Point, ax: number, ay: number, bx: number, by: number): number {
	const [dx, dy] = [bx - ax, by - ay];
	const span = dx * dx + dy * dy;
	const t =
		span > 0 ? Math.min(1, Math.max(0, ((point.x - ax) * dx + (point.y - ay) * dy) / span)) : 0;
	return Math.hypot(ax + dx * t - point.x, ay + dy * t - point.y);
}
