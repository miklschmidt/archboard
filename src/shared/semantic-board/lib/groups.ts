// What one group is, read off one variant: who is in it, how they reach each
// other, and where the group's edge is.
//
// Nothing here is authored and nothing is drawn. A node says which groups it
// belongs to; everything below is derived from those memberships and the
// relationships the variant already states, every time it is asked, over the
// whole variant before any view narrows it (ADR 0023). A view that hides a
// member is a narrower picture, not a smaller group, so the viewer says a
// hidden member is hidden rather than leaving it out.
//
// Membership is explicit and only explicit. A container is not in a group
// because something inside it is, and the group's boundary is drawn around its
// members, not around whatever contains them: a service holding one grouped
// module out of six is context for the reader, and is reported as such.
//
// Where a card is placed is read off the same memberships (ADR 0038): a card
// goes with the first group, in configuration order, that it shares with a
// sibling, because a region of one card gathers nothing.

import type {
	SemanticEdge,
	SemanticNode,
	VariantContent,
} from "@/shared/semantic-board/lib/content";
import { normalizeGroupIds } from "@/shared/semantic-board/lib/primitives";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";

/** Which way a relationship crosses the group's boundary. */
type BoundaryDirection = "incoming" | "outgoing";

/** One relationship between a member and something outside the group. */
interface BoundaryEdge {
	/** The relationship, exactly as the variant states it. */
	readonly edge: SemanticEdge;
	/** Whether it reaches into the group or leaves it. */
	readonly direction: BoundaryDirection;
	/** The member at the group's end of it. */
	readonly member: string;
	/** The node at the other end, which is not a member. */
	readonly neighbor: string;
}

/** Everything one group is, on one variant. */
interface GroupInspection {
	/** The group's id, as the board and the vault configuration spell it. */
	readonly group: string;
	/** The explicit members, in document order. */
	readonly members: readonly SemanticNode[];
	/** Relationships with a member at both ends, in document order. */
	readonly internalEdges: readonly SemanticEdge[];
	/** Relationships with a member at exactly one end, in document order. */
	readonly boundaryEdges: readonly BoundaryEdge[];
	/**
	 * Every non-member at the far end of a boundary relationship, once each, in
	 * document order. Immediate only: what a member reaches or is reached by,
	 * and not what those reach in turn.
	 */
	readonly neighbors: readonly SemanticNode[];
}

/**
 * Whether one node says it is in one group.
 * @param node The node.
 * @param group The group's id.
 * @returns True when the node lists it.
 */
function isMemberOf(node: SemanticNode, group: string): boolean {
	return node.groups?.includes(group) ?? false;
}

/**
 * Every group id any node of the variant says it is in, once each, in the
 * canonical order. Ids the configuration no longer defines are included,
 * because the board still says them and a reader still has to be able to ask.
 * @param content The variant's whole content.
 * @returns The ids in use.
 */
function groupsUsed(content: VariantContent): string[] {
	return normalizeGroupIds(content.nodes.flatMap((node) => node.groups ?? []));
}

/**
 * The direction of one boundary relationship, seen from the group.
 * @param edge The relationship.
 * @param members The group's members, by id.
 * @returns The boundary edge, or null when both ends or neither end is a member.
 */
function boundaryOf(edge: SemanticEdge, members: ReadonlySet<string>): BoundaryEdge | null {
	const fromInside = members.has(edge.from);
	const toInside = members.has(edge.to);
	if (fromInside === toInside) {
		return null;
	}
	return fromInside
		? { edge, direction: "outgoing", member: edge.from, neighbor: edge.to }
		: { edge, direction: "incoming", member: edge.to, neighbor: edge.from };
}

/**
 * What one group is, on one variant.
 *
 * A group nothing belongs to comes back empty rather than as a failure: a
 * configured group that nobody has joined yet is a real thing the vault says,
 * and the caller decides what to say about it. Whether the id is configured at
 * all is not a question this content can answer, so it is not asked here.
 * @param content The variant's whole content, before any view narrows it.
 * @param group The group's id.
 * @returns Its members, its internal and boundary relationships, and its neighbors.
 */
function inspectGroup(content: VariantContent, group: string): GroupInspection {
	const members = content.nodes.filter((node) => isMemberOf(node, group));
	const inside = new Set(members.map((node) => node.id));
	const internalEdges = content.edges.filter(
		(edge) => inside.has(edge.from) && inside.has(edge.to),
	);
	const boundaryEdges = content.edges.flatMap((edge) => {
		const boundary = boundaryOf(edge, inside);
		return boundary === null ? [] : [boundary];
	});
	const touched = new Set(boundaryEdges.map((boundary) => boundary.neighbor));
	const neighbors = content.nodes.filter((node) => touched.has(node.id));
	return { group, members, internalEdges, boundaryEdges, neighbors };
}

/**
 * The group each node is placed with among the nodes given (ADR 0038).
 *
 * A node's placing group is the first group, in the order `policy.groups`
 * lists them, that it shares with at least one other given node of the same
 * parent; nodes without a parent are siblings at the board level. A node
 * sharing no configured group with a sibling has no placing group, and an id
 * the configuration does not define never places. Pass the nodes a view
 * draws: a member the view hides does not hold a region open.
 * @param nodes The nodes drawn together.
 * @param policy The vault policy whose group order decides.
 * @returns Each placed node's id with its placing group's id.
 */
function placingGroups(
	nodes: readonly SemanticNode[],
	policy: Pick<SemanticPolicy, "groups">,
): Map<string, string> {
	const configured = Object.keys(policy.groups);
	const placed = new Map<string, string>();
	for (const node of nodes) {
		const group = configured.find(
			(id) =>
				isMemberOf(node, id) &&
				nodes.some(
					(other) => other.id !== node.id && other.parent === node.parent && isMemberOf(other, id),
				),
		);
		if (group !== undefined) placed.set(node.id, group);
	}
	return placed;
}

export {
	type BoundaryDirection,
	type BoundaryEdge,
	type GroupInspection,
	groupsUsed,
	inspectGroup,
	isMemberOf,
	placingGroups,
};
