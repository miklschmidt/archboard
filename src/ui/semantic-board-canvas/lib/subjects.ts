// What can be selected on a drawn board, and how a click finds it.
//
// The atlas decides, not the SVG. The picture carries `data-semantic-id` on
// every group the renderer drew, but the atlas is what the server says the
// subjects of this drawing are; anything in the markup the atlas does not know
// is scenery. Going through the atlas also means the browser never has to
// parse the picture to know what is on it.

import type { SemanticAtlas, SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** The attribute every selectable group in the picture carries. */
const SUBJECT_ATTRIBUTE = "data-semantic-id";

/** The class the embedded stylesheet draws a selected subject with. */
const SELECTED_CLASS = "is-selected";

// What the viewer marks is attention, and nothing else. Two things can be true
// of a subject on screen and they share one mark on purpose: the person picked
// it out, or the beat they are reading is about it. Both mean "this is the part
// under discussion" — one because the reader said so, one because the narrative
// did — and splitting them would ask a reader to learn a difference that does
// not change what they should do.
//
// A dispute used to be a second mark here, drawn by lighting the same ring
// dashed. It is not any more, for two reasons. A page could then carry a solid
// ring, a dashed ring and a dashed outline at once with nothing to say which of
// the three a reader was looking at. And one map holding one mark per subject
// meant a subject that was both attended and unsettled lost the dispute
// entirely — the louder mark simply overwrote it. What the board has not decided
// is drawn by the thing that draws the picture now, as a badge in the subject's
// own corner, so the two are independent by construction and neither can hide
// the other.

/**
 * The box one subject occupies, wherever in the atlas it is.
 * @param atlas Where every subject ended up.
 * @param id The semantic id.
 * @returns Its box, or null when the atlas does not know that id.
 */
function subjectBox(atlas: SemanticAtlas, id: string): SemanticBox | null {
	return atlas.nodes[id] ?? atlas.edges[id] ?? atlas.regions[id] ?? null;
}

/**
 * Whether the atlas knows this id as a subject of the drawing.
 * @param atlas Where every subject ended up.
 * @param id The semantic id a click produced.
 * @returns True when it is something a person can select.
 */
function isSubject(atlas: SemanticAtlas, id: string): boolean {
	return subjectBox(atlas, id) !== null;
}

/**
 * The subject a click landed on.
 * @param target Where the pointer went down, as the event reported it.
 * @param atlas Where every subject ended up.
 * @returns The semantic id, or null when the click was on the background.
 */
function subjectAt(target: EventTarget | null, atlas: SemanticAtlas): string | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const group = target.closest(`[${SUBJECT_ATTRIBUTE}]`);
	const id = group?.getAttribute(SUBJECT_ATTRIBUTE) ?? null;
	return id !== null && isSubject(atlas, id) ? id : null;
}

/**
 * Draw the marks on the picture.
 *
 * One class, toggled on the group rather than re-rendered into the markup: the
 * picture is one string from the server, and re-templating it to move a
 * highlight would throw away the browser's parse of it on every click. The
 * viewer writes nothing else on the picture — no attribute, no inline style —
 * which is what keeps the drawing the server's and the highlight the pane's.
 * @param surface The element the picture was put into.
 * @param attended Which subjects are being attended to; empty for none.
 */
function markSubjects(surface: Element, attended: ReadonlySet<string>): void {
	for (const group of surface.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)) {
		const id = group.getAttribute(SUBJECT_ATTRIBUTE);
		group.classList.toggle(SELECTED_CLASS, id !== null && attended.has(id));
	}
}

/** The class the surface carries while one group is under inspection. */
const GROUP_FOCUS_CLASS = "is-group-focus";

/** The classes the embedded stylesheet reads a group inspection through. */
const GROUP_CLASSES = {
	members: "is-group-member",
	boundary: "is-group-boundary",
	context: "is-group-context",
} as const;

/** Which subjects a group inspection lights, keeps readable, or treats as context. */
interface GroupMarks {
	readonly members: ReadonlySet<string>;
	readonly boundary: ReadonlySet<string>;
	readonly context: ReadonlySet<string>;
}

/**
 * Draw one group's inspection on the picture, or take it off.
 *
 * Its own classes rather than the attention ring, so a subject can be attended
 * and a member at once and say both. The surface carries the class that lets
 * everything else recede, so a picture with no group under inspection is drawn
 * exactly as it was: the stylesheet's group rules all hang under it.
 * @param surface The element the picture was put into.
 * @param marks What to light, keep readable, and treat as context; null for none.
 */
function markGroupFocus(surface: Element, marks: GroupMarks | null): void {
	surface.classList.toggle(GROUP_FOCUS_CLASS, marks !== null);
	for (const group of surface.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)) {
		const id = group.getAttribute(SUBJECT_ATTRIBUTE) ?? "";
		for (const role of ["members", "boundary", "context"] as const) {
			group.classList.toggle(GROUP_CLASSES[role], marks?.[role].has(id) ?? false);
		}
	}
}

/** Every class the viewer puts on a subject's group; none of them is the renderer's. */
const VIEWER_MARKS: readonly string[] = [SELECTED_CLASS, ...Object.values(GROUP_CLASSES)];

/**
 * The viewer's marks on a surface, by subject.
 * @param surface The surface.
 * @returns Each marked subject's marks.
 */
function marksOn(surface: Element): Map<string, string[]> {
	const marked = new Map<string, string[]>();
	for (const group of surface.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)) {
		const marks = VIEWER_MARKS.filter((mark) => group.classList.contains(mark));
		const id = group.getAttribute(SUBJECT_ATTRIBUTE);
		if (id !== null && marks.length > 0) {
			marked.set(id, marks);
		}
	}
	return marked;
}

/**
 * Put a picture back on a surface without it ever being seen unmarked.
 *
 * The marks the viewer draws — attention, a group, a presented step's veil —
 * are put on the markup after it is staged, and a flight that lands stages the
 * picture again from its string. Between the two a frame could be painted with
 * none of them, and whatever they light or veil would be seen to switch off and
 * fade back. So the marks the surface carries now are copied onto the fresh
 * markup, subject by subject, as it goes up; the marks' own effects bring them
 * up to date afterwards as they always do.
 * @param surface The surface.
 * @param stage Put the picture up.
 */
function keepingMarks(surface: Element, stage: () => void): void {
	const marked = marksOn(surface);
	stage();
	for (const group of surface.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)) {
		const marks = marked.get(group.getAttribute(SUBJECT_ATTRIBUTE) ?? "");
		if (marks !== undefined) {
			group.classList.add(...marks);
		}
	}
}

export {
	GROUP_CLASSES,
	GROUP_FOCUS_CLASS,
	SELECTED_CLASS,
	SUBJECT_ATTRIBUTE,
	isSubject,
	keepingMarks,
	markGroupFocus,
	markSubjects,
	subjectAt,
	subjectBox,
	type GroupMarks,
};
