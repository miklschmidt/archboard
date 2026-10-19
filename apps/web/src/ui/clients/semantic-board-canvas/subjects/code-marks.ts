// The warning the viewer draws on a subject that the code check warns about.
//
// The findings of a code pass are not the board's. They come from the code, a
// pass runs only when somebody asks for one, and the server keeps the last one
// in memory (ADR 0046). So the renderer never draws them: a picture is drawn
// from the board alone and is the same bytes in a pane, an export and a
// recording (ADR 0023). The viewer draws them, in a layer it adds and takes
// away, as it draws a lit line's ink (ADR 0042).
//
// The mark is the picture's own warning triangle, in the place the picture
// puts it on a subject nobody has decided: the top-right corner of a part's
// body, and the leading edge of a relationship's or a message's words, or the
// middle of the longest straight run of a line that has none. One triangle
// means one thing on every subject: look at this before you trust it, and the
// selection tab says why. A subject that is undecided and warned about at once
// wears the two in one place, and the tab lists both.
//
// Each mark goes into the subject's own group, so it moves, recedes and ghosts
// with the subject, as the picture's own badge does. A line with no words has
// no group to hold it above the cards, so it gets one, as the picture gives
// such a line when it is undecided: a group of the line's words that holds only
// the mark.

import { cornerWarning, lineWarning } from "@archboard/renderer/picture";
import {
	lineTo,
	mix,
	parsePath,
	type Cubic,
	type Outline,
	type Point,
} from "#ui/rules/semantic-board-canvas/picture/path-reading.ts";

/** The attribute on a group that draws one part of a subject drawn in two (the renderer's). */
const PART_ATTRIBUTE_NAME = "data-semantic-part";

/** The attribute on every element the viewer added for a code warning. */
const CODE_MARK_ATTRIBUTE = "data-code-warning";

/** The SVG namespace, for the one group the viewer makes. */
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A numeric attribute of an element.
 * @param element The element.
 * @param name The attribute.
 * @returns Its value, or 0 when it is absent.
 */
function numberOf(element: Element, name: string): number {
	return Number(element.getAttribute(name) ?? 0);
}

/**
 * The first rectangle a group draws itself with, past its halo: a card's or a
 * container's body, or the plate under a relationship's or a message's words.
 * @param group The group.
 * @returns The rectangle, or null when the group draws none.
 */
function bodyRect(group: Element): Element | null {
	return group.querySelector(":scope > rect:not(.ab-halo)");
}

/**
 * Whether one segment of a read route is a straight run: the reader lifts a
 * straight leg to the cubic whose control points stand a third and two thirds
 * of the way along it, and a rounded corner's stand elsewhere.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @returns True for a straight run.
 */
function straight(from: Point, segment: Cubic): boolean {
	const leg = lineTo(from, segment.to);
	return (
		Math.hypot(leg.c1.x - segment.c1.x, leg.c1.y - segment.c1.y) < 1e-6 &&
		Math.hypot(leg.c2.x - segment.c2.x, leg.c2.y - segment.c2.y) < 1e-6
	);
}

/**
 * A point some way along one segment (de Casteljau).
 * @param from Where the segment starts.
 * @param segment The segment.
 * @param t How far along, from 0 to 1.
 * @returns The point.
 */
function pointOn(from: Point, segment: Cubic, t: number): Point {
	const a = mix(from, segment.c1, t);
	const b = mix(segment.c1, segment.c2, t);
	const c = mix(segment.c2, segment.to, t);
	return mix(mix(a, b, t), mix(b, c, t), t);
}

/**
 * The middle of a route counted by its segments, where the picture puts the
 * words of a line that only bends (the renderer's `pointAt` at one half).
 * @param outline The route.
 * @returns The point, or null for a route with no segments.
 */
function segmentMiddle(outline: Outline): Point | null {
	const { segments } = outline;
	const scaled = segments.length / 2;
	const index = Math.min(Math.floor(scaled), segments.length - 1);
	const segment = segments[index];
	return segment === undefined
		? null
		: pointOn(segments[index - 1]?.to ?? outline.start, segment, scaled - index);
}

/**
 * The middle of the longest straight run of a route, the first of the longest
 * when two are as long.
 * @param outline The route.
 * @returns The point, or null for a route that only bends.
 */
function longestRunMiddle(outline: Outline): Point | null {
	const runs = outline.segments
		.map((segment, index) => ({ from: outline.segments[index - 1]?.to ?? outline.start, segment }))
		.filter(({ from, segment }) => straight(from, segment))
		.map(({ from, segment }) => ({
			length: Math.hypot(segment.to.x - from.x, segment.to.y - from.y),
			middle: mix(from, segment.to, 0.5),
		}));
	// Longer wins and a tie keeps the first, as the picture's own search does.
	const longest = runs.reduce<(typeof runs)[number] | null>(
		(best, run) => (best === null || run.length > best.length ? run : best),
		null,
	);
	return longest?.middle ?? null;
}

/**
 * Where the picture puts the words of a line that has none, and so its badge
 * (the renderer's `labelAnchorOf`): the middle of the longest straight run of
 * its route, or the route's middle when it only bends.
 * @param d The route.
 * @returns The point, or null for a route it cannot read.
 */
function wordsAnchor(d: string): Point | null {
	const outline = parsePath(d);
	return outline === null ? null : (longestRunMiddle(outline) ?? segmentMiddle(outline));
}

/**
 * Turn the picture's markup for one mark into an element of the page.
 * @param markup The mark, as the renderer writes it.
 * @param owner The document the picture is in.
 * @returns The element.
 */
function markElement(markup: string, owner: Document): Element {
	const parsed = new DOMParser().parseFromString(
		`<svg xmlns="${SVG_NS}">${markup}</svg>`,
		"image/svg+xml",
	);
	const mark = owner.importNode(parsed.documentElement.firstElementChild!, true);
	mark.setAttribute(CODE_MARK_ATTRIBUTE, "");
	return mark;
}

/**
 * The groups that draw one subject, in the order the picture draws them.
 * @param root The picture.
 * @param id The subject.
 * @returns Its groups.
 */
function groupsOf(root: Element, id: string): Element[] {
	return [...root.querySelectorAll(`g[data-semantic-id="${CSS.escape(id)}"]`)].filter(
		(group) => !group.hasAttribute(CODE_MARK_ATTRIBUTE),
	);
}

/**
 * One of a subject's groups, by the part of it that the group draws.
 * @param groups The subject's groups.
 * @param part The part, or null for the group of the subject itself.
 * @returns The group, if the picture drew one.
 */
function groupFor(groups: readonly Element[], part: string | null): Element | undefined {
	return groups.find((group) => group.getAttribute(PART_ATTRIBUTE_NAME) === part);
}

/**
 * Mark a part: on its body's top-right corner, in a container's header when it
 * has one, as the picture's own badge is, so that the mark stands over what the
 * container holds; else in the group of its body, which a participant's card
 * slides down its lifeline with. A participant of several exchanges on one
 * page has a card in each, and the picture's badge stands on every one of
 * them, so this does too.
 * @param groups The part's groups.
 */
function markPart(groups: readonly Element[]): void {
	const header = groupFor(groups, "header");
	for (const body of groups.filter((group) => !group.hasAttribute(PART_ATTRIBUTE_NAME))) {
		const rect = bodyRect(body);
		const holder = header ?? body;
		if (rect === null) continue;
		const box = {
			x: numberOf(rect, "x"),
			y: numberOf(rect, "y"),
			width: numberOf(rect, "width"),
			height: numberOf(rect, "height"),
		};
		holder.append(markElement(cornerWarning(box), holder.ownerDocument));
	}
}

/** What a group made to hold a line's warning takes from the line's own group. */
const LINE_IDENTITY = [
	"data-semantic-kind",
	"data-semantic-id",
	"data-semantic-standing",
	"opacity",
	"class",
] as const;

/**
 * A group of a line's words, made to hold its warning: it says what the line's
 * own group says of the subject, so it is lit, veiled and ghosted with it.
 * @param line The line's own group.
 * @returns The group, not yet in the picture.
 */
function wordsFor(line: Element): Element {
	const holder = line.ownerDocument.createElementNS(SVG_NS, "g");
	for (const name of LINE_IDENTITY) {
		const value = line.getAttribute(name);
		if (value !== null) holder.setAttribute(name, value);
	}
	holder.setAttribute(PART_ATTRIBUTE_NAME, "label");
	holder.setAttribute(CODE_MARK_ATTRIBUTE, "");
	return holder;
}

/**
 * Mark a line that has no words where the picture would put them, in a group
 * of its words made for the mark, over the cards, as the picture's own badge
 * for such a line is. The route is the line's stroke: the last path the group
 * draws itself with, past its halos, its swipe and the head it defines.
 * @param line The line's own group.
 */
function markBareLine(line: Element): void {
	const stroke = [...line.querySelectorAll(":scope > path[d]:not(.ab-halo)")].at(-1);
	const at = wordsAnchor(stroke?.getAttribute("d") ?? "");
	if (at === null) return;
	const holder = wordsFor(line);
	holder.append(markElement(lineWarning(at), line.ownerDocument));
	line.parentElement?.append(holder);
}

/**
 * Mark a relationship or a message: on the leading edge of its words, or, for
 * a line with none, on the line.
 * @param groups The subject's groups.
 */
function markLine(groups: readonly Element[]): void {
	const words = groupFor(groups, "label");
	const plate = words === undefined ? null : bodyRect(words);
	if (words !== undefined && plate !== null) {
		const at = { x: numberOf(plate, "x"), y: numberOf(plate, "y") + numberOf(plate, "height") / 2 };
		words.append(markElement(lineWarning(at), words.ownerDocument));
		return;
	}
	const line = groupFor(groups, null);
	if (line !== undefined) markBareLine(line);
}

/** How each kind of subject the check names is marked. */
const MARKERS: Readonly<Record<string, (groups: readonly Element[]) => void>> = {
	node: markPart,
	region: markPart,
	edge: markLine,
	step: markLine,
};

/**
 * Draw the warning on every subject the code check warns about, and take away
 * every warning drawn for a subject it no longer warns about.
 * @param root The picture.
 * @param warned The subjects, by id.
 */
function markCodeWarnings(root: Element, warned: ReadonlySet<string>): void {
	for (const mark of root.querySelectorAll(`[${CODE_MARK_ATTRIBUTE}]`)) mark.remove();
	for (const id of warned) {
		const groups = groupsOf(root, id);
		MARKERS[groups[0]?.getAttribute("data-semantic-kind") ?? ""]?.(groups);
	}
}

export { markCodeWarnings };
