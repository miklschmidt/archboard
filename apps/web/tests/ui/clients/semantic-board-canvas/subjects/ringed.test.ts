// Who wears the selection ring: gold says what is chosen, so a selection of many
// lines must not turn the picture gold.

import { expect, test } from "bun:test";

import { ringed } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** One box, which is all the atlas needs to know a subject by. */
const BOX = { x: 0, y: 0, width: 10, height: 10 };

/** Two lines: anything else is a card. */
const ATLAS = { edges: { e1: BOX, e2: BOX } };

test("a line picked alone wears the ring, with the cards beside it", () => {
	const light = new Set(["a", "e1"]);
	expect([...ringed(new Set(["a", "e1"]), light, ATLAS)].toSorted()).toEqual(["a", "e1"]);
});

test("several lines leave the ring to the cards, and the light says which stand", () => {
	const selected = new Set(["a", "b", "e1", "e2"]);
	expect([...ringed(selected, selected, ATLAS)].toSorted()).toEqual(["a", "b"]);
});

test("without a light the ring is all that says what is chosen", () => {
	const selected = new Set(["e1", "e2"]);
	expect([...ringed(selected, null, ATLAS)].toSorted()).toEqual(["e1", "e2"]);
});
