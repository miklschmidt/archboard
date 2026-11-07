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
//
// The same derivation puts the measures of several readings side by side, for
// design it twice. That answer marks no change: it holds each reading's counts
// beside the others, combines them into no score and ranks no reading.

import type { z } from "zod";
import type { SemanticNode, VariantContent } from "#shared/schemas/content.ts";
import type {
	InterfaceChangeSchema,
	InterfaceChangesSchema,
	MeasuredContainerSchema,
} from "#shared/schemas/model-interfaces.ts";
import { inspectContainer, interfaceMeasures } from "#shared/inspect/rules/container-interface.ts";

/** What one container's interface changed between two variants. */
type InterfaceChange = z.infer<typeof InterfaceChangeSchema>;

/** The interface changes of every container either variant has. */
type InterfaceComparison = z.infer<typeof InterfaceChangesSchema>;

/** One container with its measures on every reading. */
type MeasuredContainer = z.infer<typeof MeasuredContainerSchema>;

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
 * One module named in an interface section.
 * @param node The module.
 * @returns Its identity, name and kind.
 */
function interfacePart(node: SemanticNode): InterfaceChange["container"] {
	return { id: node.id, name: node.name, kind: node.kind };
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
		container: interfacePart(container),
		holdsParts: { before: was.holdsParts, after: is.holdsParts },
		entryPointsAdded: outside(is.entryPoints, was.children).map(interfacePart),
		entryPointsRemoved: outside(was.entryPoints, is.children).map(interfacePart),
		becameEntryPoints: outside(
			is.entryPoints.filter((node) => was.children.has(node.id)),
			wasEntryIds,
		).map(interfacePart),
		becameHidden: outside(
			was.entryPoints.filter((node) => is.children.has(node.id)),
			isEntryIds,
		).map(interfacePart),
		callersGained: outside(is.callers, idsOf(was.callers)).map(interfacePart),
		callersLost: outside(was.callers, idsOf(is.callers)).map(interfacePart),
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

/**
 * One module on one reading, measured.
 * @param content The reading's whole content.
 * @param id The module's id.
 * @returns Its counts there, or the fact that it holds no parts there.
 */
function measuredOn(content: VariantContent, id: string): MeasuredContainer["byState"][number] {
	const node = content.nodes.find((one) => one.id === id);
	const inspection = node === undefined ? undefined : inspectContainer(content, node);
	if (inspection?.holdsParts !== true) return { holdsParts: false };
	return {
		holdsParts: true,
		measures: interfaceMeasures(inspection),
		entryPoints: inspection.entryPoints.map((entry) => interfacePart(entry.node)),
		passThrough: inspection.passThrough.map(interfacePart),
	};
}

/**
 * The interface measures of every container on every reading, side by side.
 *
 * A container is a module that has parts on any of them, by identity, named as
 * the first reading that has it names it. Each row lists the readings in the
 * order given. It sets no comparison status.
 * @param readings The whole content of each reading.
 * @returns One row for each container.
 */
function measureInterfaces(readings: readonly VariantContent[]): MeasuredContainer[] {
	const containers = new Map<string, SemanticNode>();
	for (const node of readings.flatMap(containersOf)) {
		if (!containers.has(node.id)) containers.set(node.id, node);
	}
	return [...containers.values()].map((container) => ({
		container: interfacePart(container),
		byState: readings.map((content) => measuredOn(content, container.id)),
	}));
}

export { type InterfaceChange, compareInterfaces, measureInterfaces };
