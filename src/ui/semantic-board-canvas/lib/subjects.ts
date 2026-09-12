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

/** The ring the renderer draws outside every subject for a viewer to light. */
const HALO_SELECTOR = ".ab-halo";

/**
 * How a subject is marked, when it is.
 *
 * Three things can be true of a subject on screen and a reader has to be able
 * to tell them apart:
 *
 *   selected     the person picked this out, and the panel is about it;
 *   attended     the beat they are reading is about this;
 *   disputed     the board says this subject is waiting on a disagreement.
 *
 * The first two share a mark on purpose. Both mean "this is the part under
 * discussion" — one because the reader said so and one because the narrative
 * did — and the renderer draws that one way, as a ring outside the subject.
 * Splitting them would ask a reader to learn a difference that does not change
 * what they should do.
 *
 * The third cannot share it. A dispute is not something the reader is doing:
 * it is a fact about the board that is true whether or not anybody is looking,
 * and it must be legible on a pane with no selection and no walkthrough open.
 * So it lights the same ring dashed rather than solid — dashes being what this
 * renderer already uses to say that the board has something to say about a
 * subject, in the outlines it draws for added, removed and changed — and a
 * subject that is both keeps the solid ring, because the reader's own
 * attention is the more immediate of the two and the standing beside the
 * picture still lists the dispute.
 */
type SubjectMark = "attended" | "disputed";

/**
 * The dashes that tell an unsettled subject from one under discussion. In the
 * drawn document's own units, so it scales with the picture as the ring does.
 */
const DISPUTED_DASH = "6 4";

/** What the viewer writes on a halo to light it dashed, and nothing else. */
const DISPUTED_STYLE = `opacity:1;stroke-dasharray:${DISPUTED_DASH}`;

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
 * Light one subject's ring dashed, or put it out.
 *
 * Written as the halo's own `style` attribute, which is the one attribute the
 * viewer ever writes on the picture. It has to be inline: the document's
 * stylesheet puts every halo out with `.ab-halo{opacity:0}`, and a presentation
 * attribute loses to a stylesheet while an inline style beats one. Only the
 * group's own ring is taken, never a contained subject's, so lighting a
 * container does not light everything inside it.
 * @param group The subject's group.
 * @param disputed Whether the board says this subject is unsettled.
 */
function markDispute(group: Element, disputed: boolean): void {
	const halo = group.querySelector(HALO_SELECTOR);
	if (halo === null) {
		return;
	}
	if (disputed) {
		halo.setAttribute("style", DISPUTED_STYLE);
	} else {
		halo.removeAttribute("style");
	}
}

/**
 * Draw the marks on the picture.
 *
 * The class is toggled on the group rather than re-rendered into the markup:
 * the picture is one string from the server and re-templating it to move a
 * highlight would throw away the browser's parse of it on every click.
 * @param surface The element the picture was put into.
 * @param marks How each marked subject is marked; empty for none.
 */
function markSubjects(surface: Element, marks: ReadonlyMap<string, SubjectMark>): void {
	for (const group of surface.querySelectorAll(`[${SUBJECT_ATTRIBUTE}]`)) {
		const id = group.getAttribute(SUBJECT_ATTRIBUTE);
		const mark = id === null ? undefined : marks.get(id);
		group.classList.toggle(SELECTED_CLASS, mark === "attended");
		markDispute(group, mark === "disputed");
	}
}

export {
	DISPUTED_STYLE,
	SELECTED_CLASS,
	SUBJECT_ATTRIBUTE,
	isSubject,
	markSubjects,
	subjectAt,
	subjectBox,
	type SubjectMark,
};
