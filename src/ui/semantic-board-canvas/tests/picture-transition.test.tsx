// One picture of a board turning into the next: what the transition does to
// the picture's markup at each moment, and what it leaves behind.
//
// What these catch: a subject paired with the wrong one, a card that jumps
// instead of gliding, content that fades when it only moved, a route that
// snaps, a subject that leaves or arrives at the wrong time, a finished
// picture that is not the one the server drew, and a picture arriving
// mid-flight landing somewhere other than its own final state.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useState, type JSX } from "react";

import { PICTURE_TRANSITION_MS, PICTURE_TRANSITION_PHASES } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas";
import {
	TRANSITION_ATTRIBUTE,
	continuousPictures,
	transitionPicture,
	usePictureTransition,
} from "@/ui/semantic-board-canvas/transitions";

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

/** A box, as the atlas spells it. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** One card to draw. */
interface Card {
	readonly id: string;
	readonly box: Box;
	readonly title: string;
	readonly dashed?: boolean;
	/** Whether a standing's pin sits astride the card's top-left corner. */
	readonly pinned?: boolean;
}

/** One line to draw. */
interface Line {
	readonly id: string;
	readonly d: string;
	readonly masked?: boolean;
}

/**
 * A card as the renderer draws one: a halo, a body, a chip and two texts.
 * @param card The card.
 * @returns Its group.
 */
function cardMarkup(card: Card): string {
	const { x, y, width, height } = card.box;
	const outline =
		card.dashed === true ? ' stroke-dasharray="4 3" stroke="#f0b429"' : ' stroke="#555"';
	return (
		`<g data-semantic-kind="node" data-semantic-id="${card.id}">` +
		`<rect class="ab-halo" x="${x - 3}" y="${y - 3}" width="${width + 6}" height="${height + 6}" rx="9" fill="none"/>` +
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#222"${outline}/>` +
		`<rect x="${x + 16}" y="${y + 16}" width="24" height="24" rx="5" fill="#888"/>` +
		`<text x="${x + 52}" y="${y + 30}" font-size="14">${card.title}</text>` +
		(card.pinned === true
			? `<g transform="translate(${x + 3},${y + 3})"><circle r="9.2" fill="#f0b429"/></g>`
			: "") +
		`</g>`
	);
}

/**
 * A line as the renderer draws one: a halo path under the stroke.
 * @param line The line.
 * @returns Its group.
 */
function lineMarkup(line: Line): string {
	const mask = line.masked === true ? ' mask="url(#crossing-1)"' : "";
	return (
		`<g data-semantic-kind="edge" data-semantic-id="${line.id}"${mask}>` +
		`<path class="ab-halo" d="${line.d}" fill="none"/>` +
		`<path d="${line.d}" fill="none" stroke="#999" marker-end="url(#head)"/>` +
		`</g>`
	);
}

/**
 * One drawn picture of the board `pipeline`.
 * @param cards Its cards.
 * @param lines Its lines.
 * @param identity Which variant and view it is of, and on which ground.
 * @returns The drawing, as the render route answers it.
 */
function picture(
	cards: readonly Card[],
	lines: readonly Line[],
	identity: Partial<
		Pick<SemanticDrawing, "board" | "variant" | "view" | "theme" | "width" | "height">
	> = {},
): SemanticDrawing {
	const width = identity.width ?? 600;
	const height = identity.height ?? 400;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
		lines.map(lineMarkup).join("") +
		cards.map(cardMarkup).join("") +
		`</svg>`;
	return {
		kind: "drawn",
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		theme: "dark",
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width,
		height,
		svg,
		atlas: {
			nodes: Object.fromEntries(cards.map((card) => [card.id, card.box])),
			edges: Object.fromEntries(
				lines.map((line) => [line.id, { x: 0, y: 0, width: 1, height: 1 }]),
			),
			regions: {},
		},
		...identity,
	};
}

/**
 * A surface to draw on.
 * @returns The element, attached to the document.
 */
function surfaceElement(): HTMLDivElement {
	const surface = document.createElement("div");
	document.body.append(surface);
	return surface;
}

/**
 * The body rect of a card on the surface.
 * @param surface The surface.
 * @param id The card's id.
 * @returns Its box as drawn.
 */
function bodyOf(surface: Element, id: string): Box {
	const rect = surface.querySelectorAll(`g[data-semantic-id="${id}"] > rect`)[1];
	if (rect === undefined) {
		throw new Error(`no body for ${id}`);
	}
	return {
		x: Number(rect.getAttribute("x")),
		y: Number(rect.getAttribute("y")),
		width: Number(rect.getAttribute("width")),
		height: Number(rect.getAttribute("height")),
	};
}

/**
 * One wrapper the transition added to the picture.
 * @param surface The surface.
 * @param role What the wrapper holds.
 * @returns The wrapper.
 */
function wrapper(surface: Element, role: string): SVGGElement {
	const found = surface.querySelector<SVGGElement>(`[${TRANSITION_ATTRIBUTE}="${role}"]`);
	if (found === null) {
		throw new Error(`no ${role} wrapper`);
	}
	return found;
}

const A: Card = { id: "n1", box: { x: 10, y: 10, width: 100, height: 60 }, title: "Alpha" };
const B: Card = { id: "n2", box: { x: 200, y: 10, width: 100, height: 60 }, title: "Beta" };
const AB: Line = { id: "e1", d: "M110,40 L200,40" };

describe("carrying a card", () => {
	test("a card that moved glides from its old box to its new one and keeps its content", () => {
		const surface = surfaceElement();
		const moved: Card = { ...A, box: { x: 300, y: 210, width: 100, height: 60 } };
		const before = picture([A, B], [AB]);
		const after = picture([moved, B], [AB]);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		expect(bodyOf(surface, "n1")).toEqual(A.box);
		transition.seek((PICTURE_TRANSITION_PHASES.moveStart + PICTURE_TRANSITION_PHASES.moveEnd) / 2);
		const midway = bodyOf(surface, "n1");
		expect(midway.x).toBeGreaterThan(A.box.x);
		expect(midway.x).toBeLessThan(moved.box.x);
		// The content rides with the frame rather than fading: everything is kept,
		// nothing arrives and nothing was borrowed to leave.
		expect(surface.querySelector(`[${TRANSITION_ATTRIBUTE}="outgoing"]`)).toBeNull();
		expect(surface.querySelector(`[${TRANSITION_ATTRIBUTE}="incoming"]`)).toBeNull();
		expect(wrapper(surface, "kept").getAttribute("transform")).toMatch(/^translate\(-/);
		transition.seek(1);
		expect(bodyOf(surface, "n1")).toEqual(moved.box);
		expect(wrapper(surface, "kept").getAttribute("transform")).toBe("translate(0,0)");
		// A card that did not move is left exactly as drawn.
		expect(surface.querySelector(`g[data-semantic-id="n2"] [${TRANSITION_ATTRIBUTE}]`)).toBeNull();
	});

	test("only the content that changed swaps: what leaves drops away first, then what arrives settles in from above", () => {
		const surface = surfaceElement();
		// The card stays put, so every translate below is the swap's own motion.
		const renamed: Card = { ...A, title: "Alpha prime" };
		const before = picture([A], []);
		const after = picture([renamed], []);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const outgoing = wrapper(surface, "outgoing");
		const incoming = wrapper(surface, "incoming");
		const kept = wrapper(surface, "kept");
		// The chip did not change, so it is kept and glides; only the title swaps.
		expect(kept.querySelectorAll("rect")).toHaveLength(1);
		expect(kept.textContent).toBe("");
		expect(outgoing.textContent).toBe("Alpha");
		expect(incoming.textContent).toBe("Alpha prime");
		expect(Number(outgoing.style.opacity)).toBe(1);
		expect(Number(incoming.style.opacity)).toBe(0);
		const { fadeStart, swapAt, fadeEnd } = PICTURE_TRANSITION_PHASES;
		transition.seek((fadeStart + swapAt) / 2);
		// Halfway through leaving: the old title is half gone and on its way down; nothing has arrived.
		expect(Number(outgoing.style.opacity)).toBeCloseTo(0.5, 6);
		expect(Number(/,(-?[\d.]+)\)/.exec(outgoing.getAttribute("transform") ?? "")?.[1])).toBeCloseTo(
			5,
			6,
		);
		expect(Number(incoming.style.opacity)).toBe(0);
		transition.seek(swapAt);
		expect(Number(outgoing.style.opacity)).toBe(0);
		expect(Number(incoming.style.opacity)).toBe(0);
		transition.seek((swapAt + fadeEnd) / 2);
		// Halfway through arriving: the new title is half there and settling down from above.
		expect(Number(incoming.style.opacity)).toBeCloseTo(0.5, 6);
		expect(Number(/,(-?[\d.]+)\)/.exec(incoming.getAttribute("transform") ?? "")?.[1])).toBeCloseTo(
			-5,
			6,
		);
		// Content is clipped to the frame while it swaps, through the holder
		// around the wrappers rather than the wrappers that move.
		expect(wrapper(surface, "content").getAttribute("clip-path")).toMatch(/^url\(#/);
		expect(incoming.hasAttribute("clip-path")).toBe(false);
		transition.seek(1);
		expect(Number(incoming.style.opacity)).toBe(1);
		expect(incoming.getAttribute("transform")).toBe("translate(0,0)");
	});

	test("a pin astride the corner rides outside the clip, so it is never cut to a sliver in flight", () => {
		const surface = surfaceElement();
		const before = picture([A], []);
		const after = picture(
			[{ ...A, pinned: true, box: { x: 10, y: 10, width: 160, height: 60 } }],
			[],
		);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const holder = wrapper(surface, "content");
		expect(holder.getAttribute("clip-path")).toMatch(/^url\(#/);
		// The chip and the title are inside the frame and are clipped with it.
		expect(holder.querySelectorAll("rect, text")).toHaveLength(2);
		// The pin arrives like any other new content, but outside the clipped holder.
		const marks = wrapper(surface, "incoming-marks");
		expect(marks.closest(`[${TRANSITION_ATTRIBUTE}="content"]`)).toBeNull();
		expect(marks.querySelector("circle")).not.toBeNull();
		expect(Number(marks.style.opacity)).toBe(0);
		transition.seek(1);
		expect(Number(marks.style.opacity)).toBe(1);
	});

	test("a frame whose look changed dissolves the old look into the new", () => {
		const surface = surfaceElement();
		const before = picture([A], []);
		const after = picture([{ ...A, dashed: true }], []);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const oldFrame = surface.querySelector<SVGGElement>(
			`[${TRANSITION_ATTRIBUTE}="outgoing-frame"]`,
		);
		expect(oldFrame?.querySelector("rect")?.getAttribute("stroke")).toBe("#555");
		expect(Number(oldFrame?.style.opacity)).toBe(1);
		transition.seek(1);
		expect(Number(oldFrame?.style.opacity)).toBe(0);
	});
});

describe("carrying a line", () => {
	test("a route morphs from its old path to its new one, exact at both ends", () => {
		const surface = surfaceElement();
		const rerouted: Line = {
			id: "e1",
			d: "M110,40 L150,40 C160,40 160,50 160,60 L160,100",
			masked: true,
		};
		const before = picture([A, B], [AB]);
		const after = picture([A, B], [rerouted]);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const group = surface.querySelector(`g[data-semantic-id="e1"]`)!;
		const stroke = group.querySelectorAll("path")[1]!;
		expect(stroke.getAttribute("d")).toBe(AB.d);
		// The crossing mask is parked while the route is somewhere between.
		expect(group.hasAttribute("mask")).toBe(false);
		transition.seek(0.5);
		expect(stroke.getAttribute("d")).not.toBe(AB.d);
		expect(stroke.getAttribute("d")).not.toBe(rerouted.d);
		transition.seek(1);
		expect(stroke.getAttribute("d")).toBe(rerouted.d);
	});
});

describe("a line taking a standing", () => {
	test("the swipe a proposal adds arrives along the route with the stroke, which cross-fades into its new look", () => {
		const surface = surfaceElement();
		const before = picture([A, B], [AB]);
		const proposed = picture([A, B], [AB]);
		// A proposal draws a swipe under the line and gives the stroke the standing's ink.
		const svg = proposed.svg.replace(
			`<path class="ab-halo" d="${AB.d}" fill="none"/>`,
			`<path d="${AB.d}" fill="none" stroke="#05df72" stroke-width="5.4"/><path class="ab-halo" d="${AB.d}" fill="none"/>`,
		);
		const after = { ...proposed, svg: svg.replace('stroke="#999"', 'stroke="#05df72"') };
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const group = surface.querySelector(`g[data-semantic-id="e1"]`)!;
		const paths = [...group.querySelectorAll("path")];
		// Swipe, halo, the borrowed old stroke, then the new stroke.
		expect(paths.map((path) => path.getAttribute("stroke"))).toEqual([
			"#05df72",
			null,
			"#999",
			"#05df72",
		]);
		const [swipe, , old, stroke] = paths;
		expect(Number(swipe!.style.opacity)).toBe(0);
		expect(Number(stroke!.style.opacity)).toBe(0);
		expect(Number(old!.style.opacity)).toBe(1);
		const { fadeStart, fadeEnd } = PICTURE_TRANSITION_PHASES;
		transition.seek((fadeStart + fadeEnd) / 2);
		// The swipe and the stroke arrive together, as the old stroke gives way.
		expect(Number(swipe!.style.opacity)).toBeCloseTo(0.5, 6);
		expect(Number(stroke!.style.opacity)).toBeCloseTo(0.5, 6);
		expect(Number(old!.style.opacity)).toBeCloseTo(0.5, 6);
		transition.seek(1);
		expect(Number(swipe!.style.opacity)).toBe(1);
		expect(Number(stroke!.style.opacity)).toBe(1);
		expect(Number(old!.style.opacity)).toBe(0);
	});
});

describe("leaving and arriving", () => {
	test("a subject only the old picture had is borrowed to fade, and is gone by the exit's end", () => {
		const surface = surfaceElement();
		const before = picture([A, B], [AB]);
		const after = picture([A], []);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const borrowed = surface.querySelector<SVGGElement>(`g[data-semantic-id="n2"]`);
		const line = surface.querySelector<SVGGElement>(`g[data-semantic-id="e1"]`);
		expect(borrowed?.style.pointerEvents).toBe("none");
		expect(Number(borrowed?.style.opacity)).toBe(1);
		expect(Number(line?.style.opacity)).toBe(1);
		transition.seek(PICTURE_TRANSITION_PHASES.exitEnd);
		expect(Number(borrowed?.style.opacity)).toBe(0);
		expect(Number(line?.style.opacity)).toBe(0);
		// A borrowed line is drawn behind the cards, as the renderer draws lines.
		const order = [...surface.querySelectorAll("g[data-semantic-id]")].map((g) =>
			g.getAttribute("data-semantic-id"),
		);
		expect(order.indexOf("e1")).toBeLessThan(order.indexOf("n1"));
	});

	test("a subject only the new picture has waits for the moves, then a card grows in and a line draws on", () => {
		const surface = surfaceElement();
		const before = picture([A], []);
		const after = picture([A, B], [AB]);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const card = surface.querySelector<SVGGElement>(`g[data-semantic-id="n2"]`)!;
		const line = surface.querySelector<SVGGElement>(`g[data-semantic-id="e1"]`)!;
		const stroke = line.querySelectorAll("path")[1]!;
		expect(Number(card.style.opacity)).toBe(0);
		expect(Number(line.style.opacity)).toBe(0);
		expect(stroke.hasAttribute("marker-end")).toBe(false);
		expect(Number(stroke.getAttribute("stroke-dashoffset"))).toBeCloseTo(90, 3);
		transition.seek(PICTURE_TRANSITION_PHASES.enterStart);
		expect(Number(card.style.opacity)).toBe(0);
		transition.seek((PICTURE_TRANSITION_PHASES.enterStart + 1) / 2);
		expect(Number(card.style.opacity)).toBeGreaterThan(0);
		expect(card.getAttribute("transform")).toMatch(/scale\(0\.9/);
		expect(Number(stroke.getAttribute("stroke-dashoffset"))).toBeLessThan(90);
		transition.seek(1);
		expect(Number(card.style.opacity)).toBe(1);
		expect(card.getAttribute("transform")).toMatch(/scale\(1\)/);
		expect(Number(stroke.getAttribute("stroke-dashoffset"))).toBe(0);
		expect(stroke.getAttribute("marker-end")).toBe("url(#head)");
	});

	test("a smaller next page does not cut off the last picture in flight, and lands sized to its own page", () => {
		const surface = surfaceElement();
		const before = picture([A, B], [AB]);
		const after = picture([A], [], { width: 150, height: 90 });
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		const root = surface.querySelector<SVGSVGElement>("svg")!;
		// Beta sits beyond the new page's width, and is still leaving.
		expect(surface.querySelector(`g[data-semantic-id="n2"]`)).not.toBeNull();
		expect(root.getAttribute("width")).toBe("150");
		expect(root.style.overflow).toBe("visible");
		transition.seek(0.5);
		expect(root.style.overflow).toBe("visible");
		transition.finish();
		const landed = surface.querySelector<SVGSVGElement>("svg")!;
		expect(landed.style.overflow).toBe("");
		expect(landed.getAttribute("width")).toBe("150");
	});

	test("a picture carried with a shift starts that far back, eases home with the cards, and lands untouched", () => {
		const surface = surfaceElement();
		const before = picture([A, B], [AB]);
		const after = picture([A, B], [], { width: 800 });
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after, { x: 40, y: -12 });
		const root = surface.querySelector<SVGSVGElement>("svg")!;
		/**
		 * How far the picture is translated, as numbers.
		 * @returns The translation.
		 */
		const offset = (): number[] =>
			[...root.style.transform.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]));
		expect(offset()).toEqual([-40, 12]);
		transition.seek(0.5);
		expect(Math.abs(offset()[0]!)).toBeLessThan(40);
		transition.seek(1);
		expect(offset().map(Math.abs)).toEqual([0, 0]);
		transition.finish();
		expect(surface.querySelector<SVGSVGElement>("svg")!.style.transform).toBe("");
	});

	test("finishing leaves exactly the picture the server drew", () => {
		const surface = surfaceElement();
		const before = picture([A, B], [AB]);
		const after = picture([{ ...A, title: "Alpha prime" }], []);
		surface.innerHTML = before.svg;
		const transition = transitionPicture(surface, before, after);
		transition.seek(0.5);
		transition.finish();
		const plain = document.createElement("div");
		plain.innerHTML = after.svg;
		expect(surface.innerHTML).toBe(plain.innerHTML);
	});
});

describe("which pictures are continuous", () => {
	test("another variant of the same board, read the same way, is; another board, view or ground is not", () => {
		const base = picture([A], []);
		expect(
			continuousPictures(
				base,
				picture([B], [], { variant: { id: "v2", name: "draft", lifecycle: "draft" } }),
			),
		).toBe(true);
		expect(continuousPictures(base, picture([A], [], { board: "other" }))).toBe(false);
		expect(continuousPictures(base, picture([A], [], { theme: "light" }))).toBe(false);
		const view = { id: "scope", name: "Scope", grammar: "architecture" as const };
		expect(continuousPictures(base, picture([A], [], { view }))).toBe(false);
		expect(continuousPictures(picture([A], [], { view }), picture([B], [], { view }))).toBe(true);
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
	usePictureTransition(surface, props.drawing, props.reducedMotion, keepStill);
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

describe("the surface across pictures", () => {
	test("a picture arriving mid-flight lands the flight, then flies to its own final state", () => {
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
		try {
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
		} finally {
			globalThis.requestAnimationFrame = realFrame;
			globalThis.cancelAnimationFrame = realCancel;
			performance.now = realNow;
		}
	});
});
