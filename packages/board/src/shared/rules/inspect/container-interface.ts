// What one container's interface is, read off one variant: which of its
// children relationships from outside reach, which they do not, who calls it,
// and where it calls out (ADR 0044).
//
// Nothing here is authored and nothing is stored. A node never says that it is
// an entry point: the relationships a variant states already say who reaches
// what, and an authored list would be a second answer that could only go stale
// (ADR 0031). So the interface is derived every time it is asked, over the
// whole variant before any view narrows it, the way `inspectGroup` and
// `compareVariants` read. A view that hides a caller is a narrower picture, not
// a smaller interface.
//
// Three rules decide the answer, and the ADR holds the reasons:
//
//   The inside of a container is the container and every part below it, at
//   any depth. Everything else is outside, including the container's own
//   parent. A relationship enters every container whose inside holds its end
//   and not its start, and leaves every container whose inside holds its start
//   and not its end.
//
//   An entry point is always a child of the container. A relationship from
//   outside that ends deeper down makes an entry point of the child that holds
//   its end, and the child answers for what is below it. Entry points and
//   hidden parts therefore divide the children between them.
//
//   Every relationship counts, whatever its kind. Flow steps do not: a return
//   is a step, and it would make the part it returns to an entry point. Only
//   the pass-through rule compares two kinds, and only to ask whether they are
//   the same.

import type { SemanticEdge, SemanticNode, VariantContent } from "#shared/schemas/content.ts";

/** A child of a container that a relationship from outside it reaches. */
interface EntryPoint {
	/** The child. */
	readonly node: SemanticNode;
	/**
	 * The relationships from outside the container that end on the child or on
	 * a part inside it, in document order.
	 */
	readonly reachedBy: readonly SemanticEdge[];
}

/** A part outside a container where a relationship into it starts. */
interface Caller {
	/** The part where the relationships start, as the variant states it. */
	readonly node: SemanticNode;
	/** Its relationships into the container, in document order. */
	readonly edges: readonly SemanticEdge[];
	/**
	 * The entry points those relationships reach, in document order. Empty when
	 * every one of them ends on the container itself.
	 */
	readonly reaches: readonly string[];
}

/** A node with no children: it has no interface on the variant. */
interface PartlessNode {
	readonly container: SemanticNode;
	readonly holdsParts: false;
}

/** The interface of a node that has children on the variant. */
interface ContainerInterface {
	readonly container: SemanticNode;
	readonly holdsParts: true;
	/** The children relationships from outside reach, in document order. */
	readonly entryPoints: readonly EntryPoint[];
	/** The children that none reaches, in document order. */
	readonly hiddenParts: readonly SemanticNode[];
	/** Each part outside that sends a relationship in, once, in document order. */
	readonly callers: readonly Caller[];
	/** Relationships that start inside the container and end outside it. */
	readonly outgoing: readonly SemanticEdge[];
	/**
	 * Relationships from outside that end on the container itself. They make a
	 * caller and no entry point, because they name no child.
	 */
	readonly onContainer: readonly SemanticEdge[];
	/** The entry points that only pass one call on, a subset of `entryPoints`. */
	readonly passThrough: readonly SemanticNode[];
	/**
	 * The five interface measures (ADR 0044): the lengths of the five lists
	 * above. They are counts, never combined into one number and never a verdict.
	 */
	readonly measures: InterfaceMeasures;
}

/** What one node is as a container: an interface, or the fact that it has no parts. */
type ContainerInspection = ContainerInterface | PartlessNode;

/** An entry point that only passes one call on, and the container it is on. */
interface PassThrough {
	readonly container: SemanticNode;
	readonly part: SemanticNode;
}

/** The five counts, each of them read off one container on one variant. */
interface InterfaceMeasures {
	readonly entryPoints: number;
	readonly hiddenParts: number;
	readonly callers: number;
	readonly outgoing: number;
	readonly passThrough: number;
}

/**
 * The ids from a node up through its containers to the top, the node first.
 * @param nodes Every node of the variant, by id.
 * @param start The node's id.
 * @returns The chain; it ends early on a container that is not a node.
 */
function lineage(nodes: ReadonlyMap<string, SemanticNode>, start: string): string[] {
	const chain: string[] = [];
	for (
		let at: string | undefined = start;
		at !== undefined && !chain.includes(at);
		at = nodes.get(at)?.parent
	) {
		chain.push(at);
	}
	return chain;
}

/**
 * Whether a part sends exactly one relationship, of the same kind as every
 * relationship it receives from anywhere. Whether it has children is the
 * caller's question.
 * @param node The entry point.
 * @param edges Every relationship of the variant.
 * @returns True when it passes one call on.
 */
function passesThrough(node: SemanticNode, edges: readonly SemanticEdge[]): boolean {
	const sent = edges.filter((edge) => edge.from === node.id);
	const only = sent[0];
	return (
		only !== undefined &&
		sent.length === 1 &&
		edges.every((edge) => edge.to !== node.id || edge.kind === only.kind)
	);
}

/**
 * Which child of one container holds each part inside it.
 *
 * A part below the container maps to the child it sits under, a child to
 * itself, and the container to its own id. A part outside is not in the map.
 * So a relationship enters the container when the map holds its end and not
 * its start, and leaves it when the map holds its start and not its end.
 * @param content The variant's whole content.
 * @param id The container's id.
 * @returns Each inside part's id with the id of the child that holds it.
 */
function holdersIn(content: VariantContent, id: string): ReadonlyMap<string, string> {
	const nodes = new Map(content.nodes.map((node) => [node.id, node]));
	return new Map(
		content.nodes.flatMap((node) => {
			const chain = lineage(nodes, node.id);
			const at = chain.indexOf(id);
			// The chain runs upwards, so the child sits just before the container
			// in it. The container itself has nothing before it.
			return at < 0 ? [] : [[node.id, chain[at - 1] ?? id] as const];
		}),
	);
}

/**
 * What one node's interface is, on one variant.
 *
 * A node with no children comes back as holding no parts, which is not an
 * interface of zero entry points. A container that nothing outside reaches has
 * no entry points and no callers: every child is a hidden part, and the empty
 * callers say that the board draws nobody who uses it.
 * @param content The variant's whole content, before any view narrows it.
 * @param container A node of that variant.
 * @returns Its interface, or the fact that it holds no parts.
 */
function inspectContainer(content: VariantContent, container: SemanticNode): ContainerInspection {
	const id = container.id;
	const children = content.nodes.filter((node) => node.parent === id);
	if (children.length === 0) {
		return { container, holdsParts: false };
	}
	const holders = holdersIn(content, id);
	const entering = content.edges.filter((edge) => !holders.has(edge.from) && holders.has(edge.to));
	const entryPoints = children.flatMap((node) => {
		const reachedBy = entering.filter((edge) => holders.get(edge.to) === node.id);
		return reachedBy.length === 0 ? [] : [{ node, reachedBy }];
	});
	const reached = new Set(entryPoints.map((entry) => entry.node.id));
	const callers = content.nodes.flatMap((node) => {
		const edges = entering.filter((edge) => edge.from === node.id);
		const reaches = [...reached].filter((child) =>
			edges.some((edge) => holders.get(edge.to) === child),
		);
		return edges.length === 0 ? [] : [{ node, edges, reaches }];
	});
	const parents = new Set(content.nodes.map((node) => node.parent));
	const hiddenParts = children.filter((child) => !reached.has(child.id));
	const outgoing = content.edges.filter((edge) => holders.has(edge.from) && !holders.has(edge.to));
	const passThrough = entryPoints
		.map((entry) => entry.node)
		.filter((node) => !parents.has(node.id) && passesThrough(node, content.edges));
	return {
		container,
		holdsParts: true,
		entryPoints,
		hiddenParts,
		callers,
		outgoing,
		onContainer: entering.filter((edge) => edge.to === id),
		passThrough,
		measures: {
			entryPoints: entryPoints.length,
			hiddenParts: hiddenParts.length,
			callers: callers.length,
			outgoing: outgoing.length,
			passThrough: passThrough.length,
		},
	};
}

/**
 * Every pass-through entry point of a variant, each with the container whose
 * interface it is on, in document order. The deletion test asks about these
 * first (ADR 0044): each is a question for the reader, never a fault.
 * @param content The variant's whole content, before any view narrows it.
 * @returns Each pass-through entry point and its container.
 */
function passThroughEntryPoints(content: VariantContent): readonly PassThrough[] {
	return content.nodes.flatMap((container) => {
		const inspection = inspectContainer(content, container);
		return inspection.holdsParts ? inspection.passThrough.map((part) => ({ container, part })) : [];
	});
}

export {
	type Caller,
	type ContainerInspection,
	type ContainerInterface,
	type EntryPoint,
	type InterfaceMeasures,
	type PassThrough,
	inspectContainer,
	passThroughEntryPoints,
};
