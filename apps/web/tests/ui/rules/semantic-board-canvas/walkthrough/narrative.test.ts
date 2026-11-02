// What a beat lights, and how strongly.
//
// What these catch: a beat about a card that leaves what the card is wired to in
// the dark, a beat about a line that lights more than its ends, and a sequence
// that lights no message of the participants a beat names.

import { expect, test } from "bun:test";

import {
	beatFocus,
	beatLight,
	type FocusSource,
} from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";

const BOX = { x: 0, y: 0, width: 10, height: 10 };

/**
 * The same box for each of some subjects.
 * @param ids The subjects.
 * @returns Their boxes.
 */
function boxes(ids: readonly string[]): Record<string, typeof BOX> {
	return Object.fromEntries(ids.map((id) => [id, BOX]));
}

/**
 * A picture that draws these subjects.
 * @param nodes Its cards.
 * @param edges Its lines.
 * @returns Where it drew them.
 */
function pictureOf(nodes: readonly string[], edges: readonly string[]): FocusSource {
	return {
		atlas: { nodes: boxes(nodes), edges: boxes(edges), regions: {} },
		width: 100,
		height: 100,
	};
}

// a -> b -> c -> d.
const STRUCTURE = {
	content: {
		nodes: ["a", "b", "c", "d"].map((id, order) => ({ id, order, name: id, kind: "module" })),
		edges: [
			{ id: "ab", order: 0, from: "a", to: "b", kind: "call", emphasis: "normal" as const },
			{ id: "bc", order: 1, from: "b", to: "c", kind: "call", emphasis: "normal" as const },
			{ id: "cd", order: 2, from: "c", to: "d", kind: "call", emphasis: "normal" as const },
		],
		flows: [],
		walkthroughs: [],
	},
};
const STRUCTURE_PICTURE = pictureOf(["a", "b", "c", "d"], ["ab", "bc", "cd"]);

// p asks q, and q asks r.
const SEQUENCE = {
	content: {
		nodes: ["p", "q", "r"].map((id, order) => ({ id, order, name: id, kind: "module" })),
		edges: [],
		flows: [
			{
				id: "f",
				name: "f",
				participants: ["p", "q", "r"],
				steps: [
					{ id: "pq", from: "p", to: "q", kind: "sync" as const, label: "Ask" },
					{ id: "qr", from: "q", to: "r", kind: "sync" as const, label: "Ask on" },
				],
			},
		],
		walkthroughs: [],
	},
};
const SEQUENCE_PICTURE = pictureOf(["p", "q", "r"], ["pq", "qr"]);

test("a beat that names a card lights what the card touches a step fainter", () => {
	const focus = beatFocus({ id: "b", subjects: ["b"] }, STRUCTURE_PICTURE, STRUCTURE);
	expect(focus.drawn).toEqual(["b"]);
	expect(focus.around.toSorted()).toEqual(["a", "ab", "bc", "c"]);
	const { veil, reach } = beatLight(focus);
	expect(veil).toEqual(new Set(["a", "ab", "b", "bc", "c"]));
	expect(reach?.has("b")).toBe(false);
	expect(reach?.get("c")).toBe(2);
});

test("a beat that names two cards keeps the line between them at full strength", () => {
	const focus = beatFocus({ id: "b", subjects: ["a", "b"] }, STRUCTURE_PICTURE, STRUCTURE);
	expect(focus.drawn).toEqual(["a", "b", "ab"]);
	expect(focus.around.toSorted()).toEqual(["bc", "c"]);
});

test("a beat that names a line lights that line and its ends, and nothing more", () => {
	const focus = beatFocus({ id: "b", subjects: ["bc"] }, STRUCTURE_PICTURE, STRUCTURE);
	expect(focus.drawn).toEqual(["bc", "b", "c"]);
	expect(focus.around).toEqual([]);
	expect(beatLight(focus).reach).toBeNull();
});

test("a sequence lights the messages of the participants that a beat names", () => {
	const focus = beatFocus({ id: "b", subjects: ["p", "q"] }, SEQUENCE_PICTURE, SEQUENCE);
	expect(focus.drawn).toEqual(["p", "q", "pq"]);
	expect(focus.around.toSorted()).toEqual(["qr", "r"]);
});

test("a beat that names a message stays on that message", () => {
	const focus = beatFocus({ id: "b", subjects: ["qr"] }, SEQUENCE_PICTURE, SEQUENCE);
	expect(focus.drawn).toEqual(["qr", "q", "r"]);
	expect(focus.around).toEqual([]);
});

test("a beat that the picture does not draw lights nothing", () => {
	const focus = beatFocus({ id: "b", subjects: ["gone"] }, STRUCTURE_PICTURE, STRUCTURE);
	expect(focus.undrawn).toEqual(["gone"]);
	expect(beatLight(focus)).toEqual({ veil: null, reach: null });
});
