// Bringing a part into view, moving the camera no further than it must.
//
// What these catch: a camera that moves for a part already in view (every click
// on the picture would nudge it), one that moves further than the part needs,
// and one that drops the part the reader was on when both fit.

import { describe, expect, test } from "bun:test";

import { revealCamera } from "#ui/rules/semantic-board-canvas/camera/reveal.ts";

const ROOM = { width: 800, height: 600 };
const MARGIN = 48;
const AT_ONE = { x: 0, y: 0, scale: 1 };

/**
 * A small part at a place in the diagram.
 * @param x Across.
 * @param y Down.
 * @returns Its rectangle.
 */
function part(x: number, y: number): { x: number; y: number; width: number; height: number } {
	return { x, y, width: 100, height: 40 };
}

describe("revealing a part", () => {
	test("moves nothing for parts that are in view", () => {
		expect(revealCamera(AT_ONE, ROOM, [part(100, 100), part(500, 300)], MARGIN)).toBeNull();
		// A part a hair over the edge still counts: a click on it must not nudge the picture.
		expect(revealCamera(AT_ONE, ROOM, [part(704, 100)], MARGIN)).toBeNull();
		expect(revealCamera(AT_ONE, ROOM, [], MARGIN)).toBeNull();
	});

	test("moves just far enough to bring a part in from the right, inside the margin", () => {
		const moved = revealCamera(AT_ONE, ROOM, [part(1000, 100)], MARGIN);
		expect(moved?.scale).toBe(1);
		// Its right edge, at 1100, ends at the margin from the room's edge, 752.
		expect(moved?.x).toBeCloseTo(752 - 1100, 6);
		expect(moved?.y).toBe(0);
	});

	test("moves just far enough from above and from the left, too", () => {
		const moved = revealCamera({ x: 0, y: 0, scale: 2 }, ROOM, [part(-300, -200)], MARGIN);
		expect(moved?.x).toBeCloseTo(MARGIN - -300 * 2, 6);
		expect(moved?.y).toBeCloseTo(MARGIN - -200 * 2, 6);
	});

	test("brings the part the reader was on along when both fit together", () => {
		const moved = revealCamera(AT_ONE, ROOM, [part(100, 100), part(900, 120)], MARGIN);
		// 100 to 1000 is 900 wide: too wide for 800 - 96, so only the last comes.
		expect(moved?.x).toBeCloseTo(752 - 1000, 6);
		const near = revealCamera(AT_ONE, ROOM, [part(300, 100), part(820, 120)], MARGIN);
		// 300 to 920 is 620 wide: both come, the left one at the margin or beyond it.
		expect(near?.x).toBeCloseTo(752 - 920, 6);
		expect(300 + (near?.x ?? 0)).toBeGreaterThanOrEqual(MARGIN);
	});

	test("centres a part bigger than the room", () => {
		const moved = revealCamera(AT_ONE, ROOM, [{ x: 2000, y: 0, width: 2000, height: 100 }], MARGIN);
		expect(moved?.x).toBeCloseTo(400 - 3000, 6);
	});
});
