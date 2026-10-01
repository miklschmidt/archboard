// What one part is connected to: the other end of every relationship that
// crosses its edge, said as what it sends to and what it receives from.
//
// A container's relationships are the ones that cross its edge, so the parts
// inside it are not its neighbours: it stands for everything it holds.

import type { SemanticEdge, SemanticNode, VariantContent } from "@/shared/semantic-board/index";

/** One relationship, seen from the part it is asked about. */
interface Link {
	/** The relationship. */
	readonly edge: SemanticEdge;
	/** The part at its other end, when the variant still holds it. */
	readonly other: SemanticNode | undefined;
}

/** What a part sends to and what it receives from. */
interface Connections {
	readonly sends: readonly Link[];
	readonly receives: readonly Link[];
}

/**
 * A part and every part nested inside it. A part that holds nothing is its own subtree.
 * @param nodes Every part of the variant.
 * @param id The part.
 * @returns The ids.
 */
function subtreeOf(nodes: readonly SemanticNode[], id: string): ReadonlySet<string> {
	const inside = new Set([id]);
	const open = [id];
	while (open.length > 0) {
		const here = open.pop();
		for (const node of nodes) {
			if (node.parent === here && !inside.has(node.id)) {
				inside.add(node.id);
				open.push(node.id);
			}
		}
	}
	return inside;
}

/**
 * What a part sends to and receives from.
 * @param content What the variant says.
 * @param id The part.
 * @returns Both lists, in the order the variant states the relationships.
 */
function connectionsOf(content: VariantContent, id: string): Connections {
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	const inside = subtreeOf(content.nodes, id);
	const sends = content.edges
		.filter((edge) => inside.has(edge.from) && !inside.has(edge.to))
		.map((edge) => ({ edge, other: byId.get(edge.to) }));
	const receives = content.edges
		.filter((edge) => inside.has(edge.to) && !inside.has(edge.from))
		.map((edge) => ({ edge, other: byId.get(edge.from) }));
	return { sends, receives };
}

export { connectionsOf, type Connections, type Link };
