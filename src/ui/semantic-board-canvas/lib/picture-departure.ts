// A picture leaving a pane for another board.
//
// Leaving starts the moment somebody asks, not when the next board arrives: a
// pane that sat unchanged until then would feel as if the click had not been
// heard. Which way it leaves says where the reader went. Opening a card's board
// zooms on into that card as the picture fades, going back draws the picture
// away from the reader, and anything else simply fades. It ends invisible, so a
// slow draw leaves an empty pane rather than a board nobody is reading any more.
//
// When the next picture arrives while the last is still on its way out, what
// is left of the last is copied into a ghost that finishes fading on the same
// spot, over the arriving picture, so nothing is ever snatched away. It is laid
// over rather than under, and without the page ground it was drawn on: under,
// the arriving picture's own ground fading in would cover it inside that
// page's rectangle and cut it off there, a hard edge through a fade. The
// ghost is outside the camera's control: the camera has already been refitted
// for the picture arriving, and the ghost stays exactly where the reader last
// saw it.
//
// These are the browser's own animations rather than frames of this code's,
// because nothing here reads board content or needs a step drawn by hand.

import { PICTURE_EXIT_MS } from "@/shared/timing/timing";
import type { SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** Where the reader went, as far as the picture leaving is concerned. */
type DepartureWay =
	/** Into the board a card opens. */
	| "into"
	/** Back to the board above. */
	| "out"
	/** Anywhere else. */
	| "across";

/** A picture on its way out, and where the reader went. */
interface Departure {
	readonly way: DepartureWay;
	/** The card opened, when the reader went into one; its box in the picture leaving. */
	readonly toward: SemanticBox | null;
	/** The board being drawn next. */
	readonly board: string;
}

/** How far the picture grows as the reader goes into a card. */
const INTO_SCALE = 1.14;

/** How far it shrinks as the reader goes back out. */
const OUT_SCALE = 0.9;

/** How far it shrinks as the reader goes anywhere else. */
const ACROSS_SCALE = 0.98;

/** The curve a picture leaves on: slow to start, gone quickly. */
const LEAVE_EASING = "cubic-bezier(0.4, 0, 1, 1)";

/** Below this a picture is as good as gone, and needs no ghost. */
const VISIBLE_FLOOR = 0.02;

/**
 * Whether an element can be animated by the browser.
 * @param element The element.
 * @returns True when it has `animate`.
 */
function animatable(element: Element): boolean {
	return typeof (element as Partial<Pick<Element, "animate">>).animate === "function";
}

/** How a picture leaves: about which point, and how far it grows or shrinks. */
interface LeavingMotion {
	/** The origin, in the picture's pixels. */
	readonly origin: string;
	/** The scale it ends at. */
	readonly scale: number;
}

/** How far a picture grows or shrinks for each way the reader can go. */
const SCALES: Readonly<Record<DepartureWay, number>> = {
	into: INTO_SCALE,
	out: OUT_SCALE,
	across: ACROSS_SCALE,
};

/**
 * The middle of a box.
 * @param box The box.
 * @returns Its middle, as a CSS origin.
 */
function middle(box: SemanticBox): string {
	return `${box.x + box.width / 2}px ${box.y + box.height / 2}px`;
}

/**
 * How big a picture's own page is.
 * @param root The picture's root.
 * @returns Its page, at the origin.
 */
function pageOf(root: Element): SemanticBox {
	const width = Number.parseFloat(root.getAttribute("width") ?? "");
	const height = Number.parseFloat(root.getAttribute("height") ?? "");
	return { x: 0, y: 0, width: width || 0, height: height || 0 };
}

/**
 * How a picture leaves the way the reader went: into a card about that card,
 * otherwise about the middle of its page.
 * @param root The picture's root, sized to its own page.
 * @param departure Where the reader went.
 * @returns The motion.
 */
function leaving(root: Element, departure: Departure): LeavingMotion {
	const about = departure.way === "into" ? departure.toward : null;
	return { origin: middle(about ?? pageOf(root)), scale: SCALES[departure.way] };
}

/**
 * Send a picture on its way out.
 * @param root The picture's root.
 * @param departure Where the reader went.
 * @param reducedMotion Whether the person asked for no motion; then it is simply gone.
 */
function leavePicture(root: SVGElement, departure: Departure, reducedMotion: boolean): void {
	if (reducedMotion || !animatable(root)) {
		root.style.opacity = "0";
		return;
	}
	const { origin, scale } = leaving(root, departure);
	root.style.transformOrigin = origin;
	root.animate(
		[
			{ opacity: 1, transform: "none" },
			{ opacity: 0, transform: `scale(${scale})` },
		],
		{
			duration: PICTURE_EXIT_MS,
			easing: LEAVE_EASING,
			fill: "forwards",
		},
	);
}

/** A cancelled animation is not a failure. */
function ignoreCancel(): void {
	// The picture stayed; the animation that would have taken it away is simply dropped.
}

/**
 * Bring back a picture that was on its way out and is staying after all: the
 * reader came back to it before the next one arrived.
 * @param root The picture's root.
 */
function stayPicture(root: SVGElement): void {
	root.style.opacity = "";
	root.style.transformOrigin = "";
	if (typeof root.getAnimations === "function") {
		for (const animation of root.getAnimations()) {
			// Cancelling rejects what the animation promised; nobody is waiting on it.
			animation.finished.catch(ignoreCancel);
			animation.cancel();
		}
	}
}

/** A distance on screen, in pixels. */
interface Offset {
	readonly x: number;
	readonly y: number;
}

/**
 * A copy of a surface that nobody can reach, reads or picks from.
 * @param surface The surface.
 * @param moved How far to put it from where the surface is now.
 * @returns The copy and its picture, or null when the surface shows none.
 */
function ghostOf(
	surface: HTMLElement,
	moved: Offset,
): { readonly ghost: HTMLElement; readonly copy: SVGSVGElement } | null {
	const ghost = surface.cloneNode(true);
	const copy = ghost instanceof HTMLElement ? ghost.querySelector("svg") : null;
	if (!(ghost instanceof HTMLElement) || copy === null) {
		return null;
	}
	ghost.removeAttribute("data-slot");
	ghost.setAttribute("data-picture-ghost", "");
	ghost.setAttribute("aria-hidden", "true");
	ghost.style.pointerEvents = "none";
	ghost.style.transition = "none";
	// Where the pane was when the reader last saw it: whatever is around the
	// picture may have changed size for the board arriving, and moved it.
	ghost.style.translate = `${moved.x}px ${moved.y}px`;
	// The page ground is the arriving picture's to draw; the ghost is only what was on it.
	for (const ground of copy.querySelectorAll(":scope > rect")) {
		ground.remove();
	}
	return { ghost, copy };
}

/** How a picture looks at one moment, as far as leaving goes. */
interface Look {
	/** How visible it is. */
	readonly opacity: number;
	/** How it is transformed. */
	readonly transform: string;
	/** About where. */
	readonly origin: string;
}

/**
 * A surface's picture, when there is one still to be seen leaving.
 * @param surface The surface.
 * @returns The picture and how it looks now, or null when it is gone or cannot be animated.
 */
function visiblePicture(
	surface: HTMLElement,
): { readonly root: SVGSVGElement; readonly look: Look } | null {
	const root = surface.querySelector("svg");
	const look = root === null || !animatable(root) ? null : lookOf(root);
	return root !== null && look !== null && look.opacity > VISIBLE_FLOOR ? { root, look } : null;
}

/**
 * How a picture looks at this moment.
 * @param root The picture's root.
 * @returns Its look, or null outside a window.
 */
function lookOf(root: SVGSVGElement): Look | null {
	const view = root.ownerDocument.defaultView;
	if (view === null) {
		return null;
	}
	const style = view.getComputedStyle(root);
	return {
		opacity: Number.parseFloat(style.opacity || "1"),
		transform: style.transform || "none",
		origin: style.transformOrigin,
	};
}

/**
 * Where a picture that is already leaving goes from here: the way the reader
 * went, or simply on fading where it is.
 * @param root The picture's root.
 * @param look How it looks now.
 * @param heading Where the reader went, or null.
 * @returns The origin to leave about, and the transform to end at.
 */
function onwards(
	root: Element,
	look: Look,
	heading: Departure | null,
): { readonly origin: string; readonly transform: string } {
	if (heading === null) {
		return { origin: look.origin, transform: look.transform };
	}
	const motion = leaving(root, heading);
	return { origin: motion.origin, transform: `scale(${motion.scale})` };
}

/**
 * Leave a copy of what the surface shows now to finish leaving where it is,
 * over the picture about to be put there.
 *
 * Only a picture still visible gets one: a picture that finished leaving is
 * already gone. A picture the reader left before it had begun to go — the
 * next one was already to hand — goes the way the reader went all the same.
 * @param surface The surface, still showing the picture being replaced.
 * @param heading Where the reader went, or null when the next picture simply replaces this one.
 * @param moved How far the pane has moved since the reader last saw it, in pixels.
 */
function ghostPicture(surface: HTMLElement, heading: Departure | null, moved: Offset): void {
	const visible = visiblePicture(surface);
	const made = visible === null ? null : ghostOf(surface, moved);
	if (visible === null || made === null) {
		return;
	}
	const { look } = visible;
	const to = onwards(visible.root, look, heading);
	made.copy.style.transformOrigin = to.origin;
	surface.after(made.ghost);
	const fade = made.copy.animate(
		[
			{ opacity: look.opacity, transform: look.transform },
			{ opacity: 0, transform: to.transform },
		],
		{ duration: PICTURE_EXIT_MS * look.opacity, easing: "ease-out", fill: "forwards" },
	);
	fade.addEventListener("finish", () => {
		made.ghost.remove();
	});
}

export { ghostPicture, leavePicture, stayPicture, type Departure, type DepartureWay };
