// Reading a drawn flowchart's shapes and lines back out of its document, on
// the page: the points a path names, the outline a step's shape is drawn
// with, and every line from its start.
import { bodyShift } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";

/** A point on the page. */
interface At {
	readonly x: number;
	readonly y: number;
}

/**
 * Every point a path names, in order, on the page.
 * @param svg The drawn document.
 * @param d The path's `d`.
 * @returns The points.
 */
function pointsOf(svg: string, d: string): At[] {
	const shift = bodyShift(svg);
	return [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(([, x, y]) => ({
		x: Number(x) + shift.x,
		y: Number(y) + shift.y,
	}));
}

/**
 * The outline a step's shape is drawn with: its seat, the first path it draws.
 * @param svg The drawn document.
 * @param id The step.
 * @returns The outline's corners, clockwise, on the page.
 */
function outlineOf(svg: string, id: string): At[] {
	const step = groupOf(svg, "step", id);
	if (step === undefined) throw new Error(`step ${id} was not drawn`);
	return pointsOf(svg, /<path[^>]*\sd="([^"]*)"/.exec(step.markup)![1]!);
}

/**
 * Every line of the picture, as the points its path names, from its start.
 * @param svg The drawn document.
 * @returns The lines, on the page.
 */
function drawnLines(svg: string): At[][] {
	return [...svg.matchAll(/<g data-semantic-kind="edge"[^>]*>([\s\S]*?)<\/g>/g)].flatMap(
		([, group]) =>
			[...group!.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/g)].map(([, d]) =>
				pointsOf(svg, d!),
			),
	);
}

/**
 * How far a point is from the nearest side of an outline.
 * @param outline The outline's corners, in order.
 * @param point The point.
 * @returns The distance.
 */
function distanceToOutline(outline: readonly At[], point: At): number {
	return Math.min(
		...outline.map((from, index) => {
			const to = outline[(index + 1) % outline.length]!;
			const run = { x: to.x - from.x, y: to.y - from.y };
			const along =
				((point.x - from.x) * run.x + (point.y - from.y) * run.y) / (run.x ** 2 + run.y ** 2);
			const near = Math.min(Math.max(along, 0), 1);
			return Math.hypot(point.x - from.x - run.x * near, point.y - from.y - run.y * near);
		}),
	);
}

export { distanceToOutline, drawnLines, outlineOf, pointsOf, type At };
