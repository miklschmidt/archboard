// The dock turns between its calm and live layouts without a cut. Both layouts
// are one set of parts, so when voice starts or ends the parts are already where
// the new layout puts them. This hook makes the eye see them get there: it
// remembers where each part stood, and when the layout changes it plays every
// part from its old place to its new one. The dock itself grows or shrinks, and
// the voice's plate changes shape, so the Talk key becomes the circle.
//
// A part that was not there before fades in. A part that is gone is gone at once,
// because it is no longer in the page to animate.

import { useLayoutEffect, useRef, type RefObject } from "react";

import { VOICE_MORPH_MS } from "@/shared/timing/voice";

/** A part's box, in pixels from the dock's top left corner, so a resized window does not move it. */
interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/** Where one part of the dock stood, and how round its corners were. */
interface Place {
	readonly rect: Box;
	readonly radius: string;
}

/** The dock as it stood: how tall it was and where each part was. */
interface Layout {
	readonly height: number;
	readonly places: ReadonlyMap<string, Place>;
}

/** The part whose shape changes: it is the key, and it is the circle. */
const PLATE = "plate";
/** The voice's button, which holds its plate and its words and leaves them to move themselves. */
const HOLDER = "voice";
/** How the dock's own animations are told apart from the page's. */
const GLIDE = "dock-glide";
/** Fast at first and slow to arrive, as the conversation's slide is. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Under this many pixels a part has not moved. */
const STILL_PX = 0.5;
/** The share of the glide a part that was not there waits before it fades in, so it arrives into a settled place. */
const FADE_DELAY = 0.3;

const GLIDE_OPTIONS: KeyframeAnimationOptions = {
	duration: VOICE_MORPH_MS,
	easing: EASE,
	id: GLIDE,
};

/**
 * The parts of the dock, by name.
 * @param dock The dock.
 * @returns Each part's element.
 */
function partsOf(dock: HTMLElement): ReadonlyMap<string, HTMLElement> {
	const parts = new Map<string, HTMLElement>();
	for (const node of dock.querySelectorAll<HTMLElement>("[data-part]")) {
		const name = node.dataset["part"];
		if (name !== undefined && name !== HOLDER) parts.set(name, node);
	}
	return parts;
}

/**
 * Where the dock and its parts stand now.
 * @param dock The dock.
 * @param parts Its parts.
 * @returns The layout.
 */
function layoutOf(dock: HTMLElement, parts: ReadonlyMap<string, HTMLElement>): Layout {
	const frame = dock.getBoundingClientRect();
	const places = new Map<string, Place>();
	for (const [name, node] of parts) {
		const { left, top, width, height } = node.getBoundingClientRect();
		const radius = name === PLATE ? getComputedStyle(node).borderTopLeftRadius : "";
		places.set(name, {
			rect: { left: left - frame.left, top: top - frame.top, width, height },
			radius,
		});
	}
	return { height: frame.height, places };
}

/**
 * The dock's own animations that are running.
 * @param dock The dock.
 * @returns They.
 */
function glides(dock: HTMLElement): Animation[] {
	if (typeof dock.getAnimations !== "function") return [];
	return dock.getAnimations({ subtree: true }).filter((animation) => animation.id === GLIDE);
}

/**
 * The plate as a keyframe: where it is, how big and how round.
 * @param place The shape.
 * @param left Its left edge from the plate's place at rest, in pixels.
 * @param top Its top edge from there, in pixels.
 * @returns The keyframe.
 */
function plateBox(place: Place, left: number, top: number): Keyframe {
	return {
		left: `${left}px`,
		top: `${top}px`,
		right: "auto",
		bottom: "auto",
		width: `${place.rect.width}px`,
		height: `${place.rect.height}px`,
		borderRadius: place.radius,
	};
}

/**
 * Play the plate from the shape it had to the shape it has: the key's box, then
 * the circle's, with the corners going from firm to round on the way.
 * @param node The plate.
 * @param before Where it stood.
 * @param now Where it stands.
 */
function morphPlate(node: HTMLElement, before: Place, now: Place): void {
	node.animate(
		[
			plateBox(before, before.rect.left - now.rect.left, before.rect.top - now.rect.top),
			plateBox(now, 0, 0),
		],
		GLIDE_OPTIONS,
	);
}

/**
 * Play one part from where it stood to where it stands.
 * @param name The part.
 * @param node Its element.
 * @param before Where it stood, when it was there.
 * @param now Where it stands.
 */
function playPart(name: string, node: HTMLElement, before: Place | undefined, now: Place): void {
	if (before === undefined) {
		node.animate(
			[
				{ opacity: 0, offset: 0 },
				{ opacity: 0, offset: FADE_DELAY },
				{ opacity: 1, offset: 1 },
			],
			GLIDE_OPTIONS,
		);
		return;
	}
	if (name === PLATE) {
		morphPlate(node, before, now);
		return;
	}
	const dx = before.rect.left - now.rect.left;
	const dy = before.rect.top - now.rect.top;
	if (Math.abs(dx) < STILL_PX && Math.abs(dy) < STILL_PX) return;
	node.animate({ transform: [`translate(${dx}px, ${dy}px)`, "none"] }, GLIDE_OPTIONS);
}

/**
 * Play the dock from the layout it had to the one it has. The dock is held at its
 * old height while the parts are measured, so each starts exactly where it was,
 * and then it grows or shrinks to its new height as they settle.
 * @param dock The dock.
 * @param first The layout it had.
 * @returns The layout it has now, once it has settled.
 */
function glide(dock: HTMLElement, first: Layout): Layout {
	for (const running of glides(dock)) running.cancel();
	const parts = partsOf(dock);
	const settled = layoutOf(dock, parts);
	dock.style.height = `${first.height}px`;
	const start = layoutOf(dock, parts);
	dock.style.height = "";
	dock.animate({ height: [`${first.height}px`, `${settled.height}px`] }, GLIDE_OPTIONS);
	for (const [name, node] of parts) {
		const now = start.places.get(name);
		if (now !== undefined) playPart(name, node, first.places.get(name), now);
	}
	return settled;
}

/**
 * Whether the dock should glide: its layout changed, motion is wanted, there was
 * a layout to glide from, and the browser can animate.
 * @param element The dock.
 * @param changed Whether the layout changed.
 * @param reducedMotion Whether the person asked for no motion.
 * @param stood Where the dock stood.
 * @returns True when it should.
 */
function shouldGlide(
	element: HTMLElement,
	changed: boolean,
	reducedMotion: boolean,
	stood: Layout | null,
): boolean {
	const can = stood !== null && typeof element.animate === "function";
	return changed && !reducedMotion && can;
}

/**
 * Let the dock move between its calm and live layouts instead of cutting.
 * @param dock The dock's element.
 * @param live Whether the dock is in its live layout.
 * @param reducedMotion Whether the person asked for no motion: the layouts then cut.
 */
function useDockMotion(
	dock: RefObject<HTMLElement | null>,
	live: boolean,
	reducedMotion: boolean,
): void {
	const stood = useRef<Layout | null>(null);
	const was = useRef(live);
	useLayoutEffect(() => {
		const element = dock.current;
		if (element === null) return;
		const changed = was.current !== live;
		was.current = live;
		if (stood.current !== null && shouldGlide(element, changed, reducedMotion, stood.current)) {
			stood.current = glide(element, stood.current);
		} else if (glides(element).length === 0) {
			stood.current = layoutOf(element, partsOf(element));
		}
	});
}

export { useDockMotion };
