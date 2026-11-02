// Where a tip stands: the pointer rests on a part to see what it touches, so a
// tip keeps clear of the part and of what lights around it.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { takeFrames } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import { viewport } from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { group, served } from "#tests/ui/support/semantic-board-canvas/wiring-fixture.tsx";

/**
 * The pane's box, in a DOM that does no layout.
 * @returns The box.
 */
function paneBox(): DOMRect {
	return new DOMRect(0, 0, 1000, 600);
}

/**
 * Rest the pointer on a part, somewhere across the pane.
 * @param id The part.
 * @param clientX How far across the pane the pointer is.
 */
function restOn(id: string, clientX: number): void {
	act(() => {
		fireEvent.pointerMove(group(id), { pointerId: 2, buttons: 0, clientX, clientY: 5 });
	});
}

/**
 * The corner the tips stand in.
 * @returns Its name.
 */
function corner(): string | null | undefined {
	return document.querySelector("[data-slot='picture-tip-corner']")?.getAttribute("data-corner");
}

test("a tip stands in the top corner across from the pointer", async () => {
	await served();
	viewport().getBoundingClientRect = paneBox;
	const frames = takeFrames();
	try {
		restOn("q", 100);
		frames.run(500);
		expect(corner()).toBe("right");
		// The next part's tip opens at once, on the other side of a pointer that crossed the pane.
		restOn("l", 900);
		expect(corner()).toBe("left");
	} finally {
		frames.restore();
	}
});
