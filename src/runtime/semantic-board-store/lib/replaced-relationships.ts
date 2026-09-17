// A relationship removed and stated again, no more than one authored property
// apart, is the identity break the continuation rule exists to prevent: one
// changed property keeps the id, and an agent that removed the relationship to
// add it again has minted a new identity for the same unit — including when
// what changed is the part it lands on, because the part it was on went away
// in the same batch. The break also spans two writes: a
// restatement without the id lands beside the original, and a later write
// removes the original. The write lands (the board is valid), and the answer
// says what happened at each step, so the rule teaches itself.

import { effectiveTraffic, type SemanticEdge } from "@/shared/semantic-board/index";

/** A notice a write answers with, before the write boundary names the file. */
interface WriteNotice {
	readonly code: "RELATIONSHIP_REPLACED" | "RELATIONSHIP_DUPLICATED";
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
 * Whether the relationship stated in place of one the same batch took off is
 * the same one continuing, counted the way the continuation rule counts: the
 * ends and the kind are authored properties like the rest, and one difference
 * among all seven keeps the id.
 *
 * This is wider than `sameUnit` on purpose, and only here. When both
 * relationships stand on the board, two calls between different parts under
 * one label are ordinary and saying so would be noise. When one was taken off
 * and its near-twin put up in the same breath — which is what removing a part,
 * adding its replacement and drawing the relationship afresh comes to — the
 * identity was lost, and nothing else notices.
 * @param was The relationship the batch took off.
 * @param now The relationship the batch put up.
 * @returns True when the second should have kept the first's id.
 */
function continues(was: SemanticEdge, now: SemanticEdge): boolean {
	const before = [was.from, was.to, was.kind, ...authoredProperties(was)];
	const after = [now.from, now.to, now.kind, ...authoredProperties(now)];
	return after.filter((value, index) => value !== before[index]).length <= 1;
}

/**
 * Whether two relationships that both stand on the board say one thing. Two
 * calls between the same parts are legitimate when they carry different
 * messages, so a restatement also shares the label.
 * @param one A relationship.
 * @param other Another relationship.
 * @returns True when the second restates the first.
 */
function restates(one: SemanticEdge, other: SemanticEdge): boolean {
	return (one.label ?? "") === (other.label ?? "") && sameUnit(one, other);
}

/**
 * A relationship as a notice names it.
 * @param edge The relationship.
 * @returns Its id, ends and kind.
 */
function named(edge: SemanticEdge): string {
	return `${edge.id} (${edge.from} -> ${edge.to}, ${edge.kind})`;
}

/**
 * Relationships the batch removed and stated again in the same batch.
 * @param gone The relationships the batch removed.
 * @param added The relationships the batch added.
 * @returns One notice per re-added relationship.
 */
function reAddedInBatch(
	gone: readonly SemanticEdge[],
	added: readonly SemanticEdge[],
): WriteNotice[] {
	return gone.flatMap((edge) => {
		const twin = added.find((candidate) => continues(edge, candidate));
		if (twin === undefined) return [];
		return [
			{
				code: "RELATIONSHIP_REPLACED" as const,
				path: `edges.${twin.id}`,
				message: `relationship ${named(edge)} was removed and stated again as ${twin.id} with at most one property changed; a continuing relationship keeps its id, so restate it with "id": "${edge.id}" instead of removing it`,
			},
		];
	});
}

/**
 * Relationships the batch added beside one they restate, which still stands.
 * @param added The relationships the batch added.
 * @param kept The relationships that were there before and still are.
 * @returns One notice per copy.
 */
function duplicatedBeside(
	added: readonly SemanticEdge[],
	kept: readonly SemanticEdge[],
): WriteNotice[] {
	return added.flatMap((edge) => {
		const original = kept.find((candidate) => restates(candidate, edge));
		if (original === undefined) return [];
		return [
			{
				code: "RELATIONSHIP_DUPLICATED" as const,
				path: `edges.${edge.id}`,
				message: `relationship ${edge.id} states ${named(original)} again beside it under a new id; to change the existing relationship, restate it with "id": "${original.id}", and do not remove ${original.id} afterwards, since that keeps the copy and loses the identity`,
			},
		];
	});
}

/**
 * Relationships the batch removed while a restatement an earlier write added still stands.
 * @param gone The relationships the batch removed.
 * @param kept The relationships that were there before and still are.
 * @returns One notice per original removed in favour of its copy.
 */
function removedForCopy(
	gone: readonly SemanticEdge[],
	kept: readonly SemanticEdge[],
): WriteNotice[] {
	return gone.flatMap((edge) => {
		const copy = kept.find((candidate) => restates(edge, candidate));
		if (copy === undefined) return [];
		return [
			{
				code: "RELATIONSHIP_REPLACED" as const,
				path: `edges.${copy.id}`,
				message: `relationship ${named(edge)} was removed while ${copy.id}, stated earlier with the same ends, kind and label, still stands, so the relationship continues under a new id; to keep its identity, remove ${copy.id} and restate ${edge.id} with its properties instead`,
			},
		];
	});
}

/**
 * Every relationship a batch stated again under a new id: removed and re-added
 * in the batch, added beside the relationship it restates, or removed while a
 * restatement of it an earlier write added still stands.
 * @param before The relationships as they stood.
 * @param removed The ids the batch removed.
 * @param after The relationships after the batch.
 * @returns One notice per restated relationship.
 */
function replacedRelationships(
	before: readonly SemanticEdge[],
	removed: ReadonlySet<string>,
	after: readonly SemanticEdge[],
): WriteNotice[] {
	const known = new Set(before.map((edge) => edge.id));
	const added = after.filter((edge) => !known.has(edge.id));
	const kept = after.filter((edge) => known.has(edge.id));
	const gone = before.filter((edge) => removed.has(edge.id));
	return [
		...reAddedInBatch(gone, added),
		...duplicatedBeside(added, kept),
		...removedForCopy(gone, kept),
	];
}

export { replacedRelationships, type WriteNotice };
