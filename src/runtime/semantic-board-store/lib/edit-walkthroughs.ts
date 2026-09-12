// The third part of one batch: the explanations.
//
// A walkthrough follows every rule the flows and the views follow, and reuses
// this module's own machinery for them rather than keeping a second copy:
// an explanation is replaced whole, a stated id must name one that is already
// there, a stated name resolves only when it fits exactly one, and anything
// genuinely new is minted against the whole board family.
//
// Two things are its own.
//
// A beat's subjects are resolved across everything the batch leaves behind, not
// against one kind. A beat is about the architecture — a node, a relationship,
// a flow, one step of a flow — and an agent explaining what it has just written
// knows those by the names it gave them. A relationship and a step have no
// name, so they are identified; a name that fits two things is refused rather
// than guessed at, because a beat highlighting the wrong box is an explanation
// that quietly says something untrue.
//
// A beat is never quietly rewritten. When a node goes away underneath an
// explanation that talks about it, the answer is the flow's answer and not the
// view's: refuse the whole batch and say so. A view is a lens and narrowing it
// loses nothing, but a beat is a paragraph somebody wrote, and silently
// dropping the subject out of it would leave prose about a service pointing at
// nothing, with nobody told. The refusal says what to do instead, and removing
// the node and rewriting the beat is one command either way.

import type {
	SemanticEdge,
	SemanticFlow,
	SemanticNode,
	SemanticView,
	SemanticWalkthrough,
	SemanticWalkthroughInput,
	VariantContent,
	VariantEditInput,
	WalkthroughBeat,
	WalkthroughBeatInput,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { idFor, named, namedOne, place } from "@/runtime/semantic-board-store/lib/references";
import { handled, mintInto, type Batch } from "@/runtime/semantic-board-store/lib/batch";

/** The walkthroughs a batch leaves behind, or why it leaves none. */
type WalkthroughEdit =
	| { readonly ok: true; readonly walkthroughs: SemanticWalkthrough[] }
	| SemanticRefusal;

/** What the batch leaves on the board, which is what a beat may be about. */
interface Holdings {
	readonly nodes: readonly SemanticNode[];
	readonly edges: readonly SemanticEdge[];
	readonly flows: readonly SemanticFlow[];
	readonly views: readonly SemanticView[];
}

/** One resolved identity, or why the reference could not be resolved. */
type Resolved = { readonly ok: true; readonly id: string } | SemanticRefusal;

/**
 * Every identity a beat may be about: the architecture the batch leaves and the
 * exchanges over it, down to the individual step.
 *
 * The views are not in here. A beat names the view it is told through in its
 * own field, and that is a different sentence from what the beat is about.
 * @param holds What the batch leaves on the board.
 * @returns The ids a beat's subject may name.
 */
function aboutable(holds: Holdings): Set<string> {
	return new Set([
		...holds.nodes.map((node) => node.id),
		...holds.edges.map((edge) => edge.id),
		...holds.flows.flatMap((flow) => [flow.id, ...flow.steps.map((step) => step.id)]),
	]);
}

/**
 * The identity one stated subject names: an id of anything the batch leaves,
 * then a handle this command gave out, then the name of the one node or flow it
 * fits.
 *
 * The handle is what lets one command create a relationship or a step and the
 * beat that explains it: neither has a name to be written under, and neither
 * has an id until this boundary mints one.
 * @param holds What the batch leaves on the board.
 * @param ids Every id a beat may be about.
 * @param reference What the agent wrote.
 * @param batch The batch, for the handles it has given out.
 * @returns The id, or why the reference named nothing usable.
 */
function resolveSubject(
	holds: Holdings,
	ids: ReadonlySet<string>,
	reference: string,
	batch: Batch,
): Resolved {
	if (ids.has(reference)) {
		return { ok: true, id: reference };
	}
	const handle = handled(batch, reference);
	if (handle !== undefined && ids.has(handle)) {
		return { ok: true, id: handle };
	}
	const byName = [...holds.nodes, ...holds.flows].filter((one) => one.name === reference);
	const only = byName[0];
	if (byName.length > 1) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${reference}" is the name of ${byName.length} things on this board; name the one the ` +
				`beat is about by its id (${byName.map((one) => one.id).join(", ")})`,
		);
	}
	if (only === undefined) {
		return refuse("UNKNOWN_SUBJECT", `nothing called "${reference}" for a beat to be about`);
	}
	return { ok: true, id: only.id };
}

/**
 * The view a beat says it is told through.
 * @param views The views the batch leaves on the board.
 * @param reference What the agent wrote.
 * @returns The view's id, or why the reference named nothing.
 */
function resolveBeatView(views: readonly SemanticView[], reference: string): Resolved {
	const found = namedOne(views, reference);
	if (found === undefined) {
		return refuse("UNKNOWN_VIEW", `no view called "${reference}" for a beat to be read through`);
	}
	return { ok: true, id: found.id };
}

/**
 * The id a stated beat should carry: the one it names, which must be a beat
 * this walkthrough already had, or a fresh one.
 *
 * A stated id may not invent one, for the reason a step's may not: a typo would
 * leave the beat it meant to reword in place and add a second beside it, and a
 * later comparison would read that as a deletion and an addition rather than as
 * the mistake it is.
 * @param had The beats the walkthrough being replaced already had.
 * @param stated The beat as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The id, or why the stated one names nothing.
 */
function beatId(
	had: readonly WalkthroughBeat[],
	stated: WalkthroughBeatInput,
	batch: Batch,
): Resolved {
	if (stated.id === undefined) {
		return { ok: true, id: mintInto(batch) };
	}
	return had.some((beat) => beat.id === stated.id)
		? { ok: true, id: stated.id }
		: refuse(
				"UNKNOWN_BEAT",
				`there is no beat "${stated.id}" in this walkthrough to replace. Leave the id out to ` +
					`add "${stated.heading}" as a new one`,
			);
}

/**
 * Build one beat of a stated walkthrough.
 * @param had The beats the walkthrough being replaced already had.
 * @param stated The beat as the agent wrote it.
 * @param holds What the batch leaves on the board.
 * @param batch The batch; its ids and handles are extended.
 * @returns The beat, or the first reference that could not be resolved.
 */
function buildBeat(
	had: readonly WalkthroughBeat[],
	stated: WalkthroughBeatInput,
	holds: Holdings,
	batch: Batch,
): { readonly ok: true; readonly beat: WalkthroughBeat } | SemanticRefusal {
	const id = beatId(had, stated, batch);
	if (!id.ok) {
		return id;
	}
	const ids = aboutable(holds);
	const subjects: string[] = [];
	for (const reference of stated.subjects) {
		const subject = resolveSubject(holds, ids, reference, batch);
		if (!subject.ok) {
			return subject;
		}
		subjects.push(subject.id);
	}
	return withView(id.id, stated, subjects, holds);
}

/**
 * Finish one beat, resolving the view it is told through when it names one.
 * @param id The beat's identity.
 * @param stated The beat as the agent wrote it.
 * @param subjects The identities it is about.
 * @param holds What the batch leaves on the board.
 * @returns The beat, or why its view named nothing.
 */
function withView(
	id: string,
	stated: WalkthroughBeatInput,
	subjects: readonly string[],
	holds: Holdings,
): { readonly ok: true; readonly beat: WalkthroughBeat } | SemanticRefusal {
	const beat = { id, heading: stated.heading, body: stated.body, subjects: [...subjects] };
	if (stated.view === undefined) {
		return { ok: true, beat };
	}
	const view = resolveBeatView(holds.views, stated.view);
	return view.ok ? { ok: true, beat: { ...beat, view: view.id } } : view;
}

/**
 * Build one stated walkthrough against what the batch leaves on the board.
 * @param walkthroughs The walkthroughs as they stand.
 * @param stated The walkthrough as the agent wrote it.
 * @param holds What the batch leaves on the board.
 * @param batch The batch; its ids and handles are extended.
 * @returns The walkthrough, or why it could not be built.
 */
function buildWalkthrough(
	walkthroughs: readonly SemanticWalkthrough[],
	stated: SemanticWalkthroughInput,
	holds: Holdings,
	batch: Batch,
): { readonly ok: true; readonly walkthrough: SemanticWalkthrough } | SemanticRefusal {
	const chosen = idFor(walkthroughs, stated, batch, "walkthrough");
	if (!chosen.ok) {
		return chosen;
	}
	// The beats a stated id may name are the ones the walkthrough being replaced
	// already had. A beat belongs to its explanation, so an id from elsewhere
	// names nothing here even when it names something on the board.
	const had = walkthroughs.find((one) => one.id === chosen.id)?.beats ?? [];
	const beats: WalkthroughBeat[] = [];
	for (const statedBeat of stated.beats) {
		const built = buildBeat(had, statedBeat, holds, batch);
		if (!built.ok) {
			return built;
		}
		beats.push(built.beat);
	}
	return {
		ok: true,
		walkthrough: { id: chosen.id, name: stated.name, beats, ...named(stated) },
	};
}

/**
 * What the batch takes off the board, resolved against the content as it stood.
 * @param before The content as it stood.
 * @param edit What the agent stated.
 * @returns The walkthrough ids to remove, or the first reference that named nothing.
 */
function plannedRemovals(
	before: VariantContent,
	edit: VariantEditInput,
): { readonly ok: true; readonly gone: ReadonlySet<string> } | SemanticRefusal {
	const gone = new Set<string>();
	for (const reference of edit.removeWalkthroughs) {
		const walkthrough = namedOne(before.walkthroughs, reference);
		if (walkthrough === undefined) {
			return refuse("UNKNOWN_WALKTHROUGH", `no walkthrough called "${reference}" to remove`);
		}
		gone.add(walkthrough.id);
	}
	return { ok: true, gone };
}

/**
 * Check every beat the batch leaves against what the batch leaves on the board.
 *
 * This runs at the end rather than at removal time, for the reason the orphan
 * check does: one thing somebody asked for is one write, so an agent may take a
 * node away and rewrite the beat that talked about it in the same command, in
 * either order, and hears about it only when something really is left saying
 * nothing.
 * @param walkthroughs The walkthroughs the batch leaves.
 * @param holds What the batch leaves on the board.
 * @returns The walkthroughs, or the refusal.
 */
function settled(walkthroughs: readonly SemanticWalkthrough[], holds: Holdings): WalkthroughEdit {
	const ids = aboutable(holds);
	const views = new Set(holds.views.map((view) => view.id));
	for (const walkthrough of walkthroughs) {
		for (const beat of walkthrough.beats) {
			const lost = strandedIn(beat, ids, views);
			if (lost !== undefined) {
				return refuse("SUBJECT_IN_WALKTHROUGH", strandedBeat(walkthrough, beat, lost));
			}
		}
	}
	return { ok: true, walkthroughs: [...walkthroughs] };
}

/**
 * The first thing one beat names that the batch does not leave behind.
 * @param beat The beat.
 * @param ids Every id a beat may be about.
 * @param views The views the batch leaves.
 * @returns The stranded identity, or undefined when the beat still stands up.
 */
function strandedIn(
	beat: WalkthroughBeat,
	ids: ReadonlySet<string>,
	views: ReadonlySet<string>,
): string | undefined {
	const subject = beat.subjects.find((id) => !ids.has(id));
	if (subject !== undefined) {
		return subject;
	}
	return beat.view !== undefined && !views.has(beat.view) ? beat.view : undefined;
}

/**
 * What to say about a beat left talking about something that is gone.
 * @param walkthrough The explanation it belongs to.
 * @param beat The beat.
 * @param lost The identity that is no longer on the board.
 * @returns The sentence.
 */
function strandedBeat(
	walkthrough: SemanticWalkthrough,
	beat: WalkthroughBeat,
	lost: string,
): string {
	return (
		`"${beat.heading}" in the walkthrough "${walkthrough.name}" is about "${lost}", which is not ` +
		"on the board any more; rewrite the beat or remove it in the same command"
	);
}

/**
 * Every walkthrough the batch leaves behind.
 * @param before The content as it stood.
 * @param edit What the agent stated.
 * @param holds What the batch leaves on the board, for a beat to be about.
 * @param batch The batch; its ids and handles are extended.
 * @returns The walkthroughs, or why the batch was refused.
 */
function editWalkthroughs(
	before: VariantContent,
	edit: VariantEditInput,
	holds: Holdings,
	batch: Batch,
): WalkthroughEdit {
	const removed = plannedRemovals(before, edit);
	if (!removed.ok) {
		return removed;
	}
	let walkthroughs = before.walkthroughs.filter((one) => !removed.gone.has(one.id));
	for (const stated of edit.walkthroughs) {
		const built = buildWalkthrough(walkthroughs, stated, holds, batch);
		if (!built.ok) {
			return built;
		}
		walkthroughs = place(walkthroughs, built.walkthrough);
	}
	return settled(walkthroughs, holds);
}

export { type WalkthroughEdit, editWalkthroughs };
