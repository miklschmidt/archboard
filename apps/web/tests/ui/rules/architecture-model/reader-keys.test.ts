// The keys of a reading hold everywhere except where the key belongs to what has focus:
// a Backspace in a field must never leave the module the reader is typing about.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import {
	changeStep,
	readerMove,
	type ChangeStep,
	type ReaderMove,
} from "#ui/rules/architecture-model/reader-keys.ts";

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

test.each<[string, ChangeStep]>([
	["n", 1],
	["N", 1],
	["p", -1],
	["P", -1],
])("%s walks a proposal's changes", (key, step) => {
	document.body.innerHTML = "<section></section>";
	expect(changeStep(new KeyboardEvent("keydown", { key }))).toBe(step);
});

test.each([["<input />"], ["<textarea></textarea>"], ['<div role="menu"></div>']])(
	"a walk key belongs to %s, not to the reading",
	(markup) => {
		document.body.innerHTML = markup;
		const event = new KeyboardEvent("keydown", { key: "n", bubbles: true });
		document.body.firstElementChild?.dispatchEvent(event);
		expect(changeStep(event)).toBeNull();
	},
);

test("a walk key held with a modifier is somebody else's shortcut", () => {
	expect(changeStep(new KeyboardEvent("keydown", { key: "n", ctrlKey: true }))).toBeNull();
});
