// The keys of every tree in the left column. What these catch: a Right that steps past a
// closed row, a Left that leaves an open row open, and an Enter that loses the Alt.

import { expect, test } from "bun:test";

import { treeKey } from "#ui/shell/rules/tree-keys.ts";

const ROWS = [
	{ id: "a", parent: null, branch: true, open: true },
	{ id: "a1", parent: "a", branch: false, open: false },
	{ id: "b", parent: null, branch: true, open: false },
];

/**
 * What a key does on a row.
 * @param id The row with focus.
 * @param key The key.
 * @param altKey Whether Alt is held.
 * @returns The action.
 */
function press(id: string, key: string, altKey = false) {
	return treeKey(ROWS, id, { key, altKey });
}

test("the arrows and the ends walk the drawn rows and stop at the edges", () => {
	expect(press("a", "ArrowDown")).toEqual({ kind: "focus", id: "a1" });
	expect(press("b", "ArrowDown")).toEqual({ kind: "focus", id: "b" });
	expect(press("a", "ArrowUp")).toEqual({ kind: "focus", id: "a" });
	expect(press("a1", "Home")).toEqual({ kind: "focus", id: "a" });
	expect(press("a1", "End")).toEqual({ kind: "focus", id: "b" });
});

test("Right opens a closed row and then steps in, and a leaf goes nowhere", () => {
	expect(press("b", "ArrowRight")).toMatchObject({ kind: "toggle", row: { id: "b" } });
	expect(press("a", "ArrowRight")).toEqual({ kind: "focus", id: "a1" });
	expect(press("a1", "ArrowRight")).toBeNull();
});

test("Left closes an open row and then steps out", () => {
	expect(press("a", "ArrowLeft")).toMatchObject({ kind: "toggle", row: { id: "a" } });
	expect(press("a1", "ArrowLeft")).toEqual({ kind: "focus", id: "a" });
	expect(press("b", "ArrowLeft")).toBeNull();
});

test("Enter and Space open a row's destination, beside the reading with Alt", () => {
	expect(press("b", "Enter")).toMatchObject({ kind: "open", beside: false });
	expect(press("b", " ", true)).toMatchObject({ kind: "open", beside: true });
	expect(press("b", "x")).toBeNull();
});
