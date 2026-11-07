// The orb's stage on a page that lays nothing out, for the owners of the stage
// (tests/ui/workbench-client/orb/state). Each socket is given a box by hand, the holder sits where
// its socket is, the frames a flight runs on are stepped by hand, and the holder's fade runs only
// when a test runs it.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "bun:test";

import {
	createOrbStage,
	type OrbFrames,
	type OrbHome,
	type OrbStage,
} from "#ui/workbench-client/orb/state/orb-stage.ts";

/**
 * Give the test file that calls it a page: the DOM, and what the stylesheet does with the holder,
 * without its fade. Each test starts on an empty page that is not fullscreen.
 */
function onStagePage(): void {
	beforeAll(() => {
		GlobalRegistrator.register();
		Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
		// Lit, the holder shows, and dark it does not.
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
		Reflect.deleteProperty(document, "fullscreenElement");
	});
}

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

/**
 * Run the holder's fade, which this DOM does not: some of the orb shows until the fade ends, and
 * the holder is told when it does.
 * @param stage The stage.
 * @returns How to end the fade.
 */
function fading(stage: OrbStage): () => void {
	stage.holder.style.opacity = "1";
	return function ended(): void {
		stage.holder.style.removeProperty("opacity");
		const event = new Event("transitionend");
		Object.defineProperty(event, "propertyName", { value: "opacity" });
		stage.holder.dispatchEvent(event);
	};
}

/**
 * A Narrate key's gold circle on the page, low on the right, as the foot of a presented
 * walkthrough's column has it.
 * @param x The middle's distance from the left of the window.
 * @param y The middle's distance from the top.
 * @returns The socket.
 */
function narrateKey(x = 900, y = 650): HTMLElement {
	const socket = homed(placed(document.createElement("div"), x, y, 64), "narrate");
	document.body.append(socket);
	return socket;
}

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

export {
	fading,
	homed,
	homes,
	inTheAir,
	narrateKey,
	placed,
	presentFullscreen,
	onStagePage,
	whereIs,
	type Homes,
};
