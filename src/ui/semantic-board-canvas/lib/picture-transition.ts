// One picture of a board turning into the next, on the pane's surface.
//
// The renderer draws each picture whole and the pane edits no board content
// (ADR 0023), so a transition is not a matter of moving the pane's own boxes
// about: there are none. What the pane has is the last picture, the next one
// and the atlas of each, and the transition is a choreography over the next
// picture's own markup — every shared subject is started at its old geometry
// and carried to its new one, what only the old picture had is borrowed from
// it for long enough to fade, and what only the new one has waits its turn.
//
// The new picture is the live one from the first frame, so a pick made in
// flight lands on the board the pane is now showing. When the transition
// finishes the surface is given the new picture again, untouched, which is
// what makes every borrowed clone, wrapper and parked attribute disappear at
// once and leaves exactly what the server drew.
//
// Progress is handed in rather than read from a clock: whoever drives this
// owns the frame loop, and a test drives it by hand.

import { PICTURE_TRANSITION_PHASES } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { carryCard, growIn } from "@/ui/semantic-board-canvas/lib/picture-cards";
import { carryLine, drawOn } from "@/ui/semantic-board-canvas/lib/picture-lines";
import {
	TRANSITION_ATTRIBUTE,
	borrow,
	easeInOut,
	emphasised,
	easeOut,
	phase,
	scaleAbout,
	setOpacity,
	type Updater,
} from "@/ui/semantic-board-canvas/lib/picture-motion";
import {
	pairGroups,
	subjectGroups,
	type SubjectGroup,
} from "@/ui/semantic-board-canvas/lib/picture-pairing";
import { SUBJECT_ATTRIBUTE } from "@/ui/semantic-board-canvas/lib/subjects";

/** A transition in progress: where it is, and how it ends. */
interface PictureTransition {
	/**
	 * Draw the moment this far through, 0 at the old picture and 1 at the new.
	 * @param progress How far through, clamped to that range.
	 */
	readonly seek: (progress: number) => void;
	/** Land on the new picture exactly as the server drew it. */
	readonly finish: () => void;
}

/** How much a card leaving shrinks to. */
const LEAVE_SCALE = 0.96;

/** How far the page moved under the cards two pictures share, in picture units. */
interface Shift {
	readonly x: number;
	readonly y: number;
}

const NO_SHIFT: Shift = { x: 0, y: 0 };

/**
 * How far the cards two pictures share moved, taken together: the old centre of
 * the shared cards less their new centre.
 *
 * Another variant of a board is often laid out on a page of another size, with
 * a lane or a card added along one edge, and every card that stayed the same
 * then sits somewhere else on the page. A camera that stayed put would carry
 * the whole board across the pane; a camera moved by this keeps what the two
 * pictures share where the reader was looking at it, and only what changed
 * moves.
 * @param before The last picture.
 * @param after The next.
 * @returns The shift, or none when the pictures share no card.
 */
function sharedShift(before: SemanticDrawing, after: SemanticDrawing): Shift {
	let x = 0;
	let y = 0;
	let shared = 0;
	for (const [id, old] of Object.entries(before.atlas.nodes)) {
		const next = after.atlas.nodes[id];
		if (next === undefined) continue;
		x += old.x + old.width / 2 - (next.x + next.width / 2);
		y += old.y + old.height / 2 - (next.y + next.height / 2);
		shared += 1;
	}
	return shared === 0 ? NO_SHIFT : { x: x / shared, y: y / shared };
}

/**
 * Which view a picture was read through, or null for the whole variant.
 * @param drawing The picture.
 * @returns The view's id, or null.
 */
function viewOf(drawing: SemanticDrawing): string | null {
	return drawing.view?.id ?? null;
}

/**
 * Whether the next picture is one this pane can move to from the last.
 *
 * Only a picture of the same board, read the same way and drawn on the same
 * ground: another variant of it, or the same variant after an edit. Another
 * board, another view of this one or another theme is a different picture
 * with nothing to carry across, and is shown at once.
 * @param before The picture on the surface.
 * @param after The picture that arrived.
 * @returns True when the subjects of one are the subjects of the other.
 */
function continuousPictures(before: SemanticDrawing, after: SemanticDrawing): boolean {
	return (
		before.board === after.board && viewOf(before) === viewOf(after) && before.theme === after.theme
	);
}

/**
 * Put a picture on the surface, replacing whatever was there.
 *
 * The picture is a string of SVG from `/api/semantic-boards/render`, which is
 * this repository's own renderer: script-free, self-contained, and built from
 * the board's own content rather than from anything a person typed into the
 * browser. It is inserted rather than shown through an `<img>` because the
 * pane has to hit-test its groups, toggle the classes the embedded stylesheet
 * draws a selection with, and move its parts. Nothing else is ever put through
 * this property.
 * @param surface The element the picture is put into.
 * @param svg The picture.
 */
function stagePicture(surface: HTMLElement, svg: string): void {
	surface.innerHTML = svg;
}

/**
 * Swap one drawing of a subject for another in place, when there is no
 * geometry to carry it along: the old is borrowed and fades, the new fades in.
 * @param before The group in the last picture.
 * @param after The group in the next.
 * @returns The step.
 */
function swapInPlace(before: SubjectGroup, after: SubjectGroup): Updater {
	const clone = borrow(before.element);
	after.element.before(clone);
	const { fadeStart, fadeEnd } = PICTURE_TRANSITION_PHASES;
	return (progress: number): void => {
		const swapped = easeInOut(phase(progress, fadeStart, fadeEnd));
		setOpacity(clone, 1 - swapped);
		setOpacity(after.element, swapped);
	};
}

/**
 * Where a borrowed group goes in the new picture so that it is drawn at the
 * depth its kind is drawn at: a container behind everything, a connection
 * behind the cards, a card in front.
 * @param root The new picture.
 * @param kind The subject's kind.
 * @returns The group it goes in front of, or null for the front of the picture.
 */
function depthAnchor(root: Element, kind: string | null): Element | null {
	if (kind === "region") {
		return root.querySelector(`g[${SUBJECT_ATTRIBUTE}]`);
	}
	if (kind === "edge") {
		return root.querySelector(`g[${SUBJECT_ATTRIBUTE}][data-semantic-kind="node"]`);
	}
	return null;
}

/**
 * Let a subject only the old picture had leave: borrowed into the new picture,
 * it fades, and a card draws in on itself a little as it goes.
 * @param root The new picture.
 * @param group The group in the last picture.
 * @returns The step.
 */
function leave(root: Element, group: SubjectGroup): Updater {
	const clone = borrow(group.element);
	const anchor = depthAnchor(root, group.element.getAttribute("data-semantic-kind"));
	if (anchor === null) {
		root.append(clone);
	} else {
		anchor.before(clone);
	}
	const { exitEnd } = PICTURE_TRANSITION_PHASES;
	const box = group.box;
	return (progress: number): void => {
		const gone = easeOut(phase(progress, 0, exitEnd));
		setOpacity(clone, 1 - gone);
		if (box !== null) {
			clone.setAttribute("transform", scaleAbout(box, 1 - (1 - LEAVE_SCALE) * gone));
		}
	};
}

/**
 * The step that carries one shared subject group across.
 * @param before The group in the last picture.
 * @param after The group in the next.
 * @returns The step, or null when there is nothing to do for it.
 */
function carry(before: SubjectGroup, after: SubjectGroup): Updater | null {
	if (before.shape !== after.shape) {
		return swapInPlace(before, after);
	}
	if (after.shape === "line") {
		return carryLine(before, after);
	}
	return before.box === null || after.box === null
		? swapInPlace(before, after)
		: carryCard(before, before.box, after, after.box);
}

/**
 * Let a subject only the new picture has arrive.
 * @param group The group in the next picture.
 * @returns The step.
 */
function arrive(group: SubjectGroup): Updater {
	return group.shape === "line" ? drawOn(group) : growIn(group);
}

/** Nothing to draw: the finished picture is what is on the surface. */
function nothingToSeek(): void {
	// A transition between one picture and itself has no moments.
}

/**
 * Turn the picture on a surface into the next one.
 *
 * The next picture goes on the surface at once; the steps then draw each
 * moment of the change over it. The surface must be showing `before` as the
 * server drew it: a transition still in flight is finished first by whoever
 * drives this.
 * @param surface The element the picture is in.
 * @param before The picture on the surface.
 * @param after The picture to arrive at.
 * @param shift How far the camera moved to keep the shared cards still; the picture starts that far back and eases home.
 * @returns The transition, drawn at its start.
 */
function transitionPicture(
	surface: HTMLElement,
	before: SemanticDrawing,
	after: SemanticDrawing,
	shift: Shift = NO_SHIFT,
): PictureTransition {
	/** Land on the new picture exactly as the server drew it. */
	function finish(): void {
		stagePicture(surface, after.svg);
	}
	const holder = surface.ownerDocument.createElement("div");
	holder.innerHTML = before.svg;
	const oldRoot = holder.querySelector("svg");
	stagePicture(surface, after.svg);
	const root = surface.querySelector("svg");
	if (oldRoot === null || root === null || before.svg === after.svg) {
		return { seek: nothingToSeek, finish };
	}
	const pairing = pairGroups(
		subjectGroups(oldRoot, before.atlas),
		subjectGroups(root, after.atlas),
	);
	const steps: Updater[] = [
		...pairing.removed.map((group) => leave(root, group)),
		...pairing.shared.flatMap(({ before: old, after: next }) => carry(old, next) ?? []),
		...pairing.added.map(arrive),
	];
	// The new picture is sized to its own page from the first frame, and an SVG
	// clips what it draws to its box. Where the new page is smaller, the old
	// geometry being carried or borrowed would be cut off at the start of the
	// transition; it may draw past the page until the transition lands, when
	// the untouched picture is staged again.
	if (root instanceof SVGElement) {
		root.style.overflow = "visible";
	}
	/**
	 * Draw the moment this far through.
	 * @param progress How far through, 0 to 1.
	 */
	function seek(progress: number): void {
		const at = Math.min(1, Math.max(0, progress));
		for (const step of steps) {
			step(at);
		}
		if ((shift.x !== 0 || shift.y !== 0) && root instanceof SVGElement) {
			// The camera already moved by the shift; the picture starts that far
			// back and eases home with the cards, so the shared cards stay still.
			const { moveStart, moveEnd } = PICTURE_TRANSITION_PHASES;
			const left = 1 - emphasised(phase(at, moveStart, moveEnd));
			root.style.transform = `translate(${-shift.x * left}px, ${-shift.y * left}px)`;
		}
	}
	seek(0);
	return { seek, finish };
}

export {
	TRANSITION_ATTRIBUTE,
	continuousPictures,
	sharedShift,
	stagePicture,
	transitionPicture,
	type PictureTransition,
	type Shift,
};
