// An edge cascaded off a removed node and stated again without its id may have
// lost its continuing identity. An explicit removeEdges plus an idless addition
// instead declares a replacement, even when its properties resemble the old
// edge. A possible accidental break also spans two writes: a
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
 * Authored properties used to detect a close restatement, as comparable text.
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
 * Whether two relationships are close enough to warrant a duplicate notice:
 * the same ends and kind, and at most one other authored property apart.
 * @param was The relationship as it stood.
 * @param now The relationship stated in its place.
 * @returns True when the second closely restates the first.
 */
function sameUnit(was: SemanticEdge, now: SemanticEdge): boolean {
	if (was.from !== now.from || was.to !== now.to || was.kind !== now.kind) return false;
	const before = authoredProperties(was);
	return authoredProperties(now).filter((value, index) => value !== before[index]).length <= 1;
}

/**
 * Whether the relationship stated in place of an implicitly removed one may
 * be the same one continuing. Ends and kind count like other authored fields.
 *
 * This is wider than `sameUnit` on purpose, and only here. When both
 * relationships stand on the board, two calls between different parts under
 * one label are ordinary and saying so would be noise. When one was taken off
 * and its near-twin put up in the same breath — which is what removing a part,
 * adding its replacement and drawing the relationship afresh comes to — the
 * identity may have been lost, and nothing else notices.
 * @param was The relationship the batch took off.
 * @param now The relationship the batch put up.
 * @returns True when the second may continue the first.
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
 * Explain recovery without promising that a deleted root identity still exists.
 * @param original The removed id.
 * @param copy The replacement id.
 * @returns The available repair and the limit of retained identity evidence.
 */
function repairAdvice(original: string, copy: string): string {
	return (
		`if ${original} remains in this variant's direct predecessor or recorded reconciliation base, ` +
		`remove ${copy} and restate ${original} with its properties in one edit; otherwise the removed ` +
		`identity is no longer available to restore here`
	);
}

/**
 * Relationships the batch removed and stated again in the same batch.
 * @param gone The relationships the batch removed.
 * @param added The relationships the batch added.
 * @param statedRemoved Relationships the batch explicitly removed as replacements.
 * @returns One notice per re-added relationship.
 */
function reAddedInBatch(
	gone: readonly SemanticEdge[],
	added: readonly SemanticEdge[],
	statedRemoved: ReadonlySet<string>,
): WriteNotice[] {
	return gone.flatMap((edge) => {
		if (statedRemoved.has(edge.id)) return [];
		const twin = added.find((candidate) => continues(edge, candidate));
		if (twin === undefined) return [];
		return [
			{
				code: "RELATIONSHIP_REPLACED" as const,
				path: `edges.${twin.id}`,
				message: `relationship ${named(edge)} was removed with its endpoint and stated again as ${twin.id}; if it continues, preserve its id when editing it. ${repairAdvice(edge.id, twin.id)}`,
			},
		];
	});
}

/**
 * Relationships the batch added beside one they restate, which still stands.
 * @param added The relationships the batch added.
 * @param kept The relationships that were there before and still are.
 * @param restored Inherited identities restored by this batch.
 * @returns One notice per copy.
 */
function duplicatedBeside(
	added: readonly SemanticEdge[],
	kept: readonly SemanticEdge[],
	restored: ReadonlySet<string>,
): WriteNotice[] {
	return added.flatMap((edge) => {
		const other = kept.find((candidate) => restates(candidate, edge));
		if (other === undefined) return [];
		const original = restored.has(edge.id) ? edge : other;
		const copy = restored.has(edge.id) ? other : edge;
		return [
			{
				code: "RELATIONSHIP_DUPLICATED" as const,
				path: `edges.${copy.id}`,
				message: `relationship ${copy.id} states ${named(original)} again beside it under a new id; to change the existing relationship, restate it with "id": "${original.id}", and do not remove ${original.id} afterwards, since that keeps the copy and loses the identity`,
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
				message: `relationship ${named(edge)} was removed while ${copy.id}, stated earlier with the same ends, kind and label, still stands; if this was meant to continue the relationship, ${repairAdvice(edge.id, copy.id)}`,
			},
		];
	});
}

/**
 * Possible accidental identity breaks: an implicitly removed relationship
 * re-added in the batch, one added beside a close restatement, or one removed
 * while a close restatement from an earlier write still stands. An explicit
 * removal and idless addition is a replacement and needs no notice.
 * @param before The relationships as they stood.
 * @param removed The ids the batch removed.
 * @param after The relationships after the batch.
 * @param restored Inherited identities this batch may bring back.
 * @param statedRemoved Edge ids explicitly named in removeEdges.
 * @returns One notice per restated relationship.
 */
function replacedRelationships(
	before: readonly SemanticEdge[],
	removed: ReadonlySet<string>,
	after: readonly SemanticEdge[],
	restored: ReadonlySet<string>,
	statedRemoved: ReadonlySet<string>,
): WriteNotice[] {
	const known = new Set(before.map((edge) => edge.id));
	const added = after.filter((edge) => !known.has(edge.id));
	const kept = after.filter((edge) => known.has(edge.id));
	const gone = before.filter((edge) => removed.has(edge.id));
	return [
		...reAddedInBatch(
			gone,
			added.filter((edge) => !restored.has(edge.id)),
			statedRemoved,
		),
		...duplicatedBeside(added, kept, restored),
		...removedForCopy(gone, kept),
	];
}

export { replacedRelationships, type WriteNotice };
