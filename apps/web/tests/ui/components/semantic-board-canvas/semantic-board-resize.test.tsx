// What a pane does when the room it is drawn in changes size. A slide beside it
// changes that size on every frame, and the camera fits to the room once it
// stops changing, not on every frame of the slide (COLUMN_MS.boardResizeSettle).

import { act } from "@testing-library/react";
import { afterEach, expect, test } from "bun:test";

import { COLUMN_MS } from "@archboard/timing";
import { cameraNow, takeFrames } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	drawing,
	mountStage,
	room,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

const realObserver = globalThis.ResizeObserver;
let restoreFrames: (() => void) | undefined;

afterEach(() => {
	globalThis.ResizeObserver = realObserver;
	restoreFrames?.();
	restoreFrames = undefined;
});

/**
 * Replace ResizeObserver with one that reports when the test says, since this DOM does no layout.
 * @returns What tells every observer the room changed.
 */
function observersTold(): (() => void)[] {
	const told: (() => void)[] = [];
	globalThis.ResizeObserver = class {
		/**
		 * Listen for the test's word.
		 * @param callback What the pane does when its room changes size.
		 */
		constructor(callback: ResizeObserverCallback) {
			told.push(() => callback([], this));
		}
		/** The test says when the room changes, so nothing is watched. */
		observe(): void {}
		/** Nothing is watched. */
		unobserve(): void {}
		/** Nothing is watched. */
		disconnect(): void {}
	};
	return told;
}

test("a pane whose room changes on every frame is fitted once, when the room stops changing", async () => {
	const frames = takeFrames();
	restoreFrames = frames.restore;
	const told = observersTold();
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const fitted = cameraNow();
	/**
	 * One frame of a slide: the room is a little narrower than the frame before.
	 * @param width The room's width.
	 */
	const frame = (width: number): void => {
		room.width = width;
		act(() => {
			for (const tell of told) tell();
		});
		frames.run(COLUMN_MS.boardResizeSettle / 4);
	};
	for (const width of [760, 720, 680, 640, 600, 560, 520]) frame(width);
	expect(cameraNow()).toEqual(fitted);
	frames.run(COLUMN_MS.boardResizeSettle * 3);
	expect(cameraNow().scale).toBeCloseTo(Math.min((520 - 48) / 400, (600 - 48) / 300), 6);
});
