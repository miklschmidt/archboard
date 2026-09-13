// One command's working memory: every id it must not mint again, and every
// handle it has been given.
//
// A batch is one write (TASK-068): everything stated in it lands together or
// none of it does. That already forces the batch to carry one fact from its
// first stated entry to its last — the ids it has spoken for, so that two fresh
// entities cannot be minted the same one. A handle is the same kind of fact
// over the same span: a name an agent gives one entry so a later entry in the
// *same* command can refer to it before the boundary has minted anything.
//
// Why handles exist at all. A walkthrough beat says what it is about, by id or
// by name for the kinds that have one. A relationship and a step have neither:
// no name of their own, and no id until the write boundary mints one. So there
// was no way to say, in one command, "add this call, and here is the beat that
// explains it" — naming the call gave UNKNOWN_SUBJECT, and inventing an id gave
// UNKNOWN_EDGE, which is the right answer to an invented id and stays the right
// answer. A handle is the missing third spelling, and it is spelled on the
// entry that creates the thing rather than on the entry that refers to it, so
// an agent never has to guess an identity it does not own.
//
// Why one map, threaded beside the ids, rather than one map per kind or a pass
// of its own. Everything a handle can name is something this batch is already
// minting an id for, and every place a handle can be written is a place this
// batch is already resolving a reference — so a second structure would have to
// be threaded to exactly the same functions, and would then have to answer what
// a handle naming a flow means in an edge's endpoint slot. That is a question
// about one namespace, and one namespace is one map. Keeping it beside `taken`
// also keeps the lifetime honest: both are born with the command and die with
// it, and a handle that outlived its command would be a second way to address a
// board.
//
// A handle is spent here and never written down. The entries a batch produces
// carry resolved ids, the document holds those, and nothing built from the
// document — a comparison, an atlas, an answer — can tell that a write used a
// handle at all. That is the same rule ADR 0015 states for every other input
// spelling: one converter, on the way in, nothing on the way out.

import { mintId } from "@/shared/ids/ids";
import {
	subjectIds,
	type SemanticBoard,
	type VariantContent,
	type VariantEditInput,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";

/** One identity, or why the entry asking for it could not be given one. */
type MintedId = { readonly ok: true; readonly id: string } | SemanticRefusal;

/** What one batch carries from its first stated entry to its last. */
interface Batch {
	/** Every id spoken for: the board family's, and everything minted so far. */
	readonly taken: Set<string>;
	/** The handle each entry asked for, against the id that entry was given. */
	readonly handles: Map<string, string>;
	/** The names a handle may not shadow, on the variant this batch edits. */
	readonly shadowed: ReadonlySet<string>;
}

/**
 * Open a batch over the ids it may not mint again.
 * @param taken The ids already spoken for.
 * @param shadowed The names a handle may not shadow; none, for a mint that
 * happens outside a stated batch.
 * @returns The batch.
 */
function openBatch(taken: Iterable<string>, shadowed: Iterable<string> = []): Batch {
	return { taken: new Set(taken), handles: new Map(), shadowed: new Set(shadowed) };
}

/**
 * Every id the whole board family has spoken for: every subject of every
 * variant — nodes, relationships, flows, their steps, views, walkthroughs and
 * their beats — and the variants and the board itself.
 *
 * One set rather than one per kind, because a variant's subjects are one
 * namespace: an id that meant a node here and a step there would resolve to
 * whichever a reader looked in first.
 *
 * The set spans the family rather than one variant on purpose. Two proposals
 * are compared by identity, so a fresh entity written into one of them must
 * not be handed an id its sibling is already using for something unrelated.
 * @param board The board, or null before there is one.
 * @returns The ids in use.
 */
function idsInUse(board: SemanticBoard | null): Set<string> {
	const taken = new Set<string>();
	if (board === null) {
		return taken;
	}
	taken.add(board.id);
	for (const view of board.views) {
		taken.add(view.id);
	}
	for (const variant of board.variants) {
		taken.add(variant.id);
		for (const id of subjectIds(variant.content)) {
			taken.add(id);
		}
	}
	return taken;
}

/**
 * The names a reference in this batch could already mean, and which a handle
 * may therefore not shadow: everything addressable by name on the variant as it
 * stands, and everything this batch itself gives a name to.
 * @param before The content as it stood.
 * @param edit The batch as stated.
 * @param board The board whose subjects a shared view can reference.
 * @returns The names.
 */
function namesInPlay(
	before: VariantContent,
	edit: VariantEditInput,
	board: SemanticBoard | null,
): Set<string> {
	return new Set([
		...namesOf(board?.views ?? []),
		...namesOf(
			board?.variants.flatMap((variant) => [...variant.content.nodes, ...variant.content.flows]) ??
				[],
		),
		...namesOf(before.nodes),
		...namesOf(before.flows),
		...namesOf(before.walkthroughs),
		...namesOf(edit.nodes),
		...namesOf(edit.flows),
		...namesOf(edit.views),
		...namesOf(edit.walkthroughs),
	]);
}

/**
 * The name of each of a collection of named things.
 * @param things The things.
 * @returns Their names.
 */
function namesOf(things: readonly { readonly name: string }[]): string[] {
	return things.map((one) => one.name);
}

/**
 * A fresh identity, recorded as taken so the rest of one batch cannot be given
 * it as well.
 * @param batch The batch; its taken ids are extended in place.
 * @returns The new id.
 */
function mintInto(batch: Batch): string {
	const id = mintId(batch.taken);
	batch.taken.add(id);
	return id;
}

/**
 * Take the handle a stated entry asked for, against the id that entry ended up
 * with, and hand the id back.
 *
 * Every id-choosing site ends here, so the handle is recorded exactly once and
 * exactly where the identity is settled — whether it was minted or was the id
 * the entry already had. An entry that asked for no handle passes straight
 * through.
 * @param batch The batch; its handles are extended in place.
 * @param as The handle the entry asked for, or undefined when it asked for none.
 * @param id The identity the entry carries.
 * @returns The id, or why the handle cannot be given.
 */
function held(batch: Batch, as: string | undefined, id: string): MintedId {
	if (as === undefined) {
		return { ok: true, id };
	}
	const clash = clashOf(batch, as);
	if (clash !== null) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${as}" cannot be a handle in this command because ${clash}; give it a word that is ` +
				"neither an id nor a name already in play",
		);
	}
	batch.handles.set(as, id);
	return { ok: true, id };
}

/**
 * What a handle would collide with, in the words the refusal quotes.
 *
 * A collision is refused rather than resolved either way round. Preferring the
 * handle would silently shadow a node somebody can see on the board; preferring
 * what was there would silently drop the handle and leave a later reference
 * pointing at the wrong thing. Both are a beat that quietly says something
 * untrue, which is the failure this whole mechanism exists to avoid.
 * @param batch The batch.
 * @param as The handle asked for.
 * @returns The collision, or null when there is none.
 */
function clashOf(batch: Batch, as: string): string | null {
	const already = batch.handles.get(as);
	if (already !== undefined) {
		return `this command already gave it to the entry it wrote as "${already}"`;
	}
	if (batch.taken.has(as)) {
		return `"${as}" is already the id of something this board holds`;
	}
	return batch.shadowed.has(as) ? `"${as}" is already the name of something on this variant` : null;
}

/**
 * The id one handle stands for, when the reference is a handle this command has
 * given out.
 * @param batch The batch.
 * @param reference What the agent wrote.
 * @returns The id, or undefined when the reference is not one of this command's handles.
 */
function handled(batch: Batch, reference: string): string | undefined {
	return batch.handles.get(reference);
}

/**
 * The entity one handle names, when this command has given that handle out and
 * the entity it stands for is in this collection.
 * @param entities The entities to search.
 * @param batch The batch.
 * @param reference What the agent wrote.
 * @returns The entity, or undefined when the reference names none of them.
 */
function byHandle<Entity extends { readonly id: string }>(
	entities: readonly Entity[],
	batch: Batch,
	reference: string,
): Entity | undefined {
	const id = handled(batch, reference);
	return id === undefined ? undefined : entities.find((one) => one.id === id);
}

export {
	type Batch,
	type MintedId,
	openBatch,
	idsInUse,
	namesInPlay,
	mintInto,
	held,
	handled,
	byHandle,
};
