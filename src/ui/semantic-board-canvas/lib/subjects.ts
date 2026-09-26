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

/**
 * The attribute a relationship's traffic layer carries: the id of the line it
 * rides. The picture draws a line's traffic apart from it, over every line,
 * and the viewer marks the layer as it marks its line, so traffic lights,
 * recedes and rises with the line it rides.
 */
const TRAFFIC_ATTRIBUTE = "data-traffic";

/** Every group the viewer marks: each subject's, and each line's traffic. */
const MARKED = `[${SUBJECT_ATTRIBUTE}],[${TRAFFIC_ATTRIBUTE}]`;

/**
 * The subject a marked group draws: its own id, or the line its traffic rides.
 * @param group The group.
 * @returns The subject's id, or null for scenery.
 */
function markedId(group: Element): string | null {
	return group.getAttribute(SUBJECT_ATTRIBUTE) ?? group.getAttribute(TRAFFIC_ATTRIBUTE);
}

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
	for (const group of surface.querySelectorAll(MARKED)) {
		const id = markedId(group);
		group.classList.toggle(SELECTED_CLASS, id !== null && attended.has(id));
	}
	raiseSelected(surface);
}

/**
 * The groups a selection draws over everything else: a card, a line, a step.
 * Never a container, a group's region, a flow or a participant's lifeline,
 * each of which runs under what it holds or crosses.
 */
const RAISED = `[data-semantic-kind='edge'],[data-semantic-kind='step'],[data-depiction='card'],[${TRAFFIC_ATTRIBUTE}]`;

/** Where each raised group stood before it was raised, to go back to when it is let go. */
const raisedFrom = new WeakMap<Element, Comment>();

/**
 * Draw every selected card, line and step over the rest of the picture, and
 * put each one no longer selected back where the picture drew it. A picture
 * draws its parts in layers, so a selected line ran under the lines and
 * labels drawn after it; raised, it is drawn last among its siblings, in
 * the order the picture drew the selected ones.
 * @param surface The element the picture was put into.
 */
function raiseSelected(surface: Element): void {
	for (const group of surface.querySelectorAll(MARKED)) {
		raise(group, group.classList.contains(SELECTED_CLASS) && group.matches(RAISED));
	}
}

/**
 * Draw one group last among its siblings, leaving a mark where it stood, or
 * put it back on its mark.
 * @param group The group.
 * @param raised Whether it is drawn last.
 */
function raise(group: Element, raised: boolean): void {
	const slot = raisedFrom.get(group);
	if (raised === (slot !== undefined)) return;
	if (slot === undefined) {
		const mark = group.ownerDocument.createComment("");
		group.before(mark);
		raisedFrom.set(group, mark);
		group.parentNode?.append(group);
	} else {
		slot.replaceWith(group);
		raisedFrom.delete(group);
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
 * everything else recede ({@link surfaceMarks}), so a picture with no group
 * under inspection is drawn exactly as it was: the stylesheet's group rules
 * all hang under it.
 * @param surface The element the picture was put into.
 * @param marks What to light, keep readable, and treat as context; null for none.
 */
function markGroupFocus(surface: Element, marks: GroupMarks | null): void {
	for (const group of surface.querySelectorAll(MARKED)) {
		const id = markedId(group) ?? "";
		for (const role of ["members", "boundary", "context"] as const) {
			group.classList.toggle(GROUP_CLASSES[role], marks?.[role].has(id) ?? false);
		}
	}
}

/** The class the surface carries while the picture is seen from far away. */
const FAR_VIEW_CLASS = "is-far";

/**
 * The classes the surface itself carries for the picture's stylesheet: that a
 * group is under inspection, and that the picture is seen from far away,
 * where each card draws its name larger in place of its responsibility. They
 * are part of the surface's rendered class, never toggled on it afterwards: a
 * render that writes the surface's class (a pan starting, say) would wipe a
 * class put there by hand.
 * @param state What the surface says.
 * @param state.focused Whether a group is under inspection.
 * @param state.far Whether the picture is seen from far away.
 * @returns The classes, each with a leading space, or nothing.
 */
function surfaceMarks({ focused, far }: { focused: boolean; far: boolean }): string {
	return `${focused ? ` ${GROUP_FOCUS_CLASS}` : ""}${far ? ` ${FAR_VIEW_CLASS}` : ""}`;
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
	for (const group of surface.querySelectorAll(MARKED)) {
		const marks = VIEWER_MARKS.filter((mark) => group.classList.contains(mark));
		const id = markedId(group);
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
	for (const group of surface.querySelectorAll(MARKED)) {
		const marks = marked.get(markedId(group) ?? "");
		if (marks !== undefined) {
			group.classList.add(...marks);
		}
	}
	raiseSelected(surface);
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
	surfaceMarks,
	type GroupMarks,
};
