// Turning what an agent wrote into what the board holds.
//
// An agent may name a node by its id or by its name, because it has often just
// written that name and does not yet know what id it was given. A name is a
// convenience, and a convenience that guesses is worse than no convenience at
// all: two containers on one board can perfectly reasonably each hold a module
// called `client`, and picking whichever was written first would attach an edge
// to the wrong one and then tell nobody. So a name that fits more than one node
// is refused, and the refusal says to use the id.
//
// Between those two spellings sits a third, for the kinds that have no name to
// be written under: a handle the same command gave the entry that created the
// thing. Resolution is therefore id, then handle, then name, and the order can
// never be ambiguous because a handle that collides with either of the others
// is refused when it is taken (`batch.ts`).
//
// Ids themselves are never derived from anything an agent can change. A node
// removed and written again under the same name is a new node, not the old one
// come back, and two unrelated nodes written into sibling variants are two
// nodes. Both of those follow from minting through `src/shared/ids/ids.ts`
// against every id the board already holds, rather than hashing a name.
//
// The identity rules the flows, the views and the walkthroughs share live here
// too, rather than in whichever of those three modules happened to need them
// first: an entity is replaced whole, a stated id must name one that is already
// there, a stated name resolves only when it fits exactly one thing, and
// anything genuinely new is minted against the whole board family.

import type { SemanticNode } from "@/shared/semantic-board/index";
import {
	refuse,
	type SemanticRefusal,
	type SemanticRefusalCode,
} from "@/runtime/semantic-board-store/lib/outcome";
import {
	byHandle,
	held,
	mintInto,
	type Batch,
	type MintedId,
} from "@/runtime/semantic-board-store/lib/batch";

/** The node a reference named, or why it named nothing usable. */
type NodeResolution = { readonly ok: true; readonly node: SemanticNode } | SemanticRefusal;

/**
 * A kind of explanation that is addressed by the name it was written under, and
 * whose stated id must therefore name one that is already there.
 */
type NamedKind = "flow" | "view" | "walkthrough";

/** What to refuse a stated id with, when it names nothing of its kind. */
const UNKNOWN: Readonly<Record<NamedKind, SemanticRefusalCode>> = {
	flow: "UNKNOWN_FLOW",
	view: "UNKNOWN_VIEW",
	walkthrough: "UNKNOWN_WALKTHROUGH",
};

/**
 * The node a reference names: its id first, then a handle this command gave
 * out, then its name, and only when that name belongs to exactly one node.
 * @param nodes The nodes to search.
 * @param reference The id, handle or name stated.
 * @param what What the caller was trying to do, for the refusal to quote.
 * @param batch The batch, for the handles it has given out.
 * @returns The node, or the refusal.
 */
function resolveNode(
	nodes: readonly SemanticNode[],
	reference: string,
	what: string,
	batch: Batch,
): NodeResolution {
	const known = nodes.find((node) => node.id === reference) ?? byHandle(nodes, batch, reference);
	if (known !== undefined) {
		return { ok: true, node: known };
	}
	const byName = nodes.filter((node) => node.name === reference);
	const only = byName[0];
	if (only === undefined) {
		return refuse("UNKNOWN_NODE", `no node called "${reference}" to ${what}`);
	}
	if (byName.length > 1) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${reference}" is the name of ${byName.length} nodes on this board; ` +
				`name the one you mean by its id (${byName.map((node) => node.id).join(", ")})`,
		);
	}
	return { ok: true, node: only };
}

/**
 * Put an entity on the board, replacing whatever held its id.
 * @param entities The entities as they stand.
 * @param entity The entity to place.
 * @returns The entities with it placed.
 */
function place<Entity extends { readonly id: string }>(
	entities: readonly Entity[],
	entity: Entity,
): Entity[] {
	const at = entities.findIndex((existing) => existing.id === entity.id);
	return at < 0
		? [...entities, entity]
		: entities.map((existing, index) => (index === at ? entity : existing));
}

/**
 * The id a stated entity should carry: the one it names, which must already be
 * there, the one the thing it replaces has, or a fresh one — and the handle it
 * asked for, taken against whichever of those it ended up with.
 * @param existing The entities as they stand.
 * @param stated What the agent wrote.
 * @param stated.id The entity it replaces, when it names one.
 * @param stated.name What it is called.
 * @param stated.as The handle it asked for, when it asked for one.
 * @param batch The batch; its ids and handles are extended.
 * @param what The kind of thing, for the refusal to name.
 * @returns The id, or why the stated one names nothing.
 */
function idFor(
	existing: readonly { readonly id: string; readonly name: string }[],
	stated: {
		readonly id?: string | undefined;
		readonly name: string;
		readonly as?: string | undefined;
	},
	batch: Batch,
	what: NamedKind,
): MintedId {
	if (stated.id !== undefined) {
		const replacing = replaced(existing, stated.id, stated.name, what);
		return replacing.ok ? held(batch, stated.as, replacing.id) : replacing;
	}
	const byName = existing.filter((one) => one.name === stated.name);
	const only = byName[0];
	if (byName.length > 1) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${stated.name}" is already the name of ${byName.length} ${what}s; state the id of the ` +
				`one you mean (${byName.map((one) => one.id).join(", ")})`,
		);
	}
	return held(batch, stated.as, only?.id ?? mintInto(batch));
}

/**
 * The id of the entity a stated id replaces, or the refusal for naming none.
 * @param existing The entities as they stand.
 * @param id The id the agent stated.
 * @param name What it called the entity, for the refusal.
 * @param what The kind of thing, for the refusal to name.
 * @returns The id, or the refusal.
 */
function replaced(
	existing: readonly { readonly id: string }[],
	id: string,
	name: string,
	what: NamedKind,
): MintedId {
	if (existing.some((one) => one.id === id)) {
		return { ok: true, id };
	}
	return refuse(
		UNKNOWN[what],
		`there is no ${what} "${id}" on this variant to replace. Leave the id out to add ` +
			`"${name}" as a new one`,
	);
}

/**
 * The optional prose an entity carries, present only where it was written.
 * @param stated What the agent wrote.
 * @param stated.summary The longer explanation, when there is one.
 * @returns The summary field it actually has.
 */
function named(stated: { readonly summary?: string | undefined }): { summary?: string } {
	return stated.summary === undefined ? {} : { summary: stated.summary };
}

/**
 * The one entity a reference names, by id or by name.
 * @param entities The entities to search.
 * @param reference The id or name stated.
 * @returns The entity, or undefined when nothing or more than one answers to it.
 */
function namedOne<Entity extends { readonly id: string; readonly name: string }>(
	entities: readonly Entity[],
	reference: string,
): Entity | undefined {
	const byId = entities.find((one) => one.id === reference);
	if (byId !== undefined) {
		return byId;
	}
	const byName = entities.filter((one) => one.name === reference);
	return byName.length === 1 ? byName[0] : undefined;
}

export { type NodeResolution, type NamedKind, resolveNode, place, idFor, named, namedOne };
