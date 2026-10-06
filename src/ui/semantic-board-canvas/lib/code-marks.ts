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

import { cornerWarning, lineWarning } from "@/transformers/semantic-renderer/index";

/** The attribute on a group that draws one part of a subject drawn in two (the renderer's). */
const PART_ATTRIBUTE_NAME = "data-semantic-part";

/** The attribute on every element the viewer added for a code warning. */
const CODE_MARK_ATTRIBUTE = "data-code-warning";

/** The SVG namespace, for the one group the viewer makes. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** A point in the units of the group that holds it. */
interface Point {
	readonly x: number;
	readonly y: number;
}

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

/** One command of a route: where it ends, and whether it runs straight there. */
interface RouteStep {
	readonly to: Point;
	readonly straight: boolean;
}

/** The commands that run a straight line. */
const STRAIGHT = new Set(["L", "H", "V"]);

/**
 * The middle of two points.
 * @param from One.
 * @param to The other.
 * @returns The point halfway.
 */
function middle(from: Point, to: Point): Point {
	return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/**
 * Where a command along one axis ends.
 * @param command `H` or `V`.
 * @param numbers Its numbers.
 * @param at Where the route stood before it.
 * @returns The end.
 */
function axisEnd(command: string, numbers: readonly number[], at: Point): Point {
	const value = numbers.at(-1) ?? 0;
	return command === "H" ? { x: value, y: at.y } : { x: at.x, y: value };
}

/**
 * Where one command of a route ends.
 * @param command The command letter.
 * @param numbers Its numbers.
 * @param at Where the route stood before it, or null at its start.
 * @returns The end, or null for a command that does not move (`Z`) or says too little.
 */
function endOf(command: string, numbers: readonly number[], at: Point | null): Point | null {
	if (at !== null && (command === "H" || command === "V")) return axisEnd(command, numbers, at);
	return numbers.length < 2 ? null : { x: numbers.at(-2)!, y: numbers.at(-1)! };
}

/**
 * The commands of a route, as the picture spells one: absolute commands only.
 * @param d The route.
 * @returns Each command's letter and numbers, in order.
 */
function commandsOf(d: string): { command: string; numbers: number[] }[] {
	return [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map((match) => ({
		command: match[1] ?? "",
		numbers: (match[2]?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number),
	}));
}

/**
 * Where each command of a route ends.
 * @param d The route.
 * @returns The ends, in order.
 */
function stepsOf(d: string): RouteStep[] {
	const steps: RouteStep[] = [];
	for (const { command, numbers } of commandsOf(d)) {
		const to = endOf(command, numbers, steps.at(-1)?.to ?? null);
		if (to !== null) steps.push({ to, straight: STRAIGHT.has(command) });
	}
	return steps;
}

/**
 * The middle of the longest straight run of a route, the first of the longest
 * when two are as long, as the picture finds the place for the words of a line
 * that has none (`labelAnchorOf`); the middle of its two ends when it runs no
 * straight stretch at all.
 * @param d The route.
 * @returns The point, or null for a route with no points.
 */
function longestRunMiddle(d: string): Point | null {
	const steps = stepsOf(d);
	const runs = steps
		.slice(1)
		.map((step, index) => ({ from: steps[index]!.to, step }))
		.filter(({ step }) => step.straight)
		.map(({ from, step }) => ({
			length: Math.hypot(step.to.x - from.x, step.to.y - from.y),
			from,
			to: step.to,
		}));
	const longest = runs.toSorted((a, b) => b.length - a.length)[0];
	if (longest !== undefined) return middle(longest.from, longest.to);
	const [first] = steps;
	const last = steps.at(-1);
	return first === undefined || last === undefined ? null : middle(first.to, last.to);
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
 * slides down its lifeline with.
 * @param groups The part's groups.
 */
function markPart(groups: readonly Element[]): void {
	const body = groupFor(groups, null);
	const rect = body === undefined ? null : bodyRect(body);
	const holder = groupFor(groups, "header") ?? body;
	if (rect === null || holder === undefined) return;
	const box = {
		x: numberOf(rect, "x"),
		y: numberOf(rect, "y"),
		width: numberOf(rect, "width"),
		height: numberOf(rect, "height"),
	};
	holder.append(markElement(cornerWarning(box), holder.ownerDocument));
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
 * Mark a line that has no words, at the middle of its longest straight run, in
 * a group of its words made for the mark, over the cards, as the picture's own
 * badge for such a line is.
 * @param line The line's own group.
 */
function markBareLine(line: Element): void {
	const at = longestRunMiddle(line.querySelector("path:not(.ab-halo)")?.getAttribute("d") ?? "");
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

export { CODE_MARK_ATTRIBUTE, markCodeWarnings };
