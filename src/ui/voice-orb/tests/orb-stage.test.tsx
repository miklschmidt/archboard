// Where the one voice orb is drawn, and how it gets from one home to the other.
//
// What is guarded: there is one orb, the same canvas in either home, so what it has drawn of the
// voice goes with it; it is flown between homes over the page and lands exactly in its socket;
// the opposite wish turns a flight round from where the orb is, not from where it began; and it
// is cut, never left in the air or lost, when motion is not wanted, when a home is not on screen,
// and when the socket it is in or heading for goes.
//
// This DOM lays nothing out, so each socket is given a box, and the frames a flight runs on are
// stepped by hand.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import { VOICE_FLIGHT_MS } from "@/shared/timing/voice";
import {
	OrbHost,
	OrbSlot,
	OrbStageProvider,
	createOrbStage,
	useOrbPlacement,
	type OrbFrames,
	type OrbHome,
	type OrbStage,
} from "@/ui/voice-orb";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
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
	// The holder is where its socket is, so an orb leaving a home leaves from its middle.
	stage.holder.getBoundingClientRect = holderBox(stage.holder);
	return { stage, frames, dock, box };
}

/**
 * Where the holder sits.
 * @param stage The stage.
 * @returns "dock" or "caption" in a socket, "air" over the page, or "garage".
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
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "caption", shown: true, fly: false });
	expect(whereIs(stage)).toBe("caption");
	expect(stage.holder.dataset["shown"]).toBe("true");
	stage.wish({ home: "dock", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
});

test("a dark orb fades where it is and is not carried anywhere", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "caption", shown: true, fly: false });
	stage.wish({ home: "dock", shown: false, fly: true });
	expect(whereIs(stage)).toBe("caption");
	expect(stage.holder.dataset["shown"]).toBe("false");
});

test("an orb is flown to its other home over the page and lands exactly in the socket", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");

	stage.wish({ home: "caption", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	frames.step(1000);
	expect(inTheAir(stage)).toEqual({ x: 100, y: 600 });

	frames.step(1000 + VOICE_FLIGHT_MS / 2);
	const halfway = inTheAir(stage);
	expect(halfway.x).toBeGreaterThan(100);
	expect(halfway.x).toBeLessThan(600);

	frames.step(1000 + VOICE_FLIGHT_MS);
	expect(whereIs(stage)).toBe("caption");
	expect(stage.holder.style.position).toBe("");
	expect(document.querySelector("[data-slot='voice-orb-layer']")).toBeNull();
	expect(frames.pending).toBe(0);
});

test("the opposite wish turns a flight round from where the orb is", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "caption", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_FLIGHT_MS * 0.6);
	const turned = inTheAir(stage);

	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(inTheAir(stage)).toEqual(turned);

	frames.step(5000);
	frames.step(5000 + VOICE_FLIGHT_MS);
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("an orb is cut and not flown when motion is not wanted or a home is not on screen", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "dock", shown: true, fly: true });

	stage.wish({ home: "caption", shown: true, fly: false });
	expect(whereIs(stage)).toBe("caption");

	// The dock is behind something that has no box on the page.
	placed(dock, 0, 0, 0);
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a socket that goes while the orb is in it, or flying to it, gives the orb to the other home", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "caption", shown: true, fly: false });
	withdrawBox();
	expect(whereIs(stage)).toBe("dock");

	const withdrawAgain = stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "caption", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	withdrawAgain();
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a dark orb in a socket that goes is kept in the garage, and lights from the dock's circle", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "caption", shown: true, fly: false });
	stage.wish({ home: "dock", shown: false, fly: true });
	withdrawBox();
	expect(whereIs(stage)).toBe("garage");

	// Voice starts again with the box wanted: the orb leaves the dock's circle for it.
	stage.offer("caption", homed(box, "caption"));
	stage.wish({ home: "caption", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 100, y: 600 });
});

test("an orb wanted in a home that is not there yet is in the other, and goes when the home comes", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.wish({ home: "caption", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
	stage.offer("caption", homed(box, "caption"));
	expect(whereIs(stage)).toBe("caption");
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
			<OrbSlot home="caption" data-testid="caption" />
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
			<Surfaces home="caption" shown />
		</OrbStageProvider>,
	);
	expect(canvases()).toEqual([canvas]);
	expect(view.getByTestId("caption").contains(canvas)).toBe(true);
	expect(view.getByTestId("dock").contains(canvas)).toBe(false);
});
