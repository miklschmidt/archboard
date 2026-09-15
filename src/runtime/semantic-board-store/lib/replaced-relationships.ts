// A relationship removed and stated again with the same ends and kind is the
// identity break the continuation rule exists to prevent: one changed property
// keeps the id, and an agent that removed the relationship to add it again has
// minted a new identity for the same unit. The write lands (the board is
// valid), and the answer says what happened, so the rule teaches itself.

import { effectiveTraffic, type SemanticEdge } from "@/shared/semantic-board/index";

/** A notice a write answers with, before the write boundary names the file. */
interface WriteNotice {
	readonly code: "RELATIONSHIP_REPLACED";
	readonly path: string;
	readonly message: string;
}

/**
 * The authored properties a continuation may change one of, as comparable text.
 * @param edge The relationship.
 * @returns The four properties.
 */
function authoredProperties(edge: SemanticEdge): readonly string[] {
	const traffic = effectiveTraffic(edge.traffic);
	return [
		edge.label ?? "",
		edge.description ?? "",
		edge.emphasis,
		traffic === undefined ? "" : `${traffic.speed}/${traffic.volume}`,
	];
}

/**
 * Whether two relationships are one unit under the continuation rule: the
 * same ends and kind, and at most one other authored property apart.
 * @param was The relationship as it stood.
 * @param now The relationship stated in its place.
 * @returns True when the second should have kept the first's id.
 */
function sameUnit(was: SemanticEdge, now: SemanticEdge): boolean {
	if (was.from !== now.from || was.to !== now.to || was.kind !== now.kind) return false;
	const before = authoredProperties(was);
	return authoredProperties(now).filter((value, index) => value !== before[index]).length <= 1;
}

/**
 * Every relationship a batch removed and stated again as a new one.
 * @param before The relationships as they stood.
 * @param removed The ids the batch removed.
 * @param after The relationships after the batch.
 * @returns One notice per re-added relationship.
 */
function replacedRelationships(
	before: readonly SemanticEdge[],
	removed: ReadonlySet<string>,
	after: readonly SemanticEdge[],
): WriteNotice[] {
	const known = new Set(before.map((edge) => edge.id));
	const added = after.filter((edge) => !known.has(edge.id));
	return before
		.filter((edge) => removed.has(edge.id))
		.flatMap((edge) => {
			const twin = added.find((candidate) => sameUnit(edge, candidate));
			return twin === undefined
				? []
				: [
						{
							code: "RELATIONSHIP_REPLACED" as const,
							path: `edges.${twin.id}`,
							message: `relationship ${edge.id} (${edge.from} -> ${edge.to}, ${edge.kind}) was removed and stated again as ${twin.id} with at most one property changed; a continuing relationship keeps its id, so restate it with "id": "${edge.id}" instead of removing it`,
						},
					];
		});
}

export { replacedRelationships, type WriteNotice };
