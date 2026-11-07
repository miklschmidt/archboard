// Where a tip stands: against its part, with what the part lights in view.

import { expect, test } from "bun:test";

import {
	DIM_WORTH,
	LINE_WORTH,
	LIT_WORTH,
	tipSpot,
	type ScreenBox,
	type TipGround,
} from "#ui/architecture-drawing/canvas/picture/rules/tip-spot.ts";

const PANE: ScreenBox = { left: 0, top: 0, right: 1600, bottom: 1000 };
const PART: ScreenBox = { left: 700, top: 480, right: 860, bottom: 540 };
const SIZE = { width: 300, height: 100 };

/**
 * A box from its corner and size.
 * @param left Its left edge.
 * @param top Its top edge.
 * @param width Its width.
 * @param height Its height.
 * @returns The box.
 */
function boxAt(left: number, top: number, width: number, height: number): ScreenBox {
	return { left, top, right: left + width, bottom: top + height };
}

/**
 * A lit line, read every 24 px along its length.
 * @param from Where it starts, on the left.
 * @param to Where it ends, on the right.
 * @param y How far down it runs.
 * @returns Its reads.
 */
function litLine(from: number, to: number, y: number): readonly TipGround[] {
	return Array.from({ length: Math.ceil((to - from) / 24) }, (_, read) => ({
		box: boxAt(from + read * 24, y - 12, 24, 24),
		worth: LINE_WORTH,
	}));
}

/**
 * The tip's box where it stands.
 * @param ground What it would hide.
 * @param part The part it is about.
 * @returns The box.
 */
function tipOver(ground: readonly TipGround[] = [], part: ScreenBox = PART): ScreenBox {
	const spot = tipSpot({ part, size: SIZE, pane: PANE, ground });
	return boxAt(spot.left, spot.top, SIZE.width, SIZE.height);
}

/**
 * Whether two boxes overlap.
 * @param a One box.
 * @param b The other.
 * @returns True when they share any area.
 */
function overlap(a: ScreenBox, b: ScreenBox): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test("on open ground a tip stands against its part", () => {
	const tip = tipOver();
	expect(tip.left - PART.right).toBe(10);
	expect((tip.top + tip.bottom) / 2).toBe((PART.top + PART.bottom) / 2);
});

test("a tip leaves the side that the lit lines leave from", () => {
	const lit = litLine(PART.right, 1500, 510);
	const tip = tipOver(lit);
	expect(lit.some((read) => overlap(tip, read.box))).toBe(false);
	expect(overlap(tip, PART)).toBe(false);
});

test("a tip hides a dim part before a lit one", () => {
	const dim = boxAt(380, 370, 310, 280);
	const lit = [boxAt(870, 0, 730, 1000), boxAt(0, 0, 870, 370), boxAt(0, 650, 870, 350)];
	const tip = tipOver([
		...lit.map((box) => ({ box, worth: LIT_WORTH })),
		{ box: dim, worth: DIM_WORTH },
	]);
	expect(overlap(tip, dim)).toBe(true);
	expect(lit.some((box) => overlap(tip, box))).toBe(false);
});

test("a tip stays near and crosses a lit line, rather than stray far from its part", () => {
	const ring = [400, 620].flatMap((y) => litLine(0, 1600, y));
	const walls = [560, 1000].flatMap((x) =>
		Array.from({ length: 28 }, (_, read) => ({
			box: boxAt(x - 12, read * 24 + 300, 24, 24),
			worth: LINE_WORTH,
		})),
	);
	const tip = tipOver([...ring, ...walls]);
	const away = Math.max(
		tip.left - PART.right,
		PART.left - tip.right,
		tip.top - PART.bottom,
		PART.top - tip.bottom,
	);
	expect(away).toBeLessThan(200);
});

test("a part at the edge of the pane keeps its tip inside the pane and off the part", () => {
	const part = boxAt(1440, 900, 150, 90);
	const tip = tipOver([], part);
	expect(tip.right).toBeLessThanOrEqual(PANE.right);
	expect(tip.bottom).toBeLessThanOrEqual(PANE.bottom);
	expect(overlap(tip, part)).toBe(false);
});

test("a tip too big for its pane stands at the pane's top left", () => {
	const spot = tipSpot({
		part: PART,
		size: { width: 2000, height: 1200 },
		pane: PANE,
		ground: [],
	});
	expect(spot).toEqual({ left: 12, top: 12 });
});
