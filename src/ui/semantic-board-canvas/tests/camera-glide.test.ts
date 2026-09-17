// The path a camera glides along between two steps of a presented walkthrough.
//
// What these catch: a glide that does not start where the camera was or end
// exactly where the step's fit put it, a long move that zooms straight in and
// sweeps the destination past the reader instead of pulling back to cross, and
// a move between two views of one point that drifts sideways.

import { describe, expect, test } from "bun:test";

import { glidePath } from "@/ui/semantic-board-canvas/transitions";

const VIEWPORT = { width: 1000, height: 800 };

/**
 * The diagram point at the middle of the viewport, for a camera.
 * @param camera The camera.
 * @param camera.x Where the diagram's origin is, across.
 * @param camera.y Where it is, down.
 * @param camera.scale How magnified it is.
 * @returns The point, in diagram units.
 */
function middleOf(camera: { x: number; y: number; scale: number }): { x: number; y: number } {
	return {
		x: (VIEWPORT.width / 2 - camera.x) / camera.scale,
		y: (VIEWPORT.height / 2 - camera.y) / camera.scale,
	};
}

describe("a camera glide", () => {
	test("starts where the camera is and lands exactly where it is going", () => {
		const from = { x: 0, y: 0, scale: 1 };
		const to = { x: -2000, y: -500, scale: 1.5 };
		const path = glidePath(from, to, VIEWPORT);
		expect(path(0)).toEqual(from);
		expect(path(1)).toEqual(to);
	});

	test("pulls back to cross a long distance, and comes in again", () => {
		const from = { x: 0, y: 0, scale: 1 };
		const to = { x: -2000, y: -500, scale: 1.5 };
		const path = glidePath(from, to, VIEWPORT);
		expect(path(0.5).scale).toBeLessThan(Math.min(from.scale, to.scale));
		// And it keeps moving the same way: the middle of the view travels from
		// the start's middle towards the end's, never back.
		const across = [0, 0.25, 0.5, 0.75, 1].map((t) => middleOf(path(t)).x);
		expect(across).toEqual(across.toSorted((a, b) => a - b));
	});

	test("between two views of one point, it only zooms", () => {
		const from = { x: 0, y: 0, scale: 1 };
		const to = { x: -250, y: -200, scale: 1.5 };
		const path = glidePath(from, to, VIEWPORT);
		for (const t of [0.25, 0.5, 0.75]) {
			const middle = middleOf(path(t));
			expect(middle.x).toBeCloseTo(500, 6);
			expect(middle.y).toBeCloseTo(400, 6);
		}
		expect(path(0.5).scale).toBeGreaterThan(from.scale);
		expect(path(0.5).scale).toBeLessThan(to.scale);
	});
});
