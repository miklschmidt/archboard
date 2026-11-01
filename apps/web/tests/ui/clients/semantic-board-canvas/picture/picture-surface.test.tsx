// A pane's surface across pictures: which pictures are carried, which come in
// part by part and which are cut to, and what a picture arriving in flight does.
//
// What these catch: a first picture or another board's that pops in whole, a
// flight landed by its own picture answered twice, a picture that arrives in
// flight without landing the last, and traffic that runs in the page.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useState, type JSX } from "react";

import { PICTURE_MS } from "@archboard/timing";
import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { stagePicture } from "#ui/clients/semantic-board-canvas/picture/picture-transition.ts";
import { usePictureTransition } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import { A, B, picture } from "#tests/ui/support/semantic-board-canvas/picture-fixtures.ts";
import {
	calls,
	forgetCalls,
	told,
} from "#tests/ui/support/semantic-board-canvas/recording-stage.ts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

beforeEach(() => {
	forgetCalls();
	followed.length = 0;
});

afterEach(() => {
	cleanup();
});

/** The frame clock, driven by hand. */
const frames: { callbacks: FrameRequestCallback[]; now: number } = { callbacks: [], now: 0 };

/**
 * A surface whose picture is the hook's to write.
 * @param props The picture and whether motion is reduced.
 * @param props.drawing The picture.
 * @param props.reducedMotion Whether motion is reduced.
 * @returns The surface.
 */
function Surface(props: { drawing: SemanticDrawing; reducedMotion: boolean }): JSX.Element {
	const [surface, setSurface] = useState<HTMLElement | null>(null);
	usePictureTransition(surface, props.drawing, {
		reducedMotion: props.reducedMotion,
		keepStill,
		heading: null,
	});
	return createElement("div", { ref: setSurface, "data-slot": "surface" });
}

/** Every shift the surface asked the camera to follow, in order. */
const followed: { x: number; y: number }[] = [];

/**
 * Record a shift the camera was asked to follow.
 * @param shift How far the shared cards moved.
 * @param shift.x Across.
 * @param shift.y Down.
 */
function keepStill(shift: { x: number; y: number }): void {
	followed.push(shift);
}

/**
 * Run the frames asked for so far, at a moment.
 * @param at The clock, in milliseconds.
 */
function runFrames(at: number): void {
	frames.now = at;
	const due = frames.callbacks.splice(0);
	act(() => {
		for (const callback of due) {
			callback(at);
		}
	});
}

/**
 * Run something with the frame clock in the test's hands.
 * @param run What to run.
 */
function withFramesByHand(run: () => void): void {
	const realFrame = globalThis.requestAnimationFrame;
	const realCancel = globalThis.cancelAnimationFrame;
	const realNow = performance.now.bind(performance);
	/**
	 * Ask for a frame, to be run by hand.
	 * @param callback What to run.
	 * @returns The frame's number.
	 */
	function askForFrame(callback: FrameRequestCallback): number {
		frames.callbacks.push(callback);
		return frames.callbacks.length;
	}
	/** Drop every frame asked for. */
	function dropFrames(): void {
		frames.callbacks.length = 0;
	}
	/**
	 * The clock, as the test set it.
	 * @returns The moment, in milliseconds.
	 */
	function clock(): number {
		return frames.now;
	}
	globalThis.requestAnimationFrame = askForFrame;
	globalThis.cancelAnimationFrame = dropFrames;
	performance.now = clock;
	frames.now = 0;
	try {
		run();
	} finally {
		globalThis.requestAnimationFrame = realFrame;
		globalThis.cancelAnimationFrame = realCancel;
		performance.now = realNow;
	}
}

/**
 * What the stage was told to do with a picture.
 * @returns The calls, in order.
 */
function moves(): readonly string[] {
	return told.map((one) => one.call).filter((call) => call !== "learnGroups");
}

describe("the surface across pictures", () => {
	test("a picture arriving in flight lands the flight, then carries on from it", () => {
		withFramesByHand(() => {
			const first = picture([A], []);
			const second = picture([{ ...A, box: { x: 300, y: 10, width: 100, height: 60 } }], []);
			const third = picture([{ ...A, box: { x: 300, y: 200, width: 100, height: 60 } }, B], []);
			const { rerender, container } = render(
				createElement(Surface, { drawing: first, reducedMotion: false }),
			);
			const surface = container.querySelector("[data-slot='surface']")!;
			runFrames(PICTURE_MS.entry + 1);
			expect(surface.hasAttribute("data-picture-motion")).toBe(false);
			forgetCalls();
			frames.now = 1000;
			rerender(createElement(Surface, { drawing: second, reducedMotion: false }));
			// The only shared card moved 290 across, so the camera follows it by as much.
			expect(followed).toEqual([{ x: -290, y: 0 }]);
			expect(calls("carry")).toEqual([[second.painting, { x: -290, y: 0 }]]);
			expect(surface.hasAttribute("data-picture-motion")).toBe(true);
			runFrames(1000 + PICTURE_MS.transition / 2);
			// The same picture answered again is not another picture: the flight
			// keeps flying rather than landing on itself, and nothing moves the camera.
			rerender(createElement(Surface, { drawing: { ...second }, reducedMotion: false }));
			expect(moves()).toEqual(["carry"]);
			expect(followed).toHaveLength(1);
			// The third picture lands the second first, and the new flight starts from it.
			rerender(createElement(Surface, { drawing: third, reducedMotion: false }));
			expect(moves()).toEqual(["carry", "land", "carry"]);
			runFrames(1000 + PICTURE_MS.transition / 2 + PICTURE_MS.transition + 1);
			expect(surface.hasAttribute("data-picture-motion")).toBe(false);
			// Reduced motion cuts: the next picture is simply there.
			rerender(createElement(Surface, { drawing: first, reducedMotion: true }));
			expect(moves().at(-1)).toBe("show");
			expect(surface.hasAttribute("data-picture-motion")).toBe(false);
		});
	});

	test("a first picture and another board's come in part by part; reduced motion cuts", () => {
		withFramesByHand(() => {
			const first = picture([A], []);
			const other = picture([B], [], { board: "engine" });
			const { rerender, container } = render(
				createElement(Surface, { drawing: first, reducedMotion: false }),
			);
			const surface = container.querySelector("[data-slot='surface']")!;
			expect(moves()).toEqual(["enter"]);
			expect(surface.hasAttribute("data-picture-motion")).toBe(true);
			runFrames(PICTURE_MS.entry + 1);
			expect(surface.hasAttribute("data-picture-motion")).toBe(false);

			frames.now = 2000;
			rerender(createElement(Surface, { drawing: other, reducedMotion: false }));
			expect(moves()).toEqual(["enter", "enter"]);
			runFrames(2000 + PICTURE_MS.entry + 1);

			rerender(createElement(Surface, { drawing: first, reducedMotion: true }));
			expect(moves()).toEqual(["enter", "enter", "show"]);
			expect(surface.querySelector("g[data-semantic-id='n1']")).not.toBeNull();
		});
	});

	test("a picture's traffic never runs in the page, because the stage draws it", () => {
		const surface = document.createElement("div");
		stagePicture(surface, {
			...picture([], []),
			svg: '<svg><g class="ab-pulse" data-traffic="e1"><animate/></g><g data-semantic-id="n1"></g></svg>',
		});
		expect(surface.querySelector(".ab-pulse")).toBeNull();
		expect(surface.querySelector("[data-semantic-id='n1']")).not.toBeNull();
	});
});
