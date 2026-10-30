// The keys of a reading hold everywhere except where the key belongs to what has focus:
// a Backspace in a field must never leave the module the reader is typing about.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { readerMove, type ReaderMove } from "#ui/rules/architecture-model/reader-keys.ts";

beforeAll(() => GlobalRegistrator.register());
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * The move a key makes where it is pressed.
 * @param key The key.
 * @param markup The element with focus.
 * @param init What else is held.
 * @returns The move.
 */
function moveAt(
	key: string,
	markup = "<section></section>",
	init: KeyboardEventInit = {},
): ReturnType<typeof readerMove> {
	document.body.innerHTML = markup;
	const target = document.body.firstElementChild;
	const event = new KeyboardEvent("keydown", { key, bubbles: true, ...init });
	target?.dispatchEvent(event);
	return readerMove(event);
}

test.each<[string, ReaderMove]>([
	["Backspace", "up"],
	["[", "previous"],
	["]", "next"],
	["Enter", "open"],
	["f", "focus"],
	["F", "focus"],
	["0", "fit"],
])("%s is a move of the reader", (key, move) => {
	expect(moveAt(key)).toBe(move);
});

test.each([
	["<input />"],
	["<textarea></textarea>"],
	['<div role="menu"></div>'],
	['<div role="dialog"></div>'],
])("a key belongs to %s, not to the reading", (markup) => {
	expect(moveAt("Backspace", markup)).toBeNull();
});

test("Enter activates a control or a tree row, and another key still moves from there", () => {
	expect(moveAt("Enter", "<button></button>")).toBeNull();
	expect(moveAt("Enter", '<div role="treeitem"></div>')).toBeNull();
	expect(moveAt("]", "<button></button>")).toBe("next");
});

test("a key held with a modifier is somebody else's shortcut", () => {
	expect(moveAt("0", undefined, { ctrlKey: true })).toBeNull();
	expect(moveAt("[", undefined, { metaKey: true })).toBeNull();
	expect(moveAt("f", undefined, { altKey: true })).toBeNull();
});
