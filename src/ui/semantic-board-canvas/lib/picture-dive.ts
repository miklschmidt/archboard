// The board inside its card, and the fades of the flight that goes into it.
//
// While the camera flies into a card the board it opens is already there: its
// picture sits inside the card, in the parent's own coordinates, so the camera
// carries it along with no second layer to keep in step. What the card says
// goes first, so the board inside it is not read through its label; then the
// parent fades out as the board's picture comes up to its own size. Going back
// out is the same run the other way. These are the browser's own animations on
// the document's timeline, so a stepped clock stands them wherever it says they
// are.

import { EXPLORING_MS } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { Rect } from "@/ui/semantic-board-canvas/lib/camera";
import { runTraffic, stopTraffic } from "@/ui/semantic-board-canvas/lib/picture-traffic";

/** The mark the board's picture inside its card carries. */
const INSET_ATTRIBUTE = "data-dive-inset";

/** Which way the flight goes. */
type DiveWay = "in" | "out";

/** The viewport and the surface a flight happens on. */
interface Stage {
	readonly viewport: HTMLElement;
	readonly surface: HTMLElement;
}

/** What a flight put on the surface, which it takes away again. */
interface Dive {
	/** Take the fades away, and the board's picture with them. */
	readonly cancel: () => void;
}

/**
 * One of the parts of the pane that the camera is drawn through.
 * @param area The picture's area.
 * @param slot Which part.
 * @returns The element, or null when the area has none.
 */
function slotIn(area: HTMLElement | null, slot: string): HTMLElement | null {
	return area?.querySelector<HTMLElement>(`[data-slot='${slot}']`) ?? null;
}

/**
 * Whether a surface holds a picture and a browser that can fade it.
 * @param surface The surface.
 * @returns True when it can be flown over.
 */
function canFly(surface: HTMLElement): boolean {
	return typeof surface.animate === "function" && surface.querySelector(":scope > svg") !== null;
}

/**
 * The viewport and surface of a pane that can be flown over.
 * @param area The picture's area, which holds the viewport.
 * @returns The stage, or null when there is none to fly over.
 */
function stageIn(area: HTMLElement | null): Stage | null {
	const viewport = slotIn(area, "semantic-board-viewport");
	const surface = slotIn(area, "semantic-board-surface");
	if (viewport === null || surface === null) {
		return null;
	}
	return canFly(surface) ? { viewport, surface } : null;
}

/**
 * Put the board's picture inside the card, on the surface. It has no far view
 * of its own: it is drawn as the picture around it is, from far or near, so the
 * board that takes over from it at the end of the flight looks the same.
 * @param surface The surface, in the parent's picture units.
 * @param picture The board's picture, and how big it is.
 * @param inset Where it sits in the parent's picture.
 * @returns The element that holds it.
 */
function placeInset(
	surface: HTMLElement,
	picture: Pick<SemanticDrawing, "svg" | "width" | "height">,
	inset: Rect,
): HTMLElement {
	const holder = surface.ownerDocument.createElement("div");
	holder.innerHTML = picture.svg;
	// Made away from the page and its traffic run there, as the surface's own picture is.
	runTraffic(holder, 0);
	const root = holder.querySelector("svg");
	root?.setAttribute("viewBox", `0 0 ${picture.width} ${picture.height}`);
	root?.setAttribute("width", "100%");
	root?.setAttribute("height", "100%");
	const frame = surface.ownerDocument.createElement("div");
	frame.setAttribute(INSET_ATTRIBUTE, "");
	frame.setAttribute("aria-hidden", "true");
	frame.style.cssText =
		`position:absolute;left:${inset.x}px;top:${inset.y}px;width:${inset.width}px;` +
		`height:${inset.height}px;overflow:hidden;pointer-events:none`;
	frame.append(...holder.childNodes);
	surface.append(frame);
	return frame;
}

/**
 * Where in the flight into a card each picture is at which opacity: the board
 * above stays until the board inside the card can be made out, then gives way
 * to it before the card fills the pane.
 */
const IN: Readonly<Record<"parent" | "inset" | "words", readonly (readonly [number, number])[]>> = {
	// What the card itself says goes first, so the board inside it is not read through its label.
	words: [
		[0, 1],
		[0.1, 1],
		[0.28, 0],
		[1, 0],
	],
	parent: [
		[0, 1],
		[0.12, 1],
		[0.55, 0],
		[1, 0],
	],
	inset: [
		[0, 0],
		[0.04, 0],
		[0.3, 1],
		[1, 1],
	],
};

/**
 * The stops of a fade, in the order the flight meets them.
 * @param stops Opacity at points of the flight into the card, 0 to 1, in order.
 * @param way Into the card, or back out of it, which is the same fade run the other way.
 * @returns The stops.
 */
function alongFlight(
	stops: readonly (readonly [number, number])[],
	way: DiveWay,
): readonly (readonly [number, number])[] {
	return way === "in"
		? stops
		: stops.map(([offset, opacity]) => [1 - offset, opacity] as const).toReversed();
}

/**
 * The keyframes of one fade of a whole picture or frame, by its opacity.
 * @param stops Opacity at points of the flight into the card, 0 to 1, in order.
 * @param way Into the card, or back out of it.
 * @returns The keyframes.
 */
function fadeOf(stops: readonly (readonly [number, number])[], way: DiveWay): Keyframe[] {
	return alongFlight(stops, way).map(([offset, opacity]) => ({
		offset,
		opacity,
		easing: "ease-in-out",
	}));
}

/**
 * The keyframes of the fade of what a card says. It is a filter, not the
 * opacity: the picture's own style sheet sets the opacity of a card's near and
 * far words by how far away the camera is, and a fade of that would undo it.
 * @param stops Opacity at points of the flight into the card, 0 to 1, in order.
 * @param way Into the card, or back out of it.
 * @returns The keyframes.
 */
function wordsFadeOf(stops: readonly (readonly [number, number])[], way: DiveWay): Keyframe[] {
	return alongFlight(stops, way).map(([offset, opacity]) => ({
		offset,
		filter: `opacity(${opacity})`,
		easing: "ease-in-out",
	}));
}

/**
 * What a card on the picture says: its words near, and its name from far.
 * @param picture The picture's root.
 * @param card The card's id.
 * @returns The groups that hold them, or none when the card is not drawn.
 */
function wordsOf(picture: Element, card: string): Element[] {
	const group = [...picture.querySelectorAll(":scope > g[data-semantic-kind='node']")].find(
		(one) => one.getAttribute("data-semantic-id") === card,
	);
	return group === undefined
		? []
		: [...group.querySelectorAll(":scope > .ab-near, :scope > .ab-far")];
}

/** A cancelled animation promised nothing anyone is waiting for. */
function ignoreCancel(): void {}

/**
 * Put the board's picture inside its card on the surface, and start the fades
 * of the flight between it and the picture the surface holds.
 * @param surface The surface, holding the parent's picture.
 * @param picture The board's picture, and how big it is.
 * @param inset Where the board sits in the parent's picture.
 * @param way Into the card, or back out of it.
 * @param card The id of the card the board is inside, whose words go first.
 * @returns How to take it away again, or null when the surface holds no picture.
 */
function startDive(
	surface: HTMLElement,
	picture: Pick<SemanticDrawing, "svg" | "width" | "height">,
	inset: Rect,
	way: DiveWay,
	card: string,
): Dive | null {
	const parent = surface.querySelector(":scope > svg");
	if (parent === null) {
		return null;
	}
	const frame = placeInset(surface, picture, inset);
	const options = { duration: EXPLORING_MS.dive, fill: "both" as const };
	const fades = [
		parent.animate(fadeOf(IN.parent, way), options),
		frame.animate(fadeOf(IN.inset, way), options),
		...wordsOf(parent, card).map((words) => words.animate(wordsFadeOf(IN.words, way), options)),
	];
	return {
		/** Take the fades away, and the board's picture with them. */
		cancel: (): void => {
			for (const fade of fades) {
				fade.finished.catch(ignoreCancel);
				fade.cancel();
			}
			stopTraffic(frame);
			frame.remove();
		},
	};
}

/** The keys that move focus or change what a key means, which a flight leaves to the reader. */
const LEAVES = new Set(["Tab", "Shift", "Control", "Alt", "Meta"]);

/** The inputs that end a flight at its destination. */
const INTERRUPTS = ["pointerdown", "wheel", "keydown"] as const;

/**
 * Let the reader end a flight at its destination with a press, a turn of the
 * wheel or a key, and keep that input from also reaching the picture under it.
 * @param viewport The viewport.
 * @param end Land the flight.
 * @returns Stop listening.
 */
function endOnInput(viewport: HTMLElement, end: () => void): () => void {
	/**
	 * End the flight and swallow the input.
	 * @param event The input.
	 */
	const swallow = (event: Event): void => {
		if (event instanceof KeyboardEvent && LEAVES.has(event.key)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		end();
	};
	for (const name of INTERRUPTS) viewport.addEventListener(name, swallow, { capture: true });
	return (): void => {
		for (const name of INTERRUPTS) viewport.removeEventListener(name, swallow, { capture: true });
	};
}

export { endOnInput, startDive, stageIn, type DiveWay, type Stage };
