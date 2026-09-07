// The parts of a change event, each read out of one compare result.
//
// `compareBoards` answers "what is different"; a change event answers "what
// happened", which is a different grouping: identity transitions pulled out of
// the changed nodes, movement pulled out of both changed and unchanged ones,
// and the layout signals reduced to the ones that are not simply stable.

import type {
	ClusterChange,
	CompareResult,
	FieldChange,
	NodeFacts,
	RelationChange,
} from "@/runtime/engine/compare";
import type { IdentityPair } from "@/runtime/engine/lib/change-node-identity";
import { isAnonymousNode } from "@/runtime/engine/lib/change-node-identity";
import type {
	DeepReadonly,
	EdgeRef,
	EdgeReroute,
	NodeFieldChange,
	NodeIdentityChange,
	NodeRef,
} from "@/runtime/engine/lib/change-refs";
import {
	changedEdgeOf,
	changedNodeOf,
	edgeRefOf,
	refOf,
	withoutStorageArtefacts,
} from "@/runtime/engine/lib/change-refs";

/** Same node, new place. */
type MovedNode = NodeRef & { changes: Record<string, FieldChange> };

/** How a whole board's nodes differ between two moments. */
interface ChangedNodes {
	added: NodeRef[];
	removed: NodeRef[];
	changed: NodeFieldChange[];
	identity: NodeIdentityChange[];
	/** Same node, new place: only the ones whose layout signals actually moved. */
	moved: MovedNode[];
}

/** How a whole board's connectors differ between two moments. */
interface ChangedEdges {
	added: EdgeRef[];
	removed: EdgeRef[];
	changed: (EdgeRef & { changes: Record<string, FieldChange> })[];
	rerouted: EdgeReroute[];
}

/** The arrangement signals that are not simply stable. */
interface ChangedLayout {
	clusters: ClusterChange[];
	groups: ClusterChange[];
	relations: RelationChange[];
}

/** How much of each kind of change there is, for a caller that only counts. */
interface ChangeCounts {
	nodesAdded: number;
	nodesRemoved: number;
	nodesChanged: number;
	nodesMoved: number;
	identityChanges: number;
	edgesAdded: number;
	edgesRemoved: number;
	edgesChanged: number;
	edgesRerouted: number;
	layoutSignals: number;
}

/** How much a change matters, from silent to worth interrupting for. */
type Significance = "none" | "cosmetic" | "layout" | "structural";

/** One shape's facts on each side of an identity transition. */
interface IdentitySides {
	to: DeepReadonly<NodeFacts>;
	from: DeepReadonly<NodeFacts>;
}

/**
 * The two sides of one node in a diff.
 *
 * A node whose identity moved shows up as changed when anything else about it
 * moved too, and as unchanged when nothing did; either way both sides are the
 * same shape.
 * @param detail The whole comparison.
 * @param node The node id, as it reads after the transition.
 * @returns Its facts before and after, or undefined when the diff lost it.
 */
function sidesOf(detail: DeepReadonly<CompareResult>, node: string): IdentitySides | undefined {
	const changed = detail.nodes.changed.find((n) => n.node === node);
	if (changed) {
		return { to: changed.to, from: changed.from };
	}
	const unchanged = detail.nodes.unchanged.find((n) => n.node === node);
	return unchanged ? { to: unchanged.facts, from: unchanged.facts } : undefined;
}

/**
 * What happened to a shape whose node id changed: it gained an identity, lost
 * one, or kept one under a new id.
 * @param wasAnon Whether it was anonymous before.
 * @param isAnon Whether it is anonymous now.
 * @returns The word for it.
 */
function identityKindOf(wasAnon: boolean, isAnon: boolean): NodeIdentityChange["what"] {
	if (wasAnon && !isAnon) {
		return "promoted";
	}
	if (!wasAnon && isAnon) {
		return "demoted";
	}
	return "renamed";
}

/**
 * What a shape was called before its identity moved.
 *
 * The old side is read out of a record that now carries the new id, so an
 * unlabelled shape would otherwise be "named" after the id it was just given —
 * the one thing it certainly was not called before.
 * @param facts Its facts on the old side.
 * @param wasAnon Whether it was anonymous before.
 * @param previousNode The node id it answered to before.
 * @returns The former name.
 */
function formerName(
	facts: DeepReadonly<NodeFacts>,
	wasAnon: boolean,
	previousNode: string,
): string {
	return (
		facts.label ??
		facts.declaredName ??
		(wasAnon ? `an unlabelled ${facts.cosmetic.type}` : previousNode)
	);
}

/**
 * Every shape that became, stopped being, or was renamed as a node, read back
 * out of the diff that was already aligned to their new ids.
 * @param pairs The identity transitions found before comparing.
 * @param detail The whole comparison.
 * @returns One entry per transition the diff still knows about.
 */
function identityChangesOf(
	pairs: readonly DeepReadonly<IdentityPair>[],
	detail: DeepReadonly<CompareResult>,
): NodeIdentityChange[] {
	const changes: NodeIdentityChange[] = [];
	for (const pair of pairs) {
		const sides = sidesOf(detail, pair.node);
		if (!sides) {
			continue;
		}
		const wasAnon = isAnonymousNode(pair.previousNode);
		changes.push({
			what: identityKindOf(wasAnon, isAnonymousNode(pair.node)),
			from: {
				...refOf(sides.from),
				node: pair.previousNode,
				anonymous: wasAnon,
				name: formerName(sides.from, wasAnon, pair.previousNode),
			},
			to: refOf(sides.to),
			elementIds: [...pair.elementIds],
		});
	}
	return changes;
}

/**
 * The nodes that stayed themselves and moved, from both sides of the diff: a
 * node can move whether or not anything else about it changed.
 * @param detail The whole comparison.
 * @returns The moved nodes with the layout fields that moved.
 */
function movedNodes(detail: DeepReadonly<CompareResult>): MovedNode[] {
	const moved: MovedNode[] = [];
	for (const node of detail.nodes.unchanged) {
		if (node.layoutChanges) {
			moved.push({ ...refOf(node.facts), changes: node.layoutChanges });
		}
	}
	for (const node of detail.nodes.changed) {
		if (node.layoutChanges) {
			moved.push({ ...refOf(node.to), changes: node.layoutChanges });
		}
	}
	return moved;
}

/**
 * The ordinary field changes worth reporting.
 *
 * A promotion's field changes are already spelled out in the identity entry,
 * which carries both sides; repeating them as an ordinary change would say the
 * same thing twice in different words.
 * @param detail The whole comparison.
 * @param identityNodes The nodes already reported as identity transitions.
 * @returns The remaining changed nodes.
 */
function changedNodesOf(
	detail: DeepReadonly<CompareResult>,
	identityNodes: ReadonlySet<string>,
): NodeFieldChange[] {
	const changedNodes: NodeFieldChange[] = [];
	for (const node of detail.nodes.changed) {
		if (identityNodes.has(node.node)) {
			continue;
		}
		const changes = withoutStorageArtefacts(node.changes);
		if (Object.keys(changes).length > 0) {
			changedNodes.push(changedNodeOf({ ...node, changes }));
		}
	}
	return changedNodes;
}

/**
 * How the board's nodes differ, in reader-facing form.
 * @param detail The whole comparison.
 * @param identityChanges The identity transitions, already worked out.
 * @returns The node sections of a change event.
 */
function nodeSectionsOf(
	detail: DeepReadonly<CompareResult>,
	identityChanges: NodeIdentityChange[],
): ChangedNodes {
	const identityNodes = new Set(identityChanges.map((change) => change.to.node));
	return {
		added: detail.nodes.added.map((facts) => refOf(facts)),
		removed: detail.nodes.removed.map((facts) => refOf(facts)),
		changed: changedNodesOf(detail, identityNodes),
		identity: identityChanges,
		moved: movedNodes(detail),
	};
}

/**
 * How the board's connectors differ, in reader-facing form.
 * @param detail The whole comparison.
 * @returns The edge section of a change event.
 */
function edgeSectionsOf(detail: DeepReadonly<CompareResult>): ChangedEdges {
	return {
		added: detail.edges.added.map((edge) => edgeRefOf(edge)),
		removed: detail.edges.removed.map((edge) => edgeRefOf(edge)),
		changed: detail.edges.changed.map((edge) => changedEdgeOf(edge)),
		rerouted: [...detail.edges.rerouted],
	};
}

/**
 * Drop the arrangement signals that report nothing happened.
 * @param changes Every cluster or group signal compare produced.
 * @returns The ones that are not stable.
 */
function unstable(changes: readonly DeepReadonly<ClusterChange>[]): ClusterChange[] {
	return changes.filter((change) => change.kind !== "stable");
}

/**
 * How the board's arrangement differs, with the no-op signals dropped.
 * @param detail The whole comparison.
 * @returns The layout section of a change event.
 */
function layoutSectionsOf(detail: DeepReadonly<CompareResult>): ChangedLayout {
	return {
		clusters: unstable(detail.layout.clusters.changes),
		groups: unstable(detail.layout.groups.changes),
		relations: [...detail.layout.relations.changes],
	};
}

/**
 * Node id to the name a reader would use, covering every id this change
 * mentions on either side.
 * @param detail The whole comparison.
 * @returns The name index.
 */
function nameIndexOf(detail: DeepReadonly<CompareResult>): Record<string, string> {
	const names: Record<string, string> = {};
	/**
	 * Record one node's reader-facing name.
	 * @param facts What compare knows about it.
	 */
	const remember = (facts: DeepReadonly<NodeFacts>): void => {
		names[facts.node] = refOf(facts).name;
	};
	for (const facts of detail.nodes.added) {
		remember(facts);
	}
	for (const facts of detail.nodes.removed) {
		remember(facts);
	}
	for (const node of detail.nodes.changed) {
		remember(node.from);
		remember(node.to);
	}
	for (const node of detail.nodes.unchanged) {
		remember(node.facts);
	}
	return names;
}

/**
 * How much of each kind of change a change event holds.
 * @param nodes The node sections.
 * @param edges The edge section.
 * @param layout The layout section.
 * @returns The counts.
 */
function countsOf(nodes: ChangedNodes, edges: ChangedEdges, layout: ChangedLayout): ChangeCounts {
	return {
		nodesAdded: nodes.added.length,
		nodesRemoved: nodes.removed.length,
		nodesChanged: nodes.changed.length,
		nodesMoved: nodes.moved.length,
		identityChanges: nodes.identity.length,
		edgesAdded: edges.added.length,
		edgesRemoved: edges.removed.length,
		edgesChanged: edges.changed.length,
		edgesRerouted: edges.rerouted.length,
		layoutSignals:
			nodes.moved.length + layout.clusters.length + layout.groups.length + layout.relations.length,
	};
}

/**
 * How many changes touched the board's structure rather than its arrangement
 * or its looks.
 * @param counts The counts.
 * @returns The total.
 */
function structuralCount(counts: ChangeCounts): number {
	return (
		counts.nodesAdded +
		counts.nodesRemoved +
		counts.nodesChanged +
		counts.identityChanges +
		counts.edgesAdded +
		counts.edgesRemoved +
		counts.edgesChanged +
		counts.edgesRerouted
	);
}

/**
 * Whether anything changed only about how the board looks.
 * @param detail The whole comparison.
 * @returns True when some node's cosmetic fields moved.
 */
function hasCosmeticChange(detail: DeepReadonly<CompareResult>): boolean {
	return (
		detail.nodes.unchanged.some((n) => n.cosmeticChanges) ||
		detail.nodes.changed.some((n) => n.cosmeticChanges)
	);
}

/**
 * How much a change matters. Structure outranks arrangement, which outranks
 * looks, because that is the order in which a reader cares.
 * @param counts The counts.
 * @param cosmetic Whether anything cosmetic moved.
 * @returns The significance.
 */
function significanceOf(counts: ChangeCounts, cosmetic: boolean): Significance {
	if (structuralCount(counts) > 0) {
		return "structural";
	}
	if (counts.layoutSignals > 0) {
		return "layout";
	}
	return cosmetic ? "cosmetic" : "none";
}

export {
	type ChangeCounts,
	type ChangedEdges,
	type ChangedLayout,
	type ChangedNodes,
	type MovedNode,
	type Significance,
	countsOf,
	edgeSectionsOf,
	hasCosmeticChange,
	identityChangesOf,
	layoutSectionsOf,
	nameIndexOf,
	nodeSectionsOf,
	significanceOf,
};
