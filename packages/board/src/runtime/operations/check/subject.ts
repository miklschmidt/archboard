// The subject a diagnostic is about, built one way for every producer so a
// node and a relationship are named the same wherever the vault says something
// about them: the semantics check here, and the code check (ADR 0046), which names
// a flow step by its flow, these ends and its label.

import type { SemanticEdge, SemanticNode, VariantContent } from "#shared/schemas/content.ts";
import type { DiagnosticSubject } from "#shared/schemas/semantic-policy.ts";

/**
 * A part as a diagnostic names it.
 * @param node The node.
 * @returns Its id and its name.
 */
function nodeSubject(node: Pick<SemanticNode, "id" | "name">): DiagnosticSubject {
	return { kind: "node", id: node.id, name: node.name };
}

/**
 * How the relationships of one state are named as diagnostic subjects: by the
 * parts at their ends, since a relationship has no name of its own.
 * @param content The state the relationships belong to, which names their ends.
 * @returns The subject of one of its relationships: its id and `From -> To`.
 */
function edgeSubjects(
	content: Pick<VariantContent, "nodes">,
): (edge: Pick<SemanticEdge, "id" | "from" | "to">) => DiagnosticSubject {
	const names = new Map(content.nodes.map((node) => [node.id, node.name]));
	return (edge) => ({
		kind: "edge",
		id: edge.id,
		name: `${names.get(edge.from) ?? edge.from} -> ${names.get(edge.to) ?? edge.to}`,
	});
}

export { nodeSubject, edgeSubjects };
