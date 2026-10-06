// The subject a diagnostic is about, built one way for every producer so a
// node and a relationship are named the same wherever the vault says something
// about them.

import type { SemanticEdge, SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import type { DiagnosticSubject } from "@/shared/semantic-policy/index";

/**
 * A part as a diagnostic names it.
 * @param node The node.
 * @returns Its id and its name.
 */
function nodeSubject(node: Pick<SemanticNode, "id" | "name">): DiagnosticSubject {
	return { kind: "node", id: node.id, name: node.name };
}

/**
 * A relationship as a diagnostic names it: by the parts at its ends, since a
 * relationship has no name of its own.
 * @param edge The relationship.
 * @param content The state it belongs to, which names its ends.
 * @returns Its id and `From -> To`.
 */
function edgeSubject(
	edge: Pick<SemanticEdge, "id" | "from" | "to">,
	content: Pick<VariantContent, "nodes">,
): DiagnosticSubject {
	const names = new Map(content.nodes.map((node) => [node.id, node.name]));
	const from = names.get(edge.from) ?? edge.from;
	const to = names.get(edge.to) ?? edge.to;
	return { kind: "edge", id: edge.id, name: `${from} -> ${to}` };
}

export { nodeSubject, edgeSubject };
