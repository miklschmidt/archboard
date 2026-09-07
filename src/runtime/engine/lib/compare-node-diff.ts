// What became of each node, joined on the stable logical node id promotion
// assigns.

import { sameCentre } from "@/runtime/engine/layout";
import type {
	ChangedNode,
	CompareResult,
	CompareSideInput,
	FieldChange,
	NodeFacts,
	UnchangedNode,
} from "@/runtime/engine/lib/compare-contract";
import type { BoardModel } from "@/runtime/engine/lib/compare-board-model";
import {
	cosmeticFields,
	diffFields,
	layoutFields,
	nodeFacts,
	semanticFields,
} from "@/runtime/engine/lib/compare-diff";
import { formatBinding } from "@/runtime/engine/lib/compare-node-model";
import type { NodeModel } from "@/runtime/engine/lib/compare-node-model";

/** What the node pass found. */
interface NodeDiff {
	added: NodeFacts[];
	removed: NodeFacts[];
	changed: ChangedNode[];
	unchanged: UnchangedNode[];
	moved: CompareResult["layout"]["moved"];
	/** How many layout signals changed, across every shared node. */
	layoutSignalsChanged: number;
	/** How many nodes the join actually joined. */
	shared: number;
}

/** The two boards and what the comparison already knows about them. */
interface DiffContext {
	from: CompareSideInput;
	to: CompareSideInput;
	A: BoardModel;
	B: BoardModel;
	/** The nodes both boards hold, which layout is compared in terms of. */
	sharedIds: Set<string>;
}

/** How one shared node differs, in the three kinds a report keeps apart. */
interface NodeChanges {
	semantic: Record<string, FieldChange>;
	cosmetic: Record<string, FieldChange>;
	layout: Record<string, FieldChange>;
}

/**
 * The binding field of a report, stated only when the node has one.
 * @param binding What the node binds to, when it binds to anything.
 * @returns The field, or nothing.
 */
function bindingField(binding: string | undefined): { binding: string } | Record<string, never> {
	return binding === undefined ? {} : { binding };
}

/**
 * How one shared node differs: what it means, how it is drawn, and where it
 * sits.
 *
 * Anchoring the region frame to the shared nodes stops arrivals and
 * departures renaming anybody's region, but a *shared* node dragged to a new
 * extreme still stretches the frame, and its stationary neighbours are handed
 * new region names for it. Region is read off the centre and nothing else, so
 * a centre that did not move is proof the new name came from the frame:
 * reporting it would have the feed say "X moved", which is false about X.
 *
 * That suppression is only ever reached when both sides are in one coordinate
 * system — the same board a moment apart, or a variant copied from its
 * sibling — which is exactly where "moved" is read as a claim about something
 * someone did. Two independently drawn variants never trip it, and there the
 * anchored frame carries the weight on its own. A board rearranged wholesale
 * is untouched: every centre moved, so nothing is suppressed.
 * @param a The node on one side.
 * @param b The node on the other.
 * @param context The two boards.
 * @returns The three kinds of change.
 */
function changesBetween(a: NodeModel, b: NodeModel, context: DiffContext): NodeChanges {
	const { A, B, from, to, sharedIds } = context;
	const layout = diffFields(
		layoutFields(a, A.clusters, A.groups, sharedIds),
		layoutFields(b, B.clusters, B.groups, sharedIds),
	);
	if (layout["region"] && sameCentre(a.box, b.box)) {
		delete layout["region"];
	}
	return {
		semantic: diffFields(
			semanticFields(a, from.identity.variant),
			semanticFields(b, to.identity.variant),
		),
		cosmetic: diffFields(cosmeticFields(a), cosmeticFields(b)),
		layout,
	};
}

/**
 * A node that says something different now.
 * @param id The node id.
 * @param a The node on one side.
 * @param b The node on the other.
 * @param changes How it differs.
 * @param context The two boards.
 * @returns The report.
 */
function changedNode(
	id: string,
	a: NodeModel,
	b: NodeModel,
	changes: NodeChanges,
	context: DiffContext,
): ChangedNode {
	return {
		node: id,
		name: b.name,
		changes: changes.semantic,
		...(Object.keys(changes.cosmetic).length > 0 ? { cosmeticChanges: changes.cosmetic } : {}),
		...(Object.keys(changes.layout).length > 0 ? { layoutChanges: changes.layout } : {}),
		from: nodeFacts(a, context.A.clusters),
		to: nodeFacts(b, context.B.clusters),
	};
}

/**
 * A node that means what it did, whether or not it was moved or redrawn.
 * @param id The node id.
 * @param b The node as it now stands.
 * @param changes How it differs.
 * @param context The two boards.
 * @returns The report.
 */
function unchangedNode(
	id: string,
	b: NodeModel,
	changes: NodeChanges,
	context: DiffContext,
): UnchangedNode {
	return {
		node: id,
		name: b.name,
		...(b.kind ? { kind: b.kind } : {}),
		...bindingField(formatBinding(b.binding)),
		...(Object.keys(changes.layout).length > 0 ? { layoutChanges: changes.layout } : {}),
		...(Object.keys(changes.cosmetic).length > 0 ? { cosmeticChanges: changes.cosmetic } : {}),
		facts: nodeFacts(b, context.B.clusters),
	};
}

/**
 * Record one shared node's differences in the diff.
 * @param id The node id.
 * @param a The node on one side.
 * @param b The node on the other.
 * @param context The two boards.
 * @param diff What the pass has found so far, extended in place.
 */
function recordShared(
	id: string,
	a: NodeModel,
	b: NodeModel,
	context: DiffContext,
	diff: NodeDiff,
): void {
	diff.shared += 1;
	const changes = changesBetween(a, b, context);
	diff.layoutSignalsChanged += Object.keys(changes.layout).length;
	if (Object.keys(changes.layout).length > 0) {
		diff.moved.push({ node: id, name: b.name, changes: changes.layout });
	}
	if (Object.keys(changes.semantic).length > 0) {
		diff.changed.push(changedNode(id, a, b, changes, context));
		return;
	}
	diff.unchanged.push(unchangedNode(id, b, changes, context));
}

/**
 * What became of every node either board holds.
 * @param context The two boards.
 * @returns What was added, removed, changed, moved and left alone.
 */
function diffNodes(context: DiffContext): NodeDiff {
	const { A, B } = context;
	const diff: NodeDiff = {
		added: [],
		removed: [],
		changed: [],
		unchanged: [],
		moved: [],
		layoutSignalsChanged: 0,
		shared: 0,
	};
	for (const id of [...new Set([...A.nodes.keys(), ...B.nodes.keys()])].toSorted()) {
		const a = A.nodes.get(id);
		const b = B.nodes.get(id);
		if (a && b) {
			recordShared(id, a, b, context, diff);
		} else if (a) {
			diff.removed.push(nodeFacts(a, A.clusters));
		} else if (b) {
			diff.added.push(nodeFacts(b, B.clusters));
		}
	}
	return diff;
}

export { type DiffContext, type NodeDiff, diffNodes };
