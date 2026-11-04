// The routes of the picture's lines as the table's shader reads them. Light travels along a line,
// so every pixel near one must know which line it lies on, how far from it, and how far along it.
// The routes become straight runs in one texture, and a grid over the picture names, for each of
// its cells, the runs that pass near it, so a pixel reads a few runs instead of every one.

import type { Plan } from "./plan";

/** How many texels wide each texture is. */
export const ROUTE_TEXELS = 1024;

/** How many runs one cell of the grid names at most. The shader's SLOTS. */
export const SLOTS = 12;

/** How wide a cell of the grid is, in the picture's units. */
export const CELL = 16;

/** How near a pixel must be to a run for its light to reach it, in the picture's units. */
export const REACH = 36;

/** The routes, ready to load into two float textures. */
export interface Routes {
	/** Two texels a run: its ends, then where it starts along its line, its length and the line. */
	readonly runs: Float32Array;
	readonly runRows: number;
	/** SLOTS / 4 texels a cell, each run's number or -1. */
	readonly grid: Float32Array;
	readonly gridRows: number;
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
		let along = 0;
		for (const piece of line.route) {
			for (let at = 2; at < piece.length; at += 2) {
				const [ax = 0, ay = 0, bx = 0, by = 0] = piece.slice(at - 2, at + 2);
				const span = Math.hypot(bx - ax, by - ay);
				if (span < 1e-3) continue;
				runs.push([ax, ay, bx, by, along, span, index, 0]);
				along += span;
			}
		}
	});

	const across = Math.ceil(plan.width / CELL);
	const down = Math.ceil(plan.height / CELL);
	const cells: number[][] = Array.from({ length: across * down }, () => []);
	runs.forEach(([ax = 0, ay = 0, bx = 0, by = 0], run) => {
		const [left, right] = [Math.min(ax, bx) - REACH, Math.max(ax, bx) + REACH];
		const [top, bottom] = [Math.min(ay, by) - REACH, Math.max(ay, by) + REACH];
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
				// A cell keeps the runs that pass nearest its middle when more than SLOTS reach it.
				const middle = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
				const near = distance(middle, ax, ay, bx, by);
				if (near > REACH + CELL * 0.71) continue;
				cells[y * across + x]?.push(run);
			}
		}
	});
	cells.forEach((list, cell) => {
		if (list.length <= SLOTS) return;
		const middle = {
			x: ((cell % across) + 0.5) * CELL,
			y: (Math.floor(cell / across) + 0.5) * CELL,
		};
		const near = (run: number) => {
			const [ax = 0, ay = 0, bx = 0, by = 0] = runs[run] ?? [];
			return distance(middle, ax, ay, bx, by);
		};
		list.sort((one, other) => near(one) - near(other));
		list.length = SLOTS;
	});

	const runTexels = runs.length * 2;
	const runRows = Math.max(1, Math.ceil(runTexels / ROUTE_TEXELS));
	const runData = new Float32Array(runRows * ROUTE_TEXELS * 4);
	runs.forEach((run, index) => runData.set(run, index * 8));

	const perCell = SLOTS / 4;
	const gridRows = Math.max(1, Math.ceil((cells.length * perCell) / ROUTE_TEXELS));
	const gridData = new Float32Array(gridRows * ROUTE_TEXELS * 4).fill(-1);
	cells.forEach((list, cell) => {
		list.forEach((run, slot) => {
			gridData[cell * perCell * 4 + slot] = run;
		});
	});
	return { runs: runData, runRows, grid: gridData, gridRows, cells: [across, down] };
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
function distance(
	point: { x: number; y: number },
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const [dx, dy] = [bx - ax, by - ay];
	const span = dx * dx + dy * dy;
	const t =
		span > 0 ? Math.min(1, Math.max(0, ((point.x - ax) * dx + (point.y - ay) * dy) / span)) : 0;
	return Math.hypot(ax + dx * t - point.x, ay + dy * t - point.y);
}
