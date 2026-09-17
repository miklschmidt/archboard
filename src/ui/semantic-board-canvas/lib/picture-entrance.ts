// A picture arriving on a pane with nothing to carry it from: the first
// picture of a page, another board, another view of this one.
//
// A transition can move what two pictures share; here nothing is shared, so the
// picture is built up the way it is read instead. Frames first, fading in, so
// the pane has its shape; then the cards, in a wave that runs down the board and
// a little across it, each growing into place; then the lines between cards
// that are already there, drawn from their start, with a line's label arriving
// as its line reaches it. Everything is timed by where it is on the board, not
// by how many there are, so a board of four cards and a board of forty take the
// same time to arrive and read as the same gesture.
//
// Like a transition, the picture is the live one from the first frame, and
// landing stages it again untouched.

import { PICTURE_ENTRY_PHASES } from "@/shared/timing/timing";
import type { SemanticBox, SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { growIn } from "@/ui/semantic-board-canvas/lib/picture-cards";
import { drawOn } from "@/ui/semantic-board-canvas/lib/picture-lines";
import {
	easeOut,
	phase,
	setOpacity,
	type Updater,
} from "@/ui/semantic-board-canvas/lib/picture-motion";
import { subjectGroups, type SubjectGroup } from "@/ui/semantic-board-canvas/lib/picture-pairing";
import { keepingMarks } from "@/ui/semantic-board-canvas/lib/subjects";
import {
	stagePicture,
	type PictureTransition,
} from "@/ui/semantic-board-canvas/lib/picture-transition";

/**
 * How much a step across the board counts against a step down it when a card's
 * turn is decided: the wave runs mostly downwards, and leans left to right.
 */
const ACROSS_WEIGHT = 0.35;

/** Where, in a line's own drawing, its label begins to arrive. */
const LABEL_AT = 0.55;

/** How much of the whole a label takes to arrive once its line reaches it. */
const LABEL_SPAN = 0.22;

/** A point on the board. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/**
 * Where a card sits in the wave: its middle.
 * @param box The card's box.
 * @returns The point.
 */
function middleOf(box: SemanticBox): Point {
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where a line begins: the first point its first drawn path moves to.
 * @param group The line's group.
 * @returns The point, or null when the route does not say.
 */
function lineStart(group: SubjectGroup): Point | null {
	const route = group.element.querySelector("path[d]")?.getAttribute("d") ?? "";
	const match = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/i.exec(route);
	return match === null ? null : { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * How far along the wave a point is.
 * @param point The point.
 * @returns The key; smaller arrives sooner.
 */
function waveKey(point: Point): number {
	return point.y + point.x * ACROSS_WEIGHT;
}

/**
 * Spread things over a window by where they are in the wave.
 * @param keys Each thing's place in the wave, or null for one that does not say.
 * @param first Where the first begins.
 * @param last Where the last begins.
 * @returns Where each begins, in the same order; one that does not say begins with the first.
 */
function spread(keys: readonly (number | null)[], first: number, last: number): number[] {
	const known = keys.filter((key) => key !== null);
	const low = Math.min(...known);
	const range = Math.max(...known) - low;
	return keys.map((key) =>
		key === null || range <= 0 ? first : first + ((key - low) / range) * (last - first),
	);
}

/**
 * Fade something in over the frames' part of the entrance.
 * @param element What to fade.
 * @returns The step.
 */
function fadeFrame(element: SVGElement): Updater {
	return (progress: number): void => {
		setOpacity(element, easeOut(phase(progress, 0, PICTURE_ENTRY_PHASES.framesEnd)));
	};
}

/**
 * Whether a group is a region's: a container's frame or its header.
 * @param group The group.
 * @returns True for a region.
 */
function isRegion(group: SubjectGroup): boolean {
	return group.element.getAttribute("data-semantic-kind") === "region";
}

/**
 * Whether a group is a label drawn for a connection.
 * @param group The group.
 * @returns True for a connection's label.
 */
function isLineLabel(group: SubjectGroup): boolean {
	return group.shape === "card" && group.element.getAttribute("data-semantic-kind") === "edge";
}

/**
 * The steps that draw the lines on, in the wave, and where each begins.
 * @param lines The lines.
 * @returns The steps, and where each subject's line begins.
 */
function lineSteps(lines: readonly SubjectGroup[]): {
	readonly steps: Updater[];
	readonly starts: Map<string, number>;
} {
	const { linesStart, linesStartBy, lineSpan } = PICTURE_ENTRY_PHASES;
	const begins = spread(
		lines.map((line) => {
			const start = lineStart(line);
			return start === null ? null : waveKey(start);
		}),
		linesStart,
		linesStartBy,
	);
	const starts = new Map<string, number>();
	const steps = lines.map((line, index) => {
		const begin = begins[index] ?? linesStart;
		starts.set(line.id, begin);
		return drawOn(line, begin, Math.min(1, begin + lineSpan));
	});
	return { steps, starts };
}

/**
 * The steps that grow the cards in, in the wave; a connection's label waits
 * for its line.
 * @param cards The cards.
 * @param lineStarts Where each subject's line begins.
 * @returns The steps.
 */
function cardSteps(
	cards: readonly SubjectGroup[],
	lineStarts: ReadonlyMap<string, number>,
): Updater[] {
	const { cardsStart, cardsStartBy, cardSpan, lineSpan } = PICTURE_ENTRY_PHASES;
	const begins = spread(
		cards.map((card) => (card.box === null ? null : waveKey(middleOf(card.box)))),
		cardsStart,
		cardsStartBy,
	);
	return cards.map((card, index) => {
		const line = isLineLabel(card) ? lineStarts.get(card.id) : undefined;
		if (line !== undefined) {
			const begin = Math.min(1, line + lineSpan * LABEL_AT);
			return growIn(card, begin, Math.min(1, begin + LABEL_SPAN));
		}
		const begin = begins[index] ?? cardsStart;
		return growIn(card, begin, Math.min(1, begin + cardSpan));
	});
}

/**
 * The steps for whatever the picture draws that belongs to no subject: its
 * background, a sequence's frame, a legend drawn into it. Faded with the frames,
 * so nothing is left standing on its own before the picture arrives.
 * @param root The picture's root.
 * @returns The steps.
 */
function groundSteps(root: Element): Updater[] {
	return [...root.children].flatMap((child) =>
		child instanceof SVGElement &&
		!["defs", "style"].includes(child.tagName) &&
		!child.hasAttribute("data-semantic-id") &&
		child.querySelector("[data-semantic-id]") === null
			? [fadeFrame(child)]
			: [],
	);
}

/** Nothing to draw: the picture could not be read, so it is simply shown. */
function nothingToSeek(): void {
	// A picture with no root has no parts to bring in.
}

/**
 * Bring a picture onto a surface part by part.
 * @param surface The element the picture goes in.
 * @param drawing The picture.
 * @returns The entrance, drawn at its start.
 */
function enterPicture(surface: HTMLElement, drawing: SemanticDrawing): PictureTransition {
	/** Land on the picture exactly as the server drew it, keeping the viewer's marks on it. */
	function finish(): void {
		keepingMarks(surface, () => {
			stagePicture(surface, drawing.svg);
		});
	}
	stagePicture(surface, drawing.svg);
	const root = surface.querySelector("svg");
	if (root === null) {
		return { seek: nothingToSeek, finish };
	}
	const groups = subjectGroups(root, drawing.atlas);
	const lines = lineSteps(groups.filter((group) => group.shape === "line"));
	const steps: Updater[] = [
		...groundSteps(root),
		...groups.filter(isRegion).map((group) => fadeFrame(group.element)),
		...cardSteps(
			groups.filter((group) => group.shape === "card" && !isRegion(group)),
			lines.starts,
		),
		...lines.steps,
	];
	/**
	 * Draw the moment this far through.
	 * @param progress How far through, 0 to 1.
	 */
	function seek(progress: number): void {
		const at = Math.min(1, Math.max(0, progress));
		for (const step of steps) {
			step(at);
		}
	}
	seek(0);
	return { seek, finish };
}

export { enterPicture };
