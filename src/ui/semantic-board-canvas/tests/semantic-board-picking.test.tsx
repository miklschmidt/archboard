// What a pick is, and what it is not. Kept apart from the stage's own owner
// because picking is a gesture rather than a state: it is the one thing in this
// viewer decided by a sequence of pointer events rather than by an answer.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	drawing,
	inPicture,
	mountStage,
	server,
	settle,
	surface,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

test("clicking a card reports its semantic id, and the given selection is drawn", async () => {
	server.reply = { status: 200, body: drawing(1) };
	const stage = mountStage();
	await settle();
	act(() => {
		fireEvent.click(inPicture("card"));
	});
	expect(stage.picks).toEqual(["n1"]);

	// The stage draws whatever selection it is given, which is the shell's.
	cleanup();
	server.reply = { status: 200, body: drawing(1) };
	mountStage("n1");
	await settle();
	expect(surface().querySelector("[data-semantic-id='n1']")?.classList).toContain("is-selected");
	expect(surface().querySelector("[data-semantic-id='e1']")?.classList).not.toContain(
		"is-selected",
	);
});

test("a real press picks what it landed on, whatever the click says afterwards", async () => {
	// The browser retargets a click to whichever element holds the pointer, and
	// it fires the click after a pan has already moved the diagram. Both mean a
	// click's own target answers a different question from "what did the person
	// press on". This is the sequence a browser really delivers, with the click
	// arriving at the viewport rather than at the card.
	server.reply = { status: 200, body: drawing(1) };
	const stage = mountStage();
	await settle();
	const card = inPicture("card");
	act(() => {
		fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 40, clientY: 40 });
		fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 40, clientY: 40 });
		fireEvent.click(viewport(), { clientX: 40, clientY: 40 });
	});
	expect(stage.picks).toEqual(["n1"]);
});

test("a drag that begins on a card pans and picks nothing, however small its steps", async () => {
	server.reply = { status: 200, body: drawing(1) };
	const stage = mountStage();
	await settle();
	const before = surface().style.transform;
	const card = inPicture("card");
	act(() => {
		fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 40, clientY: 40 });
		// One pixel at a time: far enough to be a pan, never far enough between
		// two moves to look like one.
		for (let step = 1; step <= 20; step += 1) {
			fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 40 + step, clientY: 40 });
		}
		fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 60, clientY: 40 });
		fireEvent.click(viewport(), { clientX: 60, clientY: 40 });
	});
	expect(stage.picks).toEqual([]);
	expect(surface().style.transform).not.toBe(before);
});

test("a gesture the browser takes away picks nothing", async () => {
	server.reply = { status: 200, body: drawing(1) };
	const stage = mountStage();
	await settle();
	const card = inPicture("card");
	act(() => {
		fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 40, clientY: 40 });
		fireEvent.pointerCancel(viewport(), { pointerId: 1 });
		fireEvent.click(viewport(), { clientX: 40, clientY: 40 });
	});
	expect(stage.picks).toEqual([null]);
});

test("the background and Escape clear the pick, and the atlas decides what is one", async () => {
	server.reply = { status: 200, body: drawing(1) };
	const stage = mountStage();
	await settle();

	act(() => {
		fireEvent.click(surface());
	});
	expect(stage.picks).toEqual([null]);

	// A group the atlas does not know is scenery, not a subject.
	act(() => {
		fireEvent.click(inPicture("stray"));
	});
	expect(stage.picks).toEqual([null, null]);

	act(() => {
		fireEvent.click(inPicture("wire"));
	});
	expect(stage.picks).toEqual([null, null, "e1"]);

	act(() => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	expect(stage.picks).toEqual([null, null, "e1", null]);
});
