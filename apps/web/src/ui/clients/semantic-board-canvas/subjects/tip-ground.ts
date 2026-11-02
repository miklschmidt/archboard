// What a tip would hide, read off the picture as boxes on the screen.
//
// A card, a step, a label and a container's header count as they stand. A lit line counts
// along its ink, because the lines that leave a part are what a reader rests on it
// to see. A dim line and a container's frame are ground that a tip can stand on.

import {
	PART_ATTRIBUTE,
	SUBJECT_ATTRIBUTE,
} from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";
import {
	DIM_WORTH,
	LINE_WORTH,
	LIT_WORTH,
	type TipGround,
} from "#ui/rules/semantic-board-canvas/picture/tip-spot.ts";

/** How far apart a lit line is read, in pixels on the screen. */
const LINE_STEP = 24;
/** How wide a read of a lit line is, in pixels on the screen. */
const LINE_INK = 24;
/** What hiding the words of a presented walkthrough costs: they are what the reader is reading. */
const WORDS_WORTH = 4 * LIT_WORTH;

/** What a tip counts as solid: a group's part, or its kind for a whole subject. */
const SOLID_PARTS: ReadonlySet<string> = new Set(["header", "label", "node", "step"]);

/** How the picture's own units stand on the screen. */
interface PictureView {
	readonly left: number;
	readonly top: number;
	readonly scale: number;
}

/**
 * How the picture's own units stand on the screen.
 * @param picture The picture.
 * @returns Where its origin stands, and how many pixels a unit takes.
 */
function viewOf(picture: SVGSVGElement): PictureView {
	const box = picture.getBoundingClientRect();
	const view = picture.viewBox.baseVal;
	const scale = box.width / view.width;
	return { left: box.left - view.x * scale, top: box.top - view.y * scale, scale };
}

/**
 * The ink of a lit line.
 * @param group The line's group.
 * @param view How the picture stands on the screen.
 * @returns A box for each read along it.
 */
function lineGround(group: Element, view: PictureView): readonly TipGround[] {
	const line = group.querySelector<SVGGeometryElement>("path");
	if (line === null) return [];
	const length = line.getTotalLength();
	const reads = Math.ceil((length * view.scale) / LINE_STEP);
	return Array.from({ length: reads + 1 }, (_, read) => {
		const point = line.getPointAtLength((length * read) / reads);
		const left = view.left + point.x * view.scale - LINE_INK / 2;
		const top = view.top + point.y * view.scale - LINE_INK / 2;
		return {
			box: { left, top, right: left + LINE_INK, bottom: top + LINE_INK },
			worth: LINE_WORTH,
		};
	});
}

/**
 * Whether a group is a line's own, rather than one of its parts.
 * @param group The group.
 * @returns True for a line.
 */
function isLine(group: Element): boolean {
	return !group.hasAttribute(PART_ATTRIBUTE) && group.getAttribute("data-semantic-kind") === "edge";
}

/**
 * Whether a group draws something a tip must not stand on: a card, a step, a label or a header.
 * @param group The group.
 * @returns True when it does.
 */
function isSolid(group: Element): boolean {
	const part = group.getAttribute(PART_ATTRIBUTE);
	return SOLID_PARTS.has(part ?? group.getAttribute("data-semantic-kind") ?? "");
}

/**
 * What one drawn group of the picture puts on the ground.
 * @param group The group.
 * @param standing What the light leaves standing.
 * @param view How the picture stands on the screen.
 * @returns What a tip would hide of it.
 */
function groundOf(
	group: Element,
	standing: ReadonlySet<string>,
	view: PictureView,
): readonly TipGround[] {
	const lit = standing.has(group.getAttribute(SUBJECT_ATTRIBUTE) ?? "");
	if (isLine(group)) {
		return lit ? lineGround(group, view) : [];
	}
	return isSolid(group)
		? [{ box: group.getBoundingClientRect(), worth: lit ? LIT_WORTH : DIM_WORTH }]
		: [];
}

/**
 * The box of a presented walkthrough, which stands over the picture.
 * @param picture The picture.
 * @returns The box, or nothing outside a presentation.
 */
function walkthroughGround(picture: Element): readonly TipGround[] {
	const box = picture
		.closest("[data-slot='semantic-reading-area']")
		?.querySelector("[data-slot='semantic-presentation']");
	return box === null || box === undefined
		? []
		: [{ box: box.getBoundingClientRect(), worth: WORDS_WORTH }];
}

/**
 * Everything a tip would hide of the picture a part stands in.
 * @param part The element that draws the part.
 * @param standing What the light leaves standing, or null.
 * @returns What a tip would hide, on the screen.
 */
function tipGround(part: Element, standing: ReadonlySet<string> | null): readonly TipGround[] {
	const picture = part.closest("svg");
	if (picture === null) return [];
	const view = viewOf(picture);
	const lit = standing ?? new Set<string>();
	return [
		...[...picture.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)].flatMap((group) =>
			groundOf(group, lit, view),
		),
		...walkthroughGround(picture),
	];
}

export { tipGround };
