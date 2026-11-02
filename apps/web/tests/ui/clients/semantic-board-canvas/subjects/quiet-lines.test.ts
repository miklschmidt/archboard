// When selected lines go without the ring: gold says what is chosen, so a
// selection of many lines must not turn the picture gold.

import { expect, test } from "bun:test";

import { quietLines } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** One box, which is all the atlas needs to know a subject by. */
const BOX = { x: 0, y: 0, width: 10, height: 10 };

/** Two lines: anything else is a card. */
const ATLAS = { edges: { e1: BOX, e2: BOX } };

test("one line alone keeps the ring, with the cards beside it", () => {
	const light = new Set(["a", "e1"]);
	expect(quietLines(new Set(["a", "e1"]), light, ATLAS)).toBe(false);
});

test("several lines go without it, and the light says which stand", () => {
	const selected = new Set(["a", "b", "e1", "e2"]);
	expect(quietLines(selected, selected, ATLAS)).toBe(true);
});

test("without a light the ring is all that says what is chosen", () => {
	expect(quietLines(new Set(["e1", "e2"]), null, ATLAS)).toBe(false);
});
