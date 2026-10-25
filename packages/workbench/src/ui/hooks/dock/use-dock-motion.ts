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

import { VOICE_MS } from "@archboard/timing";

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
/**
 * The parts that another part carries: the voice's button holds its plate and its
 * words, and the plate holds the orb. Each moves with what carries it.
 */
const CARRIED = new Set(["voice", "orb"]);
/** How the dock's own animations are told apart from the page's. */
const GLIDE = "dock-glide";
/** Fast at first and slow to arrive, as the conversation's slide is. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Under this many pixels a part has not moved. */
const STILL_PX = 0.5;
/** The share of the glide a part that was not there waits before it fades in, so it arrives into a settled place. */
const FADE_DELAY = 0.3;
/**
 * The share of the glide a key waits before it fades in as it grows out of a seat the orb has
 * left. It waits until the plate has all but arrived, so that no empty outline is seen
 * travelling down the dock on the way.
 */
const SEAT_DELAY = 0.4;

const GLIDE_OPTIONS: KeyframeAnimationOptions = {
	duration: VOICE_MS.morph,
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
		if (name !== undefined && !CARRIED.has(name)) parts.set(name, node);
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
 * How far a running glide has carried a part from its place at rest, in pixels.
 * @param node The part.
 * @returns The shift, nothing when it is not being carried.
 */
function shiftOf(node: HTMLElement): { readonly dx: number; readonly dy: number } {
	const { transform } = getComputedStyle(node);
	if (transform === "none" || typeof DOMMatrix !== "function") return { dx: 0, dy: 0 };
	const matrix = new DOMMatrix(transform);
	return { dx: matrix.m41, dy: matrix.m42 };
}

/**
 * Where a part looks to be while a glide still carries it: its place at rest, and
 * what the glide adds. The plate is carried by its own box, the others by a shift.
 * @param name The part.
 * @param node Its element.
 * @param rest Where it stood when the glide began to settle.
 * @returns The place the eye sees.
 */
function seenPlace(name: string, node: HTMLElement, rest: Place): Place {
	if (name !== PLATE) {
		const { dx, dy } = shiftOf(node);
		return {
			rect: { ...rest.rect, left: rest.rect.left + dx, top: rest.rect.top + dy },
			radius: rest.radius,
		};
	}
	const style = getComputedStyle(node);
	return {
		rect: {
			left: rest.rect.left + (Number.parseFloat(style.left) || 0),
			top: rest.rect.top + (Number.parseFloat(style.top) || 0),
			width: Number.parseFloat(style.width) || rest.rect.width,
			height: Number.parseFloat(style.height) || rest.rect.height,
		},
		radius: style.borderTopLeftRadius,
	};
}

/**
 * The dock as the eye sees it while a glide is running. The page has already
 * changed layout, so the parts cannot be measured: each is placed where the glide
 * it is in had settled it, plus what that glide has carried it by so far.
 * @param dock The dock.
 * @param stood The layout the running glide was heading to.
 * @param parts The parts, as they are now.
 * @returns The layout the eye sees.
 */
function seenLayout(
	dock: HTMLElement,
	stood: Layout,
	parts: ReadonlyMap<string, HTMLElement>,
): Layout {
	const places = new Map<string, Place>();
	for (const [name, rest] of stood.places) {
		const node = parts.get(name);
		places.set(name, node === undefined ? rest : seenPlace(name, node, rest));
	}
	return { height: dock.getBoundingClientRect().height, places };
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
 * The plate as a keyframe: where it is, how big and how round. It clips what it
 * holds while it moves, so the orb belongs to the shape that is changing.
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
		overflow: "clip",
	};
}

/**
 * Fade a part in once the glide has gone some way: nothing of it is seen until then.
 * @param node The part.
 * @param after The share of the glide to wait.
 */
function fadeIn(node: HTMLElement, after: number): void {
	node.animate(
		[
			{ opacity: 0, offset: 0 },
			{ opacity: 0, offset: after, easing: "ease-out" },
			{ opacity: 1, offset: 1 },
		],
		{ ...GLIDE_OPTIONS, easing: "linear" },
	);
}

/**
 * Whether the plate is a circle that becomes a key with nobody in it: the orb is leaving for the
 * voice box (the dock is marked data-boxed), so what was its seat must not be seen turning into
 * the key. The key grows out of it. The orb is told to leave after this motion has begun, so
 * whether it is still in the circle cannot be asked of the page here.
 * @param node The plate.
 * @param before Where it stood.
 * @param now Where it stands.
 * @returns True when the orb leaves for the box and the plate goes from a circle to a key.
 */
function growsOutOfEmptySeat(node: HTMLElement, before: Place, now: Place): boolean {
	return before.rect.width < now.rect.width / 2 && node.closest("[data-boxed]") !== null;
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
	if (growsOutOfEmptySeat(node, before, now)) fadeIn(node, SEAT_DELAY);
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
		fadeIn(node, FADE_DELAY);
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
 * @param stood The layout it settled in.
 * @returns The layout it has now, once it has settled.
 */
function glide(dock: HTMLElement, stood: Layout): Layout {
	const parts = partsOf(dock);
	// A glide that is still running is what the eye sees, so a reversal starts from there.
	const first = glides(dock).length > 0 ? seenLayout(dock, stood, parts) : stood;
	for (const running of glides(dock)) running.cancel();
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
