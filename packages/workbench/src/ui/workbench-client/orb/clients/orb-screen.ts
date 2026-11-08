// Where the orb is on the page, for the stage that flies it: what the page paints, whether an
// element is on screen to be left from or met, where the middle of a box is, how the holder is
// drawn in the air, how much of the orb shows, and the page's frames a flight runs on.

import type { Spot } from "#ui/workbench-client/orb/rules/orb-flight.ts";
import { SIZE } from "#ui/workbench-client/orb/clients/orb-painter.ts";

/** How much of the orb must be showing for it to be worth a flight: half. Below it the orb is as good as dark. */
const SEEN = 0.5;

/**
 * Whether a box takes room on the page.
 * @param rect The box.
 * @returns True when it has a width and a height.
 */
function isDrawn(rect: DOMRect): boolean {
	return rect.width > 0 && rect.height > 0;
}

/**
 * Whether a box is in the window, at least in part.
 * @param rect The box.
 * @returns True when it is.
 */
function isInView(rect: DOMRect): boolean {
	return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
}

/**
 * What the page paints: the element presented fullscreen when there is one, because the browser
 * paints nothing outside it, and the page itself otherwise.
 * @returns The element.
 */
function painted(): HTMLElement {
	const presented = document.fullscreenElement;
	return presented instanceof HTMLElement ? presented : document.body;
}

/**
 * Whether an element is on screen: in what the page paints, and in the window.
 * @param element The element.
 * @returns True when it is.
 */
function isOnScreen(element: HTMLElement): boolean {
	return painted().contains(element) && isInView(element.getBoundingClientRect());
}

/**
 * Where the middle of a box is, with the orb drawn at its own size there.
 * @param rect The box.
 * @returns The spot.
 */
function spotOf(rect: DOMRect): Spot {
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale: 1 };
}

/**
 * Where an element is, as a spot, or null when it is not on screen to be left from or met.
 * @param element The element.
 * @returns The spot.
 */
function spotIn(element: HTMLElement): Spot | null {
	const rect = element.getBoundingClientRect();
	return isDrawn(rect) && isOnScreen(element) ? spotOf(rect) : null;
}

/**
 * Draw the holder at a spot in the layer: fixed to the window, moved by a transform of its own.
 * @param holder The holder.
 * @param spot Where.
 */
function placeInLayer(holder: HTMLElement, spot: Spot): void {
	const half = SIZE / 2;
	Object.assign(holder.style, {
		position: "fixed",
		left: "0",
		top: "0",
		translate: "none",
		transform: `translate3d(${spot.x - half}px, ${spot.y - half}px, 0) scale(${spot.scale})`,
	});
}

/**
 * Whether the orb can be seen: it is lit, and not still on its way to being lit.
 * @param holder The holder.
 * @returns True when at least half of it shows.
 */
function isSeen(holder: HTMLElement): boolean {
	return Number.parseFloat(getComputedStyle(holder).opacity) >= SEEN;
}

/**
 * Whether none of the orb shows: its fade out has ended, or it never faded in.
 * @param holder The holder.
 * @returns True when it is out of sight.
 */
function isDark(holder: HTMLElement): boolean {
	return Number.parseFloat(getComputedStyle(holder).opacity) === 0;
}

/**
 * Whether the orb was launched out of a Narrate key: it is lit from the start of its flight,
 * so it is flown as an orb that is seen.
 * @param holder The holder.
 * @returns True until it lands.
 */
function isLaunched(holder: HTMLElement): boolean {
	return holder.dataset["launched"] !== undefined;
}

/** What a stage asks of the page's frames. */
interface OrbFrames {
	/**
	 * Run something on the next frame.
	 * @param callback What to run, with the frame's time in milliseconds.
	 * @returns The request, to take back.
	 */
	readonly request: (callback: (time: number) => void) => number;
	/**
	 * Take back a request.
	 * @param request The request.
	 */
	readonly cancel: (request: number) => void;
}

/** The page's own frames. */
const PAGE_FRAMES: OrbFrames = {
	/**
	 * The next frame of the page.
	 * @param callback What to run.
	 * @returns The request.
	 */
	request: (callback) => requestAnimationFrame(callback),
	/**
	 * Take back a frame.
	 * @param request The request.
	 */
	cancel: (request) => {
		cancelAnimationFrame(request);
	},
};

export {
	PAGE_FRAMES,
	isDark,
	isDrawn,
	isLaunched,
	isOnScreen,
	isSeen,
	painted,
	placeInLayer,
	spotIn,
	spotOf,
	type OrbFrames,
};
