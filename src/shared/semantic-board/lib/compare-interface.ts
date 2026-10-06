// What a variant changed about the interface of each container (ADR 0044).
//
// An interface change costs every caller and an implementation change costs one
// module, so a comparison says the first before the rest. Nothing here is
// authored or stored: each container's interface is derived on both variants by
// `inspectContainer`, and the two are held against each other by node identity,
// over the whole content before any view narrows it.
//
// This reading is separate from `compareVariants` on purpose, and it labels
// nothing. A new caller moves a part into the interface, and the new
// relationship is what shows as added; the part keeps its own standing, because
// a standing marks only a subject whose own fields moved and a badge must never
// spread to a neighbour. The answer here says what moved and sets no status.
//
// What counts as a change, for one container:
//
//   An entry point added or removed is an entry point on one variant that is not
//   a child of the container on the other.
//
//   A part moved is a child of the container on both variants that is an entry
//   point on only one of them.
//
//   A caller gained or lost is a part that sends a relationship into the
//   container on one variant and not on the other.
//
// A node that has children on one variant only is a container whose whole
// interface appears or vanishes: the other side holds no parts, so every entry
// point and caller is added or removed with it. Its interface changed even when
// nothing outside reaches it, because a node with no children has no interface
// and a container with no entry points has an empty one: two different facts.

import type { SemanticNode, VariantContent } from "@/shared/semantic-board/lib/content";
import { inspectContainer } from "@/shared/semantic-board/lib/container-interface";

/** What one container's interface changed between two variants. */
interface InterfaceChange {
	/** The container as the later variant has it, or as the earlier one has it when it is gone. */
	readonly container: SemanticNode;
	/** Whether the node has children on each variant. */
	readonly holdsParts: { readonly before: boolean; readonly after: boolean };
	/** Entry points of the later variant that are not children of the container on the earlier. */
	readonly entryPointsAdded: readonly SemanticNode[];
	/** Entry points of the earlier variant that are not children of the container on the later. */
	readonly entryPointsRemoved: readonly SemanticNode[];
	/** Children on both variants that a relationship from outside reaches only on the later. */
	readonly becameEntryPoints: readonly SemanticNode[];
	/** Children on both variants that a relationship from outside reaches only on the earlier. */
	readonly becameHidden: readonly SemanticNode[];
	/** Parts that call the container on the later variant and did not on the earlier. */
	readonly callersGained: readonly SemanticNode[];
	/** Parts that called the container on the earlier variant and do not on the later. */
	readonly callersLost: readonly SemanticNode[];
}

/** The interface changes of every container either variant has. */
interface InterfaceComparison {
	/** The containers whose interface changed, in the order their variants list them. */
	readonly changed: readonly InterfaceChange[];
	/** The containers whose interface did not change, so that "no change" is a claim that can be read. */
	readonly unchanged: readonly SemanticNode[];
}

/** What one variant says about one node as a container. */
interface Side {
	/** Whether the node has children there. */
	readonly holdsParts: boolean;
	/** Its children there, whether or not they are entry points. */
	readonly children: ReadonlySet<string>;
	/** Its entry points there, in document order. */
	readonly entryPoints: readonly SemanticNode[];
	/** The parts that call it there, in document order. */
	readonly callers: readonly SemanticNode[];
}

/**
 * What one variant says about one node as a container.
 * @param content The variant's whole content.
 * @param id The node's id.
 * @returns Its children and, when it has some, its entry points and callers; a
 *   node that is absent or a leaf holds no parts.
 */
function sideOf(content: VariantContent, id: string): Side {
	const node = content.nodes.find((one) => one.id === id);
	const found = node === undefined ? undefined : inspectContainer(content, node);
	const children = new Set(content.nodes.filter((one) => one.parent === id).map((one) => one.id));
	return found?.holdsParts === true
		? {
				holdsParts: true,
				children,
				entryPoints: found.entryPoints.map((entry) => entry.node),
				callers: found.callers.map((caller) => caller.node),
			}
		: { holdsParts: false, children, entryPoints: [], callers: [] };
}

/**
 * The nodes of a list that a set of ids does not hold.
 * @param nodes The nodes.
 * @param held The ids to leave out.
 * @returns The rest, in order.
 */
function outside(nodes: readonly SemanticNode[], held: ReadonlySet<string>): SemanticNode[] {
	return nodes.filter((node) => !held.has(node.id));
}

/**
 * The ids of some nodes.
 * @param nodes The nodes.
 * @returns The set of their ids.
 */
function idsOf(nodes: readonly SemanticNode[]): Set<string> {
	return new Set(nodes.map((node) => node.id));
}

/**
 * What one container's interface changed.
 * @param before The earlier variant's content.
 * @param after The later variant's content.
 * @param container The container, as a node of the later variant or else of the earlier.
 * @returns The change; every list is empty when nothing moved.
 */
function interfaceChange(
	before: VariantContent,
	after: VariantContent,
	container: SemanticNode,
): InterfaceChange {
	const was = sideOf(before, container.id);
	const is = sideOf(after, container.id);
	const wasEntryIds = idsOf(was.entryPoints);
	const isEntryIds = idsOf(is.entryPoints);
	return {
		container,
		holdsParts: { before: was.holdsParts, after: is.holdsParts },
		entryPointsAdded: outside(is.entryPoints, was.children),
		entryPointsRemoved: outside(was.entryPoints, is.children),
		becameEntryPoints: outside(
			is.entryPoints.filter((node) => was.children.has(node.id)),
			wasEntryIds,
		),
		becameHidden: outside(
			was.entryPoints.filter((node) => is.children.has(node.id)),
			isEntryIds,
		),
		callersGained: outside(is.callers, idsOf(was.callers)),
		callersLost: outside(was.callers, idsOf(is.callers)),
	};
}

/**
 * Whether anything about the interface moved.
 * @param change One container's change.
 * @returns True when the node holds parts on one variant only, or at least one
 *   list is not empty.
 */
function moves(change: InterfaceChange): boolean {
	return (
		change.holdsParts.before !== change.holdsParts.after ||
		[
			change.entryPointsAdded,
			change.entryPointsRemoved,
			change.becameEntryPoints,
			change.becameHidden,
			change.callersGained,
			change.callersLost,
		].some((list) => list.length > 0)
	);
}

/**
 * The nodes of a variant that have children.
 * @param content The variant's whole content.
 * @returns The containers, in document order.
 */
function containersOf(content: VariantContent): SemanticNode[] {
	const parents = new Set(content.nodes.map((node) => node.parent));
	return content.nodes.filter((node) => parents.has(node.id));
}

/**
 * What a variant changed about the interface of every container, by identity.
 *
 * A container is a node that has children on either variant. Reads the whole
 * content of both, as `compareVariants` does, and sets no comparison status.
 * @param before The variant it is read against.
 * @param after The variant compared.
 * @returns The containers whose interface changed, and those whose did not.
 */
function compareInterfaces(before: VariantContent, after: VariantContent): InterfaceComparison {
	const later = containersOf(after);
	const laterIds = idsOf(later);
	// A container only the earlier variant has is read as the later variant names it, or as it stood.
	const earlier = containersOf(before)
		.filter((node) => !laterIds.has(node.id))
		.map((node) => after.nodes.find((one) => one.id === node.id) ?? node);
	const changes = [...later, ...earlier].map((container) =>
		interfaceChange(before, after, container),
	);
	return {
		changed: changes.filter(moves),
		unchanged: changes.filter((change) => !moves(change)).map((change) => change.container),
	};
}

export { type InterfaceChange, type InterfaceComparison, compareInterfaces };
