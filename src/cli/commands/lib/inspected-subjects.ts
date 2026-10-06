// How `semantic inspect` names a node or a relationship in its answer, for a
// group and for a container alike: enough to find the subject on the board.

import { z } from "zod";
import type { SemanticEdge, SemanticNode } from "@/shared/semantic-board/index";

/** One node as the inspection names it: enough to find it on the board. */
const InspectedNodeSchema = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.string(),
	parent: z.string().nullable(),
	groups: z.array(z.string()),
});

/** One relationship as the inspection names it. */
const InspectedEdgeSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	kind: z.string(),
	label: z.string().nullable(),
});

/**
 * One node, as the answer carries it.
 * @param node The node.
 * @returns Its identity, kind, container and memberships.
 */
function inspectedNode(node: SemanticNode): z.infer<typeof InspectedNodeSchema> {
	return {
		id: node.id,
		name: node.name,
		kind: node.kind,
		parent: node.parent ?? null,
		groups: node.groups ?? [],
	};
}

/**
 * One relationship, as the answer carries it.
 * @param edge The relationship.
 * @returns Its identity, ends, kind and label.
 */
function inspectedEdge(edge: SemanticEdge): z.infer<typeof InspectedEdgeSchema> {
	return { id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label ?? null };
}

export { InspectedNodeSchema, InspectedEdgeSchema, inspectedNode, inspectedEdge };
