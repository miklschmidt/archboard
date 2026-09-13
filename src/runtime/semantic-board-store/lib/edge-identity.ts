import {
	SemanticEdgeSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";

// Identity counts every authored property, including presentation emphasis.
// Derive the fields from the schema so adding an edge property cannot silently
// leave it outside the rule. Defaults and endpoint references are resolved first.
const AUTHORED_FIELDS = SemanticEdgeSchema.omit({ id: true }).keyof().options;

/**
 * Refuse replacements disguised as continuing connections in the completed family.
 * Comparing with the direct predecessor, rather than the last write, also catches
 * two changes submitted in separate edits. Roots and genuinely new edges have no
 * inherited identity to check. Reading remains possible so authors can repair a
 * board that predates this rule.
 * @param board The normalized candidate, after the whole transition.
 * @returns An actionable refusal, or null when all inherited edges retain identity.
 */
function edgeIdentityRefusal(board: SemanticBoard): SemanticRefusal | null {
	const variants = new Map(board.variants.map((variant) => [variant.id, variant]));
	for (const variant of board.variants) {
		const predecessor = variant.parent === undefined ? undefined : variants.get(variant.parent);
		if (predecessor === undefined) continue;
		const refusal = variantEdgeIdentityRefusal(variant, predecessor);
		if (refusal !== null) return refusal;
	}
	return null;
}

/**
 * Check the connections inherited by one variant.
 * @param variant The state being compared.
 * @param predecessor Its direct predecessor in the candidate family.
 * @returns The first identity misuse, or null.
 */
function variantEdgeIdentityRefusal(
	variant: SemanticVariant,
	predecessor: SemanticVariant,
): SemanticRefusal | null {
	const inherited = new Map(predecessor.content.edges.map((edge) => [edge.id, edge]));
	for (const edge of variant.content.edges) {
		const before = inherited.get(edge.id);
		if (before === undefined) continue;
		const changed = AUTHORED_FIELDS.filter((field) => before[field] !== edge[field]);
		if (changed.length < 2) continue;
		return refuse(
			"EDGE_IDENTITY_REUSED",
			`Connection "${edge.id}" in variant "${variant.name}" changes ${changed.join(", ")} ` +
				`relative to its direct predecessor "${predecessor.name}". Two or more changed ` +
				`properties require a new connection. Put "${edge.id}" in removeEdges and add ` +
				`the replacement without an ID in the same edit of "${variant.name}". Nothing was written.`,
		);
	}
	return null;
}

export { edgeIdentityRefusal };
