// A pane's surface across pictures: which pictures are carried, which come in
// part by part and which are cut to, and what a picture arriving in flight does.
//
// What these catch: a first picture or another board's that pops in whole, an
// entrance that builds in markup order rather than down the board, a flight
// landed by its own picture answered twice, and a surface left anywhere but on
// the picture the server drew.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useState, type JSX } from "react";

import {
	PICTURE_ENTRY_MS,
	PICTURE_ENTRY_PHASES,
	PICTURE_TRANSITION_MS,
} from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas";
import {
	TRANSITION_ATTRIBUTE,
	enterPicture,
	usePictureTransition,
} from "@/ui/semantic-board-canvas/transitions";
import {
	A,
	AB,
	B,
	bodyOf,
	picture,
	surfaceElement,
	type Card,
} from "@/ui/semantic-board-canvas/tests/picture-fixtures";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

afterEach(() => {
	cleanup();
});

/**
 * The label drawn for a connection, as a pill.
 * @param id The connection.
 * @param y How far down the pill sits.
 * @returns The pill, as a card.
 */
function pill(id: string, y: number): Card {
	return { id, label: true, box: { x: 130, y, width: 50, height: 20 }, title: id };
}

describe("a picture with nothing to carry it from", () => {
	const LOW: Card = { id: "n3", box: { x: 10, y: 300, width: 100, height: 60 }, title: "Gamma" };

	test("every connection label arrives together at the end, whenever its own line was drawn", () => {
		const surface = surfaceElement();
		// One line near the top, drawn early in the wave; one near the bottom, drawn late.
		const early = { id: "e1", d: "M110,40 L200,40" };
		const late = { id: "e2", d: "M110,330 L200,330" };
		const drawn = picture([A, B, LOW, pill("e1", 30), pill("e2", 320)], [early, late]);
		const entrance = enterPicture(surface, drawn);
		/**
		 * How visible a connection's label is.
		 * @param id The connection.
		 * @returns Its opacity.
		 */
		const labelOf = (id: string): number =>
			Number(
				surface.querySelectorAll<SVGGElement>(`g[data-semantic-id="${id}"]`)[1]!.style.opacity,
			);
		const { labelsStart } = PICTURE_ENTRY_PHASES;
		entrance.seek(labelsStart);
		expect(labelOf("e1")).toBe(0);
		expect(labelOf("e2")).toBe(0);
		entrance.seek((labelsStart + 1) / 2);
		expect(labelOf("e1")).toBeGreaterThan(0);
		expect(labelOf("e1")).toBe(labelOf("e2"));
		entrance.seek(1);
		expect(labelOf("e1")).toBe(1);
		expect(labelOf("e2")).toBe(1);
	});

	test("cards arrive down the board, lines draw on after the cards, and it lands untouched", () => {
		const surface = surfaceElement();
		// Drawn lowest first, so the order they arrive in is the board's, not the markup's.
		const drawn = picture([LOW, A], [AB]);
		const entrance = enterPicture(surface, drawn);
		const top = surface.querySelector<SVGGElement>(`g[data-semantic-id="n1"]`)!;
		const low = surface.querySelector<SVGGElement>(`g[data-semantic-id="n3"]`)!;
		const line = surface.querySelector<SVGGElement>(`g[data-semantic-id="e1"]`)!;
		const stroke = line.querySelectorAll("path")[1]!;
		expect(Number(top.style.opacity)).toBe(0);
		expect(Number(low.style.opacity)).toBe(0);
		expect(Number(line.style.opacity)).toBe(0);
		// The card higher on the board is on its way before the one below it.
		entrance.seek(PICTURE_ENTRY_PHASES.cardsStartBy / 2);
		expect(Number(top.style.opacity)).toBeGreaterThan(Number(low.style.opacity));
		// A line waits for the cards it joins.
		expect(Number(stroke.getAttribute("stroke-dashoffset"))).toBeCloseTo(90, 3);
		entrance.seek(1);
		expect(Number(top.style.opacity)).toBe(1);
		expect(Number(low.style.opacity)).toBe(1);
		expect(Number(stroke.getAttribute("stroke-dashoffset"))).toBe(0);
		entrance.finish();
		const plain = document.createElement("div");
		plain.innerHTML = drawn.svg;
		expect(surface.innerHTML).toBe(plain.innerHTML);
	});
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
 * How visible a subject's group is on the surface.
 * @param surface The surface.
 * @param id The subject.
 * @returns Its opacity, 1 when nothing was set.
 */
function visibility(surface: Element, id: string): number {
	const group = surface.querySelector<SVGGElement>(`g[data-semantic-id="${id}"]`)!;
	return group.style.opacity === "" ? 1 : Number(group.style.opacity);
}

describe("the surface across pictures", () => {
	test("a picture arriving mid-flight lands the flight, then flies to its own final state", () => {
		withFramesByHand(() => {
			const first = picture([A], []);
			const second = picture([{ ...A, box: { x: 300, y: 10, width: 100, height: 60 } }], []);
			const third = picture([{ ...A, box: { x: 300, y: 200, width: 100, height: 60 } }, B], []);
			const { rerender, container } = render(
				createElement(Surface, { drawing: first, reducedMotion: false }),
			);
			const surface = container.querySelector("[data-slot='surface']")!;
			expect(bodyOf(surface, "n1")).toEqual(A.box);
			frames.now = 1000;
			followed.length = 0;
			rerender(createElement(Surface, { drawing: second, reducedMotion: false }));
			// The only shared card moved 290 across, so the camera follows it by as much.
			expect(followed).toEqual([{ x: -290, y: 0 }]);
			runFrames(1000 + PICTURE_TRANSITION_MS / 2);
			expect(bodyOf(surface, "n1").x).toBeGreaterThan(A.box.x);
			expect(bodyOf(surface, "n1").x).toBeLessThan(300);
			// The same picture answered again is not another picture: the flight
			// keeps flying rather than landing on itself, and nothing moves the camera.
			const inFlight = bodyOf(surface, "n1").x;
			rerender(createElement(Surface, { drawing: { ...second }, reducedMotion: false }));
			expect(bodyOf(surface, "n1").x).toBe(inFlight);
			expect(followed).toHaveLength(1);
			// The third picture lands the second first: the surface is exactly the
			// second picture, and the new flight starts from it.
			rerender(createElement(Surface, { drawing: third, reducedMotion: false }));
			expect(bodyOf(surface, "n1")).toEqual({ x: 300, y: 10, width: 100, height: 60 });
			expect(surface.querySelector("g[data-semantic-id='n2']")).not.toBeNull();
			runFrames(1000 + PICTURE_TRANSITION_MS / 2 + PICTURE_TRANSITION_MS + 1);
			expect(bodyOf(surface, "n1")).toEqual({ x: 300, y: 200, width: 100, height: 60 });
			expect(surface.querySelector(`[${TRANSITION_ATTRIBUTE}]`)).toBeNull();
			// Reduced motion cuts: the next picture is simply there.
			rerender(createElement(Surface, { drawing: first, reducedMotion: true }));
			expect(surface.querySelector(`[${TRANSITION_ATTRIBUTE}]`)).toBeNull();
			expect(bodyOf(surface, "n1")).toEqual(A.box);
		});
	});

	test("a first picture and another board's come in part by part; another ground and reduced motion cut", () => {
		withFramesByHand(() => {
			const first = picture([A], []);
			const { rerender, container } = render(
				createElement(Surface, { drawing: first, reducedMotion: false }),
			);
			const surface = container.querySelector("[data-slot='surface']")!;
			expect(visibility(surface, "n1")).toBe(0);
			runFrames(PICTURE_ENTRY_MS + 1);
			expect(visibility(surface, "n1")).toBe(1);
			expect(surface.querySelector<SVGGElement>("g[data-semantic-id='n1']")!.style.opacity).toBe(
				"",
			);

			frames.now = 2000;
			rerender(
				createElement(Surface, {
					drawing: picture([B], [], { board: "engine" }),
					reducedMotion: false,
				}),
			);
			expect(visibility(surface, "n2")).toBe(0);
			runFrames(2000 + PICTURE_ENTRY_MS + 1);
			expect(visibility(surface, "n2")).toBe(1);

			// The same board on another ground is the same picture in other colours.
			rerender(
				createElement(Surface, {
					drawing: picture([B], [], { board: "engine", theme: "light" }),
					reducedMotion: false,
				}),
			);
			expect(visibility(surface, "n2")).toBe(1);
			rerender(createElement(Surface, { drawing: first, reducedMotion: true }));
			expect(visibility(surface, "n1")).toBe(1);
		});
	});
});
