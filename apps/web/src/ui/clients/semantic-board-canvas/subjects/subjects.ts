// What can be selected on a drawn board, and how a click finds it.
//
// The atlas decides, not the SVG. The picture carries `data-semantic-id` on
// every group the renderer drew, but the atlas is what the server says the
// subjects of this drawing are; anything in the markup the atlas does not know
// is scenery. Going through the atlas also means the browser never has to
// parse the picture to know what is on it.

import type { ProbeMode } from "#ui/rules/semantic-board-canvas/picture/picture-light.ts";
import type {
	SemanticAtlas,
	SemanticBox,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";

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
 * The class every moving mark of traffic carries (the renderer's `PULSE_CLASS`).
 * A pulse slides in a bar much longer than the part it runs along, so it is
 * never part of what a box around a subject is measured from.
 */
const PULSE_CLASS = "ab-pulse";

/**
 * The attribute a mark lists its members in, space-separated: a junction mark
 * lists the relationships that meet at it, and a row mark its step.
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
 * Whether a press landed on the control that a door or a frame's tab wears.
 * @param target Where the pointer went down, as the event reported it.
 * @returns True on the control.
 */
function controlAt(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest("[data-toggle]") !== null;
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
 * @param quiet Whether a relationship's line goes without the ring.
 */
function markSubjects(surface: Element, attended: ReadonlySet<string>, quiet: boolean): void {
	for (const group of surface.querySelectorAll(MARKED)) {
		const id = markedId(group);
		const ringless = quiet && group.getAttribute("data-semantic-kind") === "edge";
		group.classList.toggle(SELECTED_CLASS, id !== null && attended.has(id) && !ringless);
	}
}

/**
 * Whether selected lines go without the ring. A line wears it alone: among
 * several, the light says which stand, and a ring round each would turn the
 * picture gold.
 * @param attended Which subjects are being attended to.
 * @param veil What the light leaves standing, or null for no light.
 * @param atlas Where every subject ended up, which says which are lines.
 * @returns True when they do.
 */
function quietLines(
	attended: ReadonlySet<string>,
	veil: ReadonlySet<string> | null,
	atlas: Pick<SemanticAtlas, "edges">,
): boolean {
	return veil !== null && [...attended].filter((id) => atlas.edges[id] !== undefined).length > 1;
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
 * A junction mark stands with its members: lit while one of them is, and
 * receding with everything else while none is.
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

/**
 * The classes a subject a trace reached carries, by how many hops beyond the
 * first it is: the faintest class is shared by every hop from the last on.
 */
const REACH_CLASSES: readonly string[] = ["is-reach-2", "is-reach-3", "is-reach-4"];

/**
 * Grade the subjects a trace reached, or take the grading off.
 *
 * Each carries the class for how far it is, so the stylesheet can light the
 * nearest strongest and let the wave spread by hop. The marks that say what is
 * lit at all are {@link markVeil}'s.
 * @param surface The element the picture was put into.
 * @param reach How many hops beyond the first each subject is; null for no trace.
 */
function markReach(surface: Element, reach: ReadonlyMap<string, number> | null): void {
	for (const group of surface.querySelectorAll(MARKED)) {
		gradeReach(group, reach?.get(markedId(group) ?? "") ?? 0);
	}
	// A card's shadow is graded with its card, so it fades as far as the card does.
	for (const shadow of surface.querySelectorAll(SHADOWS)) {
		gradeReach(shadow, membersReach(shadow, reach));
	}
}

/**
 * How far a trace reached what a mark lists: its farthest member's hops.
 * @param mark The mark.
 * @param reach How many hops beyond the first each subject is; null for no trace.
 * @returns The hops; 0 for none.
 */
function membersReach(mark: Element, reach: ReadonlyMap<string, number> | null): number {
	const members = mark.getAttribute(MEMBERS_ATTRIBUTE)?.split(" ") ?? [];
	return Math.max(0, ...members.map((id) => reach?.get(id) ?? 0));
}

/**
 * Put on a group the class for how far a trace reached it, and take the others off.
 * @param group The group.
 * @param hops How many hops beyond the first it is; 0 for none.
 */
function gradeReach(group: Element, hops: number): void {
	const grade = Math.min(hops, REACH_CLASSES.length + 1) - 2;
	REACH_CLASSES.forEach((one, index) => group.classList.toggle(one, index === grade));
}

/**
 * The shadows the picture casts under its lines, each listing what cast it
 * (the renderer's `SHADOW_CLASS`): veiled, lit and graded with it.
 */
const SHADOWS = `.ab-shadow[${MEMBERS_ATTRIBUTE}]`;

/** The class the surface carries while the picture is seen from far away. */
const FAR_VIEW_CLASS = "is-far";

/** The class the surface carries while the picture lights what a poked part is wired to. */
const PROBING_CLASS = "is-probing";

/** The class it adds when the pointer rests on a part, which lights more lightly than a pick. */
const PROBING_LIGHT_CLASS = "is-probing-light";

/**
 * The classes the surface itself carries for the picture's stylesheet: that a
 * presented step veils the picture, that it is seen from far away, where each
 * card draws its name and the start of its responsibility larger, and that it
 * lights what a poked part is wired to. They are part of the surface's rendered
 * class, never toggled on it afterwards: a render that writes the surface's
 * class (a pan starting, say) would wipe a class put there by hand.
 * @param state What the surface says.
 * @param state.veiled Whether a presented step veils the picture.
 * @param state.far Whether the picture is seen from far away.
 * @param state.probing How strongly the picture lights a poked part's connections, or null for not at all.
 * @returns The classes, each with a leading space, or nothing.
 */
function surfaceMarks({
	veiled,
	far,
	probing = null,
}: {
	veiled: boolean;
	far: boolean;
	probing?: ProbeMode | null;
}): string {
	const lighting =
		probing === null
			? ""
			: ` ${PROBING_CLASS}${probing === "hover" ? ` ${PROBING_LIGHT_CLASS}` : ""}`;
	return `${veiled ? ` ${VEILED_CLASS}` : ""}${far ? ` ${FAR_VIEW_CLASS}` : ""}${lighting}`;
}

export {
	PULSE_CLASS,
	SUBJECT_ATTRIBUTE,
	controlAt,
	markReach,
	markSubjects,
	markVeil,
	quietLines,
	subjectAt,
	subjectBox,
	surfaceMarks,
	type ProbeMode,
};
