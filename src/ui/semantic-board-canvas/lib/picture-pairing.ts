// Which parts of two pictures of one board are the same subject.
//
// The renderer writes `data-semantic-id` on every group it draws for a subject,
// and a subject's id is minted once and never rewritten, so the id is what says
// that a card in one picture and a card in the next are one node. One subject
// may be drawn as more than one group — a container is its frame and, above the
// connections, its header; a connection is its line and, when it has one, its
// label — always in the same order, so the second group of an id in one picture
// is the second group of that id in the other.
//
// Everything here reads; nothing here moves. Which groups pair, what box each
// sits in and whether its content changed are facts the transition acts on.

import type { SemanticAtlas, SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { subjectBox, SUBJECT_ATTRIBUTE } from "@/ui/semantic-board-canvas/lib/subjects";

/** What sort of thing a subject's group draws, as far as motion is concerned. */
type GroupShape =
	/** A frame with content in it: a card, a container's frame or header, a label pill. */
	| "card"
	/** A drawn line: a connection's route. */
	| "line";

/** One group of one subject, in one picture. */
interface SubjectGroup {
	readonly id: string;
	/** Which of the subject's groups this is, in drawing order. */
	readonly ordinal: number;
	readonly element: SVGGElement;
	readonly shape: GroupShape;
	/** The box the group is drawn in, or null when the picture does not say. */
	readonly box: SemanticBox | null;
}

/** A group in both pictures, an old one with no new, or a new one with no old. */
interface GroupPairing {
	readonly shared: readonly { readonly before: SubjectGroup; readonly after: SubjectGroup }[];
	readonly removed: readonly SubjectGroup[];
	readonly added: readonly SubjectGroup[];
}

/**
 * A copy of an element, deep.
 * @param element The element.
 * @returns Its copy.
 */
function cloneElement(element: Element): Element {
	const copy = element.cloneNode(true);
	if (!(copy instanceof Element)) {
		throw new TypeError("an element's clone is an element");
	}
	return copy;
}

/**
 * A copy of a group, deep.
 * @param group The group.
 * @returns Its copy.
 */
function cloneGroup(group: SVGGElement): SVGGElement {
	const copy = group.cloneNode(true);
	if (!(copy instanceof SVGGElement)) {
		throw new TypeError("a group's clone is a group");
	}
	return copy;
}

/**
 * The box a `<rect>` says it occupies.
 * @param rect The rect.
 * @returns Its box, or null when a side is not a number.
 */
function rectBox(rect: Element): SemanticBox | null {
	/**
	 * One side of the rect, as a number.
	 * @param name The attribute.
	 * @returns Its value, or NaN when it is not there.
	 */
	function read(name: string): number {
		return Number.parseFloat(rect.getAttribute(name) ?? "");
	}
	const box = { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
	return Number.isFinite(box.x + box.y + box.width + box.height) ? box : null;
}

/**
 * The largest rect a group draws directly, which for a card is its body and
 * for a label is its pill.
 * @param group The group.
 * @returns That rect's box, or null when the group draws no rect.
 */
function largestRectBox(group: Element): SemanticBox | null {
	let largest: SemanticBox | null = null;
	for (const child of group.children) {
		const box = child.tagName === "rect" ? rectBox(child) : null;
		if (
			box !== null &&
			(largest === null || box.width * box.height > largest.width * largest.height)
		) {
			largest = box;
		}
	}
	return largest;
}

/**
 * Whether a group is a drawn line rather than a frame with content in it.
 *
 * A route is paths and nothing else that is not a definition or a pulse; a
 * label has a pill and a card has a body, and both are rects.
 * @param group The group.
 * @returns True for a line.
 */
function drawsLine(group: Element): boolean {
	const children = [...group.children];
	return (
		children.some((child) => child.tagName === "path" && child.hasAttribute("d")) &&
		!children.some((child) => child.tagName === "rect")
	);
}

/**
 * Where one group is drawn.
 *
 * The group's own largest rect, when it draws one: a card's halo, a
 * container's band, a label's pill, a lifeline's halo. The atlas box is the
 * union of everything drawn for the subject, and a subject drawn as two groups
 * — a lifeline and its participant card, a container and its header — needs
 * each group placed by its own frame. A group that draws no rect, a container's
 * header, is placed by the atlas: it rides with its subject's box.
 * @param element The group.
 * @param id The subject's id.
 * @param atlas Where every subject of this picture ended up.
 * @returns The box, or null when nothing says.
 */
function boxOf(element: Element, id: string, atlas: SemanticAtlas): SemanticBox | null {
	return largestRectBox(element) ?? subjectBox(atlas, id);
}

/**
 * One group, described.
 * @param element The group.
 * @param id The subject's id.
 * @param ordinal Which of the subject's groups it is.
 * @param atlas Where every subject of this picture ended up.
 * @returns The group.
 */
function describe(
	element: SVGGElement,
	id: string,
	ordinal: number,
	atlas: SemanticAtlas,
): SubjectGroup {
	const line = drawsLine(element);
	return {
		id,
		ordinal,
		element,
		shape: line ? "line" : "card",
		box: line ? null : boxOf(element, id, atlas),
	};
}

/**
 * Whether a group is drawn inside another subject's group, and so moves with it.
 * @param element The group.
 * @returns True when nested.
 */
function nested(element: Element): boolean {
	return element.parentElement?.closest(`[${SUBJECT_ATTRIBUTE}]`) !== null;
}

/**
 * Every subject group a picture draws, outermost only, in drawing order.
 *
 * Outermost, because a group nested in a subject's group is part of how that
 * subject is drawn and moves with it.
 * @param root The picture's root.
 * @param atlas Where every subject of it ended up.
 * @returns The groups, each knowing which of its subject's groups it is.
 */
function subjectGroups(root: Element, atlas: SemanticAtlas): SubjectGroup[] {
	const seen = new Map<string, number>();
	const groups: SubjectGroup[] = [];
	for (const element of root.querySelectorAll<SVGGElement>(`g[${SUBJECT_ATTRIBUTE}]`)) {
		const id = element.getAttribute(SUBJECT_ATTRIBUTE);
		if (id === null || nested(element)) {
			continue;
		}
		const ordinal = seen.get(id) ?? 0;
		seen.set(id, ordinal + 1);
		groups.push(describe(element, id, ordinal, atlas));
	}
	return groups;
}

/**
 * What one group is matched by: its subject, and which of that subject's
 * groups it is.
 * @param group The group.
 * @returns The key.
 */
function pairingKey(group: SubjectGroup): string {
	return `${group.id}#${group.ordinal}`;
}

/**
 * Match the groups of one picture to the groups of the next.
 * @param before The groups of the picture being left.
 * @param after The groups of the picture being arrived at.
 * @returns Which pair, which only the old picture had, and which only the new has.
 */
function pairGroups(before: readonly SubjectGroup[], after: readonly SubjectGroup[]): GroupPairing {
	const old = new Map(before.map((group) => [pairingKey(group), group]));
	const shared: { before: SubjectGroup; after: SubjectGroup }[] = [];
	const added: SubjectGroup[] = [];
	for (const group of after) {
		const previous = old.get(pairingKey(group));
		if (previous === undefined) {
			added.push(group);
		} else {
			old.delete(pairingKey(group));
			shared.push({ before: previous, after: group });
		}
	}
	return { shared, added, removed: [...old.values()] };
}

/**
 * Whether a rect is the frame of its group rather than something drawn inside
 * it: as wide and as tall as most of the box the group sits in. A card's body
 * and the halo around it both are; an icon's chip is not.
 * @param element The rect.
 * @param box The group's box.
 * @returns True for a frame.
 */
function isFrameRect(element: Element, box: SemanticBox): boolean {
	const rect = element.tagName === "rect" ? rectBox(element) : null;
	return rect !== null && rect.width >= box.width / 2 && rect.height >= box.height / 2;
}

/** Where a `<line>` runs, as the attributes spell it. */
interface LineEnds {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
}

/**
 * Where a `<line>` runs.
 * @param line The line.
 * @returns Its ends, or null when an end is not a number.
 */
function lineEnds(line: Element): LineEnds | null {
	/**
	 * One coordinate of the line, as a number.
	 * @param name The attribute.
	 * @returns Its value, or NaN when it is not there.
	 */
	function read(name: string): number {
		return Number.parseFloat(line.getAttribute(name) ?? "");
	}
	const ends = { x1: read("x1"), y1: read("y1"), x2: read("x2"), y2: read("y2") };
	return Number.isFinite(ends.x1 + ends.y1 + ends.x2 + ends.y2) ? ends : null;
}

/**
 * Whether a line runs the length of its group's box, and so is part of its
 * frame: a participant's lifeline, a frame's rule under its heading.
 * @param element The line.
 * @param box The group's box.
 * @returns True for a frame line.
 */
function isFrameLine(element: Element, box: SemanticBox): boolean {
	const ends = element.tagName === "line" ? lineEnds(element) : null;
	return (
		ends !== null &&
		(Math.abs(ends.x2 - ends.x1) >= box.width / 2 || Math.abs(ends.y2 - ends.y1) >= box.height / 2)
	);
}

/**
 * A card's direct children, sorted into the rects that are its frame and
 * everything drawn inside it.
 * @param group The group.
 * @param box The group's box.
 * @returns The frame rects and the content, each in drawing order.
 */
function splitCard(group: Element, box: SemanticBox): { frame: Element[]; content: Element[] } {
	const frame: Element[] = [];
	const content: Element[] = [];
	for (const child of group.children) {
		(isFrameRect(child, box) || isFrameLine(child, box) ? frame : content).push(child);
	}
	return { frame, content };
}

/** The attributes that say where something is drawn rather than what it is. */
const PLACEMENT = ["x", "y", "cx", "cy", "transform", "id"];

/**
 * A copy of an element with where it is drawn taken out.
 * @param element The element.
 * @returns Its copy, unplaced.
 */
function unplaced(element: Element): Element {
	const copy = cloneElement(element);
	for (const positioned of [copy, ...copy.querySelectorAll("*")]) {
		for (const name of PLACEMENT) {
			positioned.removeAttribute(name);
		}
	}
	if (copy.tagName === "path" || copy.tagName === "polygon") {
		copy.removeAttribute("d");
		copy.removeAttribute("points");
	}
	return copy;
}

/** A card's content, sorted by what the two pictures make of each element. */
interface ContentPairing {
	/** Elements of the new content the old content also drew, in the new order. */
	readonly kept: Element[];
	/** Elements only the new content draws. */
	readonly arriving: Element[];
	/** Elements only the old content drew. */
	readonly leaving: Element[];
}

/**
 * Pair a card's content element by element between two pictures.
 *
 * An element is the same element when its markup is the same apart from where
 * it is drawn — the `x` and `y` of a text or a chip, the translate that places
 * an icon, the outline of a pin or a badge drawn straight into the card's
 * coordinates. A title that did not change is kept and glides with the card;
 * a description that did is one element leaving and one arriving, and the
 * title beside it is not disturbed. An icon's own drawing is nested inside its
 * translate and keeps its `d`, so a chip whose kind changed is a changed chip.
 * @param old The content of the card in the last picture.
 * @param next The content of the card in the next.
 * @returns What is kept, what arrives and what leaves.
 */
function pairContent(old: readonly Element[], next: readonly Element[]): ContentPairing {
	const unmatched = new Map(old.map((element) => [element, unplaced(element).outerHTML]));
	const kept: Element[] = [];
	const arriving: Element[] = [];
	for (const element of next) {
		const signature = unplaced(element).outerHTML;
		const match = [...unmatched].find(([, own]) => own === signature)?.[0];
		if (match === undefined) {
			arriving.push(element);
		} else {
			unmatched.delete(match);
			kept.push(element);
		}
	}
	return { kept, arriving, leaving: [...unmatched.keys()] };
}

export {
	cloneElement,
	cloneGroup,
	lineEnds,
	pairContent,
	type ContentPairing,
	pairGroups,
	rectBox,
	splitCard,
	subjectGroups,
	type GroupPairing,
	type GroupShape,
	type SubjectGroup,
};
