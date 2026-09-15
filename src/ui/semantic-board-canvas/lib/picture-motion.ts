// How the parts of a picture move: the curves, the boxes and the handful of
// attributes a transition writes.
//
// Shared by every step of a transition so that a card, a line and a label all
// move on the same curve and fade on the same curve. Nothing here knows what a
// subject is; it knows how far through a moment is and what to write for it.

import type { SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { cloneGroup } from "@/ui/semantic-board-canvas/lib/picture-pairing";

/** One step of the choreography: what to draw at some progress. */
type Updater = (progress: number) => void;

/** The attribute the wrappers a transition adds carry, so they can be told from the renderer's groups. */
const TRANSITION_ATTRIBUTE = "data-picture-transition";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * How far through one phase a moment is.
 * @param progress How far through the whole transition.
 * @param start Where the phase begins.
 * @param end Where it ends.
 * @returns 0 before it, 1 after it, and the fraction in between.
 */
function phase(progress: number, start: number, end: number): number {
	return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

/**
 * One axis of a cubic Bézier that starts at 0 and ends at 1.
 * @param a The first control point on that axis.
 * @param b The second.
 * @param u The parameter.
 * @returns The value.
 */
function bezierAxis(a: number, b: number, u: number): number {
	return 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u;
}

/**
 * The slope of one axis of that cubic.
 * @param a The first control point on that axis.
 * @param b The second.
 * @param u The parameter.
 * @returns The derivative.
 */
function bezierSlope(a: number, b: number, u: number): number {
	return 3 * a * (1 - u) * (1 - 3 * u) + 3 * b * u * (2 - 3 * u) + 3 * u * u;
}

/**
 * The curve a move follows: off quickly, settling slowly. This is the cubic
 * Bézier (0.2, 0, 0, 1), solved for x by Newton's method as browsers do.
 * @param t How far through, 0 to 1.
 * @returns How far along, 0 to 1.
 */
function emphasised(t: number): number {
	if (t <= 0 || t >= 1) {
		return Math.min(1, Math.max(0, t));
	}
	let u = t;
	for (let step = 0; step < 6; step += 1) {
		const gradient = bezierSlope(0.2, 0, u);
		if (gradient === 0) {
			break;
		}
		u -= (bezierAxis(0.2, 0, u) - t) / gradient;
	}
	return bezierAxis(0, 1, Math.min(1, Math.max(0, u)));
}

/**
 * The curve a fade follows: most of it early, the rest gently.
 * @param t How far through, 0 to 1.
 * @returns How far along, 0 to 1.
 */
function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

/**
 * The curve a cross-fade follows: gentle at both ends, so neither side is
 * seen to start or stop.
 * @param t How far through, 0 to 1.
 * @returns How far along, 0 to 1.
 */
function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * A box some way between two others.
 * @param a The box at 0.
 * @param b The box at 1.
 * @param t How far from a to b.
 * @returns The box.
 */
function mixBox(a: SemanticBox, b: SemanticBox, t: number): SemanticBox {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		width: a.width + (b.width - a.width) * t,
		height: a.height + (b.height - a.height) * t,
	};
}

/**
 * Whether two boxes are the same size.
 * @param a One box.
 * @param b The other.
 * @returns True when width and height match.
 */
function sameSize(a: SemanticBox, b: SemanticBox): boolean {
	return a.width === b.width && a.height === b.height;
}

/**
 * Whether two boxes are the same box.
 * @param a One box.
 * @param b The other.
 * @returns True when every side matches.
 */
function sameBox(a: SemanticBox, b: SemanticBox): boolean {
	return a.x === b.x && a.y === b.y && sameSize(a, b);
}

/**
 * Write a box onto a rect.
 * @param rect The rect.
 * @param box Where it goes.
 */
function setRect(rect: Element, box: SemanticBox): void {
	rect.setAttribute("x", String(box.x));
	rect.setAttribute("y", String(box.y));
	rect.setAttribute("width", String(Math.max(0, box.width)));
	rect.setAttribute("height", String(Math.max(0, box.height)));
}

/**
 * The transform that scales a group about the middle of a box.
 * @param box The box.
 * @param scale The scale.
 * @returns The attribute.
 */
function scaleAbout(box: SemanticBox, scale: number): string {
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	return `translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`;
}

/**
 * Set how visible a group is, under whatever the renderer already said.
 *
 * A ghosted subject in a proposal carries its own `opacity`, and a fade is a
 * fade of that, not a replacement for it.
 * @param element The group.
 * @param visible How visible, 0 to 1.
 */
function setOpacity(element: SVGElement, visible: number): void {
	const base = Number.parseFloat(element.getAttribute("opacity") ?? "1");
	element.style.opacity = String((Number.isFinite(base) ? base : 1) * visible);
}

/**
 * A group's direct paths that draw something.
 * @param group The group.
 * @returns The paths, in drawing order.
 */
function drawnPaths(group: Element): SVGPathElement[] {
	return [...group.children].filter(
		(child): child is SVGPathElement => child instanceof SVGPathElement && child.hasAttribute("d"),
	);
}

/**
 * A borrowed copy of a group from the last picture, drawn but not picked.
 *
 * Its crossing mask is taken off: the mask is defined in the picture it came
 * from, and would cut gaps where nothing crosses here.
 * @param group The group.
 * @returns The copy.
 */
function borrow(group: SVGGElement): SVGGElement {
	const clone = cloneGroup(group);
	clone.removeAttribute("mask");
	clone.style.pointerEvents = "none";
	return clone;
}

/**
 * Wrap elements in a group of the transition's own.
 * @param owner The document.
 * @param role What the wrapper holds.
 * @param members What goes in it.
 * @returns The wrapper, with the members moved into it.
 */
function wrapContent(owner: Document, role: string, members: readonly Element[]): SVGGElement {
	const wrapper = owner.createElementNS(SVG_NS, "g");
	wrapper.setAttribute(TRANSITION_ATTRIBUTE, role);
	wrapper.append(...members);
	return wrapper;
}

export {
	SVG_NS,
	TRANSITION_ATTRIBUTE,
	borrow,
	drawnPaths,
	easeInOut,
	easeOut,
	emphasised,
	mixBox,
	phase,
	sameBox,
	sameSize,
	scaleAbout,
	setOpacity,
	setRect,
	wrapContent,
	type Updater,
};
