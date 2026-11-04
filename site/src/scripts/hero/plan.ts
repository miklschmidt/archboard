// What the hero knows of its picture, as `scripts/paint.ts` records it beside the painting: where
// each card, tray and label lies, in the picture's units, and the route of every line from its
// source to its target.

import plan from "../../paintings/hero.json";

/** The hero's picture. */
export type Plan = typeof plan;
/** A card of the picture. */
export type PlanCard = Plan["cards"][number];
/** A line of the picture. */
export type PlanLine = Plan["lines"][number];

/** A box: left, top, width and height, in the picture's units. */
export type Box = readonly number[];

export { plan };

/**
 * The parts of a box.
 * @param box The box.
 * @returns Its left, top, right and bottom edges.
 */
export function edges(box: Box): [number, number, number, number] {
	const [x = 0, y = 0, width = 0, height = 0] = box;
	return [x, y, x + width, y + height];
}

/**
 * Whether a point lies in a box.
 * @param box The box.
 * @param x Across, in the picture's units.
 * @param y Down.
 * @returns Whether it does.
 */
export function holds(box: Box, x: number, y: number): boolean {
	const [left, top, right, bottom] = edges(box);
	return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * The point a distance along a line's route.
 * @param line The line.
 * @param along The distance from its source, in the picture's units.
 * @returns The point.
 */
export function pointAlong(line: PlanLine, along: number): { x: number; y: number } {
	let walked = 0;
	let last = { x: 0, y: 0 };
	for (const piece of line.route) {
		for (let index = 2; index < piece.length; index += 2) {
			const [ax = 0, ay = 0, bx = 0, by = 0] = piece.slice(index - 2, index + 2);
			const span = Math.hypot(bx - ax, by - ay);
			if (walked + span >= along && span > 0) {
				const t = (along - walked) / span;
				return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
			}
			walked += span;
			last = { x: bx, y: by };
		}
	}
	return last;
}
