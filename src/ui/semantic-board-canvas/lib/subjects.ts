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

/**
 * The attribute a mark lists its members in, space-separated: a group's region
 * lists its cards, and a junction mark the relationships that meet at it.
 * Neither is a subject of its own: the veil lights each with its members.
 */
const MEMBERS_ATTRIBUTE = "data-members";

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

/** The class the surface carries while a presented step veils what it is not about. */
const VEILED_CLASS = "is-veiled";

/** The class a subject the veil leaves standing carries. */
const LIT_CLASS = "is-lit";

/**
 * Draw a presented step's veil on the picture, or take it off.
 *
 * Its own class rather than the attention ring: which subjects a step is about
 * is what the veil leaves standing, and the ring is drawn from attention alone.
 * The surface carries the class that lets everything else recede
 * ({@link surfaceMarks}), so a picture with no step presented is drawn exactly
 * as it was: the veil's rules all hang under it.
 * A group's region and a junction mark stand with their members: lit while
 * one of them is, and receding with everything else while none is.
 * @param surface The element the picture was put into.
 * @param lit The subjects the step is about; null for no veil.
 */
function markVeil(surface: Element, lit: ReadonlySet<string> | null): void {
	const standing = lit ?? new Set<string>();
	for (const group of surface.querySelectorAll(MARKED)) {
		group.classList.toggle(LIT_CLASS, standing.has(markedId(group) ?? ""));
	}
	lightByMembers(surface, standing);
}

/**
 * Light each mark that lists a subject the veil leaves standing.
 * @param surface The element the picture was put into.
 * @param standing The subjects the veil leaves standing.
 */
function lightByMembers(surface: Element, standing: ReadonlySet<string>): void {
	for (const mark of surface.querySelectorAll(`[${MEMBERS_ATTRIBUTE}]`)) {
		const members = mark.getAttribute(MEMBERS_ATTRIBUTE)?.split(" ") ?? [];
		mark.classList.toggle(
			LIT_CLASS,
			members.some((id) => standing.has(id)),
		);
	}
}

/** The class the surface carries while the picture is seen from far away. */
const FAR_VIEW_CLASS = "is-far";

/**
 * The classes the surface itself carries for the picture's stylesheet: that a
 * presented step veils the picture, and that it is seen from far away,
 * where each card draws its name larger in place of its responsibility. They
 * are part of the surface's rendered class, never toggled on it afterwards: a
 * render that writes the surface's class (a pan starting, say) would wipe a
 * class put there by hand.
 * @param state What the surface says.
 * @param state.veiled Whether a presented step veils the picture.
 * @param state.far Whether the picture is seen from far away.
 * @returns The classes, each with a leading space, or nothing.
 */
function surfaceMarks({ veiled, far }: { veiled: boolean; far: boolean }): string {
	return `${veiled ? ` ${VEILED_CLASS}` : ""}${far ? ` ${FAR_VIEW_CLASS}` : ""}`;
}

/** Every class the viewer puts on a subject's group; none of them is the renderer's. */
const VIEWER_MARKS: readonly string[] = [SELECTED_CLASS, LIT_CLASS];

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
 * The marks the viewer draws — attention and a presented step's veil —
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
	SELECTED_CLASS,
	SUBJECT_ATTRIBUTE,
	TRAFFIC_ATTRIBUTE,
	isSubject,
	keepingMarks,
	markSubjects,
	markVeil,
	subjectAt,
	subjectBox,
	surfaceMarks,
};
