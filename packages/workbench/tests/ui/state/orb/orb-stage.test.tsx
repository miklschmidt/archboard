// Where the one voice orb is drawn, and how it gets from one home to the other.
//
// What is guarded: there is one orb, the same canvas in either home, so what it has drawn of the
// voice goes with it; it is flown between homes over the page and lands exactly in its socket;
// the opposite wish turns a flight round from where the orb is, not from where it began; it is
// cut, never left in the air or lost, when motion is not wanted and when a home is not on screen;
// a socket that goes while the orb is in it, or flying to it, leaves the orb where it was, and the
// orb goes on from there to whichever home is offered next, with no stop in between; a dark orb
// waits in a home and not out of sight, and is lit where it is wanted and not flown there; a
// socket says whether the orb rests in it, which is how the stylesheet draws a seat only for an
// orb that is there; a surface can ask whether a home is on the page; and while the page is
// fullscreen, which paints nothing but the element presented, a flight crosses inside that element
// and a home outside it is not on screen.
//
// This DOM lays nothing out, so each socket is given a box, and the frames a flight runs on are
// stepped by hand.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import { VOICE_MS } from "@archboard/timing";
import { OrbHost, OrbSlot, OrbStageProvider } from "#ui/components/orb/OrbStage.tsx";
import {
	createOrbStage,
	type OrbFrames,
	type OrbHome,
	type OrbStage,
} from "#ui/state/orb/orb-stage.ts";
import { useOrbOffered, useOrbPlacement } from "#ui/hooks/orb/use-orb-stage.ts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	// What the stylesheet does with the holder, without its fade: lit it shows, dark it does not.
	const style = document.createElement("style");
	style.textContent = `
		[data-slot="voice-orb-holder"] { opacity: 0; }
		[data-slot="voice-orb-holder"][data-shown="true"] { opacity: 1; }
	`;
	document.head.append(style);
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

/** The frames of a flight, run only when a test steps them. */
class SteppedFrames implements OrbFrames {
	private next = 1;
	private readonly waiting = new Map<number, (time: number) => void>();

	/**
	 * Ask for a frame.
	 * @param callback What to run on it.
	 * @returns The request.
	 */
	request(callback: (time: number) => void): number {
		const request = this.next;
		this.next += 1;
		this.waiting.set(request, callback);
		return request;
	}

	/**
	 * Take a frame back.
	 * @param request The request.
	 */
	cancel(request: number): void {
		this.waiting.delete(request);
	}

	/**
	 * Run the frames that were asked for, at a time.
	 * @param time The time in milliseconds.
	 */
	step(time: number): void {
		const callbacks = [...this.waiting.values()];
		this.waiting.clear();
		for (const callback of callbacks) callback(time);
	}

	/**
	 * How many frames are waiting.
	 * @returns The count.
	 */
	get pending(): number {
		return this.waiting.size;
	}
}

/**
 * Where an element is, as a box of the size it is given, whatever the page lays out.
 * @param x The middle's distance from the left of the window.
 * @param y The middle's distance from the top.
 * @param size How wide and tall the box is.
 * @returns A way to read the box.
 */
function boxAt(x: number, y: number, size: number): () => DOMRect {
	return function rect(): DOMRect {
		return new DOMRect(x - size / 2, y - size / 2, size, size);
	};
}

/**
 * A socket laid out by hand: the element is where it is told to be, `size` across.
 * @param element The element.
 * @param x The middle's distance from the left of the window.
 * @param y The middle's distance from the top.
 * @param size How wide and tall it is.
 * @returns The element.
 */
function placed(element: HTMLElement, x: number, y: number, size: number): HTMLElement {
	element.getBoundingClientRect = boxAt(x, y, size);
	return element;
}

/** What the two homes are and where they are: the dock's circle low on the left, the box low in the middle. */
interface Homes {
	readonly stage: OrbStage;
	readonly frames: SteppedFrames;
	readonly dock: HTMLElement;
	readonly box: HTMLElement;
}

/**
 * Where a holder is: 84 across, with its middle on the middle of the socket it sits in.
 * @param holder The holder.
 * @returns A way to read the box.
 */
function holderBox(holder: HTMLElement): () => DOMRect {
	return function rect(): DOMRect {
		const socket = holder.parentElement?.getBoundingClientRect();
		if (socket === undefined) return new DOMRect();
		return new DOMRect(
			socket.left + socket.width / 2 - 42,
			socket.top + socket.height / 2 - 42,
			84,
			84,
		);
	};
}

/**
 * A stage with two sockets, neither offered yet.
 * @returns The stage, its frames and the sockets.
 */
function homes(): Homes {
	const frames = new SteppedFrames();
	const stage = createOrbStage(frames);
	const dock = placed(document.createElement("div"), 100, 600, 64);
	const box = placed(document.createElement("div"), 600, 700, 64);
	document.body.append(dock, box);
	// The garage is on the page, as it is in the application: a holder in a tree that is not has no style to read.
	stage.connect();
	// The holder is where its socket is, so an orb leaving a home leaves from its middle.
	stage.holder.getBoundingClientRect = holderBox(stage.holder);
	return { stage, frames, dock, box };
}

/**
 * Where the holder sits.
 * @param stage The stage.
 * @returns "dock" or "box" in a socket, "air" over the page, or "garage".
 */
function whereIs(stage: OrbStage): string {
	const parent = stage.holder.parentElement;
	if (parent === null) return "nowhere";
	const slot = parent.getAttribute("data-slot");
	if (slot === "voice-orb-layer") return "air";
	if (slot === "voice-orb-garage") return "garage";
	return parent.getAttribute("data-home") ?? "nowhere";
}

/**
 * Give a socket the home it is the place of.
 * @param element The socket.
 * @param home The home.
 * @returns The socket.
 */
function homed(element: HTMLElement, home: OrbHome): HTMLElement {
	element.dataset["home"] = home;
	return element;
}

/**
 * The middle of the orb in the air, from the transform the stage gave its holder.
 * @param stage The stage.
 * @returns Where it is.
 */
function inTheAir(stage: OrbStage): { x: number; y: number } {
	const match = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(stage.holder.style.transform);
	if (match === null) throw new Error(`The orb is not in the air: ${stage.holder.style.transform}`);
	return { x: Number(match[1]) + 42, y: Number(match[2]) + 42 };
}

test("the orb rests in the home it is wanted in, and it is the one holder in either", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("true");
	stage.wish({ home: "dock", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
});

test("a dark orb fades where it is and is not carried anywhere", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "dock", shown: false, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("false");
});

test("an orb is flown to its other home over the page and lands exactly in the socket", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	frames.step(1000);
	expect(inTheAir(stage)).toEqual({ x: 100, y: 600 });

	frames.step(1000 + VOICE_MS.flight / 2);
	const halfway = inTheAir(stage);
	expect(halfway.x).toBeGreaterThan(100);
	expect(halfway.x).toBeLessThan(600);

	frames.step(1000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.style.position).toBe("");
	expect(document.querySelector("[data-slot='voice-orb-layer']")).toBeNull();
	expect(frames.pending).toBe(0);
});

test("the opposite wish turns a flight round from where the orb is", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_MS.flight * 0.6);
	const turned = inTheAir(stage);

	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(inTheAir(stage)).toEqual(turned);

	frames.step(5000);
	frames.step(5000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("an orb is cut and not flown when motion is not wanted or a home is not on screen", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });

	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("box");

	// The dock is behind something that has no box on the page.
	placed(dock, 0, 0, 0);
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a socket that goes while the orb rests in it leaves the orb in the other home, cut when motion is not wanted", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	withdrawBox();
	expect(whereIs(stage)).toBe("dock");
});

test("a socket that goes while the orb flies to it sends the orb on from where it was", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_MS.flight * 0.5);
	const left = inTheAir(stage);

	withdrawBox();
	// Still in the air, where it was: it is not dropped in the dock, and it does not jump.
	expect(whereIs(stage)).toBe("air");
	expect(inTheAir(stage)).toEqual(left);

	frames.step(10_000);
	frames.step(10_000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a box that moves to another pane takes the orb on from where it was, and the orb never stops in the dock", () => {
	const { stage, frames, dock, box } = homes();
	const elsewhere = placed(document.createElement("div"), 900, 300, 64);
	document.body.append(elsewhere);
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");

	// The old box goes and the new one is offered in the same commit.
	withdrawBox();
	stage.offer("box", homed(elsewhere, "box"));
	expect(whereIs(stage)).toBe("air");
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 600, y: 700 });
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.parentElement).toBe(elsewhere);
});

test("a dark orb in a socket that goes waits in the home that is left, and is lit where it is wanted next", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "dock", shown: false, fly: true });
	withdrawBox();
	expect(whereIs(stage)).toBe("dock");

	// Voice starts again with the box wanted: the orb is dark, so it is not launched out of the
	// dock's circle. It is lit in the box.
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("true");
	expect(frames.pending).toBe(0);
});

test("a flight carries an orb that is seen: a dark one, and one only just lit, are lit where they are wanted", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	expect(whereIs(stage)).toBe("dock");
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);

	// Lit in the dock, and asked for in the box before its fade-in has shown anything.
	stage.wish({ home: "dock", shown: false, fly: false });
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.holder.style.opacity = "0.1";
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});

test("a socket says whether the orb rests in it, in the air neither does, and the one it lands in does at once", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		true,
		false,
	]);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		false,
		false,
	]);

	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		false,
		true,
	]);
});

test("a dark orb waits in the first home that is offered, and out of sight only while there is none", () => {
	const { stage, dock } = homes();
	expect(whereIs(stage)).toBe("garage");
	stage.offer("dock", homed(dock, "dock"));
	expect(whereIs(stage)).toBe("dock");
	expect(stage.holder.dataset["shown"]).toBe("false");
});

test("a home says whether it has a socket, and who hears of a socket coming or going is told", () => {
	const { stage, dock, box } = homes();
	let told = 0;
	const stopHearing = stage.subscribe(() => {
		told += 1;
	});
	expect(stage.offered("box")).toBe(false);
	const withdraw = stage.offer("box", homed(box, "box"));
	expect(stage.offered("box")).toBe(true);
	expect(stage.offered("dock")).toBe(false);
	withdraw();
	expect(stage.offered("box")).toBe(false);
	expect(told).toBe(2);

	stopHearing();
	stage.offer("dock", homed(dock, "dock"));
	expect(told).toBe(2);
});

test("an orb wanted in a home that is not there yet is in the other, and goes when the home comes", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
	stage.offer("box", homed(box, "box"));
	expect(whereIs(stage)).toBe("box");
});

/**
 * The surfaces of a page that has the orb: both homes, and the one orb drawn.
 * @param props Where the orb is wanted.
 * @param props.home The home.
 * @param props.shown Whether it is lit.
 * @returns The surfaces.
 */
function Surfaces(props: { readonly home: OrbHome; readonly shown: boolean }): JSX.Element {
	useOrbPlacement({ home: props.home, shown: props.shown, reducedMotion: true });
	return (
		<>
			<OrbSlot home="dock" data-testid="dock" />
			<OrbSlot home="box" data-testid="box" />
			<OrbHost mode="listening" level={silence} reducedMotion />
		</>
	);
}

/**
 * The voice's level, which is none.
 * @returns Silence.
 */
function silence(): number {
	return 0;
}

/**
 * The orbs the page draws.
 * @returns Their canvases.
 */
function canvases(): HTMLCanvasElement[] {
	return [...document.querySelectorAll("canvas")];
}

test("the page draws one canvas, and it is the same canvas in whichever home it is in", () => {
	const view = render(
		<OrbStageProvider>
			<Surfaces home="dock" shown />
		</OrbStageProvider>,
	);
	expect(canvases()).toHaveLength(1);
	const [canvas] = canvases();
	if (canvas === undefined) throw new Error("The page draws no orb.");
	expect(view.getByTestId("dock").contains(canvas)).toBe(true);

	view.rerender(
		<OrbStageProvider>
			<Surfaces home="box" shown />
		</OrbStageProvider>,
	);
	expect(canvases()).toEqual([canvas]);
	expect(view.getByTestId("box").contains(canvas)).toBe(true);
	expect(view.getByTestId("dock").contains(canvas)).toBe(false);
});

/**
 * What a surface that asks whether the box is on the page sees.
 * @returns The answer, in a node a test can read.
 */
function AsksForTheBox(): JSX.Element {
	return <output data-testid="asked">{String(useOrbOffered("box"))}</output>;
}

test("a surface that asks for a home is told when its socket is on the page and when it is gone", () => {
	const view = render(
		<OrbStageProvider>
			<AsksForTheBox />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("false");

	view.rerender(
		<OrbStageProvider>
			<AsksForTheBox />
			<OrbSlot home="box" />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("true");

	view.rerender(
		<OrbStageProvider>
			<AsksForTheBox />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("false");
});

/**
 * Present an element fullscreen, as far as the stage can tell, for the length of a test.
 * @param presented The element, or null to leave fullscreen.
 */
function presentFullscreen(presented: HTMLElement | null): void {
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		value: presented,
	});
}

afterEach(() => {
	Reflect.deleteProperty(document, "fullscreenElement");
});

test("while the page is fullscreen a flight crosses inside the element presented, the only one the browser paints", () => {
	const { stage, frames, dock, box } = homes();
	const presented = document.createElement("div");
	document.body.append(presented);
	presented.append(dock, box);
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	presentFullscreen(presented);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(stage.holder.parentElement?.parentElement).toBe(presented);
	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
});

test("a home outside the element presented is not on screen, so the orb is cut to and from it and not flown", () => {
	const { stage, frames, dock, box } = homes();
	const presented = document.createElement("div");
	document.body.append(presented);
	presented.append(box);
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	presentFullscreen(presented);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a flight in the air when the page goes fullscreen lands where it was going", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");

	presentFullscreen(document.body);
	document.dispatchEvent(new Event("fullscreenchange"));
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});
