// How a diffed node or edge is handed to a reader.
//
// `compare` speaks in ids and raw facts. A change event has to be safe to read
// aloud, so every node and edge it mentions is reduced here to the few fields
// a sentence needs, with an anonymous shape described rather than named after
// the synthetic id it was just given.

import type {
	ChangedEdge,
	ChangedNode,
	ClusterChange,
	EdgeFacts,
	FieldChange,
	NodeFacts,
	RelationChange,
} from "@/runtime/engine/compare";
import { isAnonymousNode } from "@/runtime/engine/lib/change-node-identity";

/** A borrowing view over inert diff data. */
type DeepReadonly<T> = T extends ClusterChange | RelationChange
	? Readonly<T>
	: T extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

/** One node, said the way a reader can use: never a synthetic id. */
interface NodeRef {
	node: string;
	name: string;
	anonymous: boolean;
	type: string;
	kind?: string;
	binding?: string;
	link?: string;
}

/** One node, with the fields that changed about it. */
interface NodeFieldChange extends NodeRef {
	changes: Record<string, FieldChange>;
}

/** One shape that became, stopped being, or was renamed as a node. */
interface NodeIdentityChange {
	/** What it is now. */
	to: NodeRef;
	/** What it was — the same shape under its old identity. */
	from: NodeRef;
	what: "promoted" | "demoted" | "renamed";
	elementIds: string[];
}

/** One connector, said with both of its ends named. */
interface EdgeRef {
	from: string;
	to: string;
	fromName: string;
	toName: string;
	label?: string;
	kind?: string;
	type: string;
}

/** One connector that kept its other end and moved this one. */
interface EdgeReroute {
	anchor: string;
	anchorName: string;
	end: "source" | "target";
	was: string;
	wasName: string;
	now: string;
	nowName: string;
}

// Ignore the browser's shape-plus-bound-text storage transition.
const STORAGE_ARTEFACT_FIELDS = new Set(["elementCount"]);

/**
 * What to call a node out loud.
 *
 * An anonymous shape is described ("an unlabelled rectangle") rather than
 * named after the synthetic id it was handed, which is the one thing nobody
 * ever called it.
 * @param facts What compare knows about the node.
 * @param anonymous Whether its id is one of the synthetic ones.
 * @param type The shape it is, for describing an anonymous one.
 * @returns The name a reader would use.
 */
function readerName(facts: DeepReadonly<NodeFacts>, anonymous: boolean, type: string): string {
	return anonymous ? (facts.label ?? facts.declaredName ?? `an unlabelled ${type}`) : facts.name;
}

/**
 * One node reduced to what a sentence about it needs.
 * @param facts What compare knows about the node.
 * @returns The reader-facing node.
 */
function refOf(facts: DeepReadonly<NodeFacts>): NodeRef {
	const anonymous = isAnonymousNode(facts.node);
	const { type } = facts.cosmetic;
	return {
		node: facts.node,
		name: readerName(facts, anonymous, type),
		anonymous,
		type,
		...(facts.kind !== undefined ? { kind: facts.kind } : {}),
		...(facts.bindingText !== undefined ? { binding: facts.bindingText } : {}),
		...(facts.link !== undefined ? { link: facts.link } : {}),
	};
}

/**
 * One connector reduced to what a sentence about it needs.
 * @param edge What compare knows about the connector.
 * @returns The reader-facing edge.
 */
function edgeRefOf(edge: DeepReadonly<EdgeFacts>): EdgeRef {
	return {
		from: edge.from,
		to: edge.to,
		fromName: edge.fromName,
		toName: edge.toName,
		...(edge.label !== undefined ? { label: edge.label } : {}),
		...(edge.kind !== undefined ? { kind: edge.kind } : {}),
		type: edge.type,
	};
}

/**
 * Drop the field changes that only record how the browser chose to store a
 * shape, so a round trip through the canvas does not read as an edit.
 * @param changes Every field compare saw change.
 * @returns The changes worth telling somebody about.
 */
function withoutStorageArtefacts(
	changes: Readonly<Record<string, DeepReadonly<FieldChange>>>,
): Record<string, FieldChange> {
	const kept: Record<string, FieldChange> = {};
	for (const [field, change] of Object.entries(changes)) {
		if (STORAGE_ARTEFACT_FIELDS.has(field)) {
			continue;
		}
		kept[field] = change;
	}
	return kept;
}

/**
 * A changed node, said as the node it is now plus what changed about it.
 * @param changed What compare recorded.
 * @returns The reader-facing change.
 */
function changedNodeOf(changed: DeepReadonly<ChangedNode>): NodeFieldChange {
	return { ...refOf(changed.to), changes: changed.changes };
}

/**
 * A changed connector, said as the connector it is now plus what changed.
 * @param changed What compare recorded.
 * @returns The reader-facing change.
 */
function changedEdgeOf(
	changed: DeepReadonly<ChangedEdge>,
): EdgeRef & { changes: Record<string, FieldChange> } {
	return { ...edgeRefOf(changed.toFacts), changes: changed.changes };
}

export {
	type DeepReadonly,
	type EdgeRef,
	type EdgeReroute,
	type NodeFieldChange,
	type NodeIdentityChange,
	type NodeRef,
	changedEdgeOf,
	changedNodeOf,
	edgeRefOf,
	refOf,
	withoutStorageArtefacts,
};
