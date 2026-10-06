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

import type {
	SemanticEdge,
	SemanticNode,
	VariantContent,
} from "@/shared/semantic-board/lib/content";

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
}

/** What one node is as a container: an interface, or the fact that it has no parts. */
type ContainerInspection = ContainerInterface | PartlessNode;

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
 * Whether a part that sends one relationship passes the same call on: it is a
 * leaf, and everything it receives, from anywhere, is of the kind it sends.
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

/** A relationship that enters or leaves one container. */
interface Crossing {
	readonly edge: SemanticEdge;
	/** Whether it leaves the container, and otherwise enters it. */
	readonly leaves: boolean;
	/**
	 * The child of the container that holds its end inside, or null when it
	 * leaves or ends on the container itself.
	 */
	readonly child: string | null;
}

/**
 * Whether one relationship enters or leaves a container, and which child it reaches.
 * @param nodes Every node of the variant, by id.
 * @param id The container's id.
 * @param edge The relationship.
 * @returns The crossing, or null when both ends are inside or neither is.
 */
function crossingOf(
	nodes: ReadonlyMap<string, SemanticNode>,
	id: string,
	edge: SemanticEdge,
): Crossing | null {
	const fromInside = lineage(nodes, edge.from).includes(id);
	const toChain = lineage(nodes, edge.to);
	const toAt = toChain.indexOf(id);
	if (fromInside === toAt >= 0) {
		return null;
	}
	return { edge, leaves: fromInside, child: toAt > 0 ? (toChain[toAt - 1] ?? null) : null };
}

/**
 * The relationships that enter one container, with the child of the container
 * that each one reaches, and the relationships that leave it.
 * @param content The variant's whole content.
 * @param id The container's id.
 * @returns The entering relationships (the child is null when one ends on the
 *   container itself) and the leaving ones.
 */
function crossings(
	content: VariantContent,
	id: string,
): { readonly entering: readonly Crossing[]; readonly outgoing: readonly SemanticEdge[] } {
	const nodes = new Map(content.nodes.map((node) => [node.id, node]));
	const found = content.edges.flatMap((edge) => {
		const crossing = crossingOf(nodes, id, edge);
		return crossing === null ? [] : [crossing];
	});
	return {
		entering: found.filter((crossing) => !crossing.leaves),
		outgoing: found.filter((crossing) => crossing.leaves).map((crossing) => crossing.edge),
	};
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
	const { entering, outgoing } = crossings(content, id);
	const reaching = new Set(entering.flatMap(({ child }) => (child === null ? [] : [child])));
	const entryPoints = children
		.filter((child) => reaching.has(child.id))
		.map((node) => ({
			node,
			reachedBy: entering.filter(({ child }) => child === node.id).map(({ edge }) => edge),
		}));
	const callers = content.nodes.flatMap((node) => {
		const sent = entering.filter(({ edge }) => edge.from === node.id);
		const touched = new Set(sent.flatMap(({ child }) => (child === null ? [] : [child])));
		return sent.length === 0
			? []
			: [
					{
						node,
						edges: sent.map(({ edge }) => edge),
						reaches: entryPoints
							.filter(({ node: entry }) => touched.has(entry.id))
							.map((entry) => entry.node.id),
					},
				];
	});
	const parents = new Set(content.nodes.map((node) => node.parent));
	return {
		container,
		holdsParts: true,
		entryPoints,
		hiddenParts: children.filter((child) => !reaching.has(child.id)),
		callers,
		outgoing,
		onContainer: entering.filter(({ child }) => child === null).map(({ edge }) => edge),
		passThrough: entryPoints
			.map((entry) => entry.node)
			.filter((node) => !parents.has(node.id) && passesThrough(node, content.edges)),
	};
}

/**
 * The five interface measures of a container (ADR 0044). They are counts,
 * never combined into one number and never a verdict.
 * @param inspection A container with an interface.
 * @returns The counts.
 */
function interfaceMeasures(inspection: ContainerInterface): InterfaceMeasures {
	return {
		entryPoints: inspection.entryPoints.length,
		hiddenParts: inspection.hiddenParts.length,
		callers: inspection.callers.length,
		outgoing: inspection.outgoing.length,
		passThrough: inspection.passThrough.length,
	};
}

export {
	type Caller,
	type ContainerInspection,
	type ContainerInterface,
	type EntryPoint,
	type InterfaceMeasures,
	inspectContainer,
	interfaceMeasures,
};
