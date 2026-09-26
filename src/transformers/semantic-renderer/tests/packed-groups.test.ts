// A board with groups is laid both inline and with each group packed as a
// block of its own, and the packed drawing is kept only where it reads better.
import { expect, test } from "bun:test";
import type { Placed } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { readsBetterPacked } from "@/transformers/semantic-renderer/lib/blocks/place";

/**
 * A drawing of some lines on a page.
 * @param width The page's width.
 * @param height The page's height.
 * @param lines Each line's points.
 * @returns The drawing.
 */
function drawing(width: number, height: number, lines: { x: number; y: number }[][]): Placed {
	return {
		width,
		height,
		cards: [],
		frames: [],
		regions: [],
		edges: lines.map((points, index) => ({ id: `e${index}`, points })),
	};
}

// Four level and four upright lines: crossing in a grid, or side by side.
const level = [0, 1, 2, 3].map((row) => [
	{ x: 0, y: 100 + row * 100 },
	{ x: 500, y: 100 + row * 100 },
]);
const crossing = [0, 1, 2, 3].map((column) => [
	{ x: 100 + column * 100, y: 0 },
	{ x: 100 + column * 100, y: 500 },
]);
const apart = [0, 1, 2, 3].map((column) => [
	{ x: 700 + column * 100, y: 0 },
	{ x: 700 + column * 100, y: 500 },
]);

test("a board's groups are packed where that crosses fewer lines on a page that fits no worse", () => {
	const inline = drawing(1200, 800, [...level, ...crossing]);
	expect(readsBetterPacked(drawing(1200, 800, [...level, ...apart]), inline)).toBe(true);
});

test("a board's groups stay inline where packing them fits the pane worse", () => {
	const inline = drawing(1200, 800, [...level, ...crossing]);
	expect(readsBetterPacked(drawing(1200, 1100, [...level, ...apart]), inline)).toBe(false);
});
