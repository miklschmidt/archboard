// The parts a proposal names (ADR 0045).
//
// A proposal names each part whose comparison status is added, changed or
// removed. It also names each part at either end of a relationship or a step
// with one of those statuses: a new relationship changes the code at its ends,
// although the comparison does not badge them (ADR 0023). Both ends count,
// because the direction of a relationship does not say which end's code
// changes, and relationship kinds belong to the vault (ADR 0024). Each part
// carries every reason it is named, so a reader can tell a part the proposal
// changed from a part at the far end of a new relationship.

import type { NamedReason } from "#shared/protocol/footprint.ts";
import { isMessage } from "@archboard/board/flow";
import type { compareVariants } from "@archboard/board/comparison";

type VariantComparison = ReturnType<typeof compareVariants>;

/** Every reason a part is named, by the part's id. */
type Named = Map<string, NamedReason[]>;

/** What a part is called, by id. */
type NameOf = (id: string) => string;

/**
 * Give each of some parts one more reason to be named.
 * @param named What is named so far; grows in place.
 * @param parts The ids of the parts, each once.
 * @param reason Why they are named.
 */
function nameParts(named: Named, parts: Iterable<string>, reason: NamedReason): void {
	for (const part of parts) named.set(part, [...(named.get(part) ?? []), reason]);
}

/**
 * Name the parts the comparison marks.
 * @param named What is named so far; grows in place.
 * @param comparison The proposal against the variant it is read against.
 */
function nameMarkedParts(named: Named, comparison: VariantComparison): void {
	for (const [id, change] of comparison.nodes) {
		if (change.kind !== "unchanged") nameParts(named, [id], { by: "part", status: change.kind });
	}
}

/**
 * Name the parts at both ends of each relationship the comparison marks.
 * @param named What is named so far; grows in place.
 * @param comparison The proposal against the variant it is read against.
 * @param nameOf What a part is called.
 */
function nameRelationshipEnds(named: Named, comparison: VariantComparison, nameOf: NameOf): void {
	for (const [id, change] of comparison.edges) {
		if (change.kind === "unchanged") continue;
		const { from, to } = change.entity;
		nameParts(named, new Set([from, to]), {
			by: "relationship",
			status: change.kind,
			relationship: id,
			from: { id: from, name: nameOf(from) },
			to: { id: to, name: nameOf(to) },
		});
	}
}

/**
 * Name the parts at both ends of each step the comparison marks.
 * @param named What is named so far; grows in place.
 * @param comparison The proposal against the variant it is read against.
 * @param nameOf What a part is called.
 */
function nameStepEnds(named: Named, comparison: VariantComparison, nameOf: NameOf): void {
	for (const [id, change] of comparison.steps) {
		// A decision or loop joins no parts: the messages it holds name their own ends.
		if (change.kind === "unchanged" || !isMessage(change.entity)) continue;
		const { from, to, flow } = change.entity;
		nameParts(named, new Set([from, to]), {
			by: "step",
			status: change.kind,
			step: id,
			flow,
			from: { id: from, name: nameOf(from) },
			to: { id: to, name: nameOf(to) },
		});
	}
}

/**
 * Why a proposal names each part.
 * @param comparison The proposal against the variant it is read against.
 * @param nameOf What a part is called, by id.
 * @returns For each named part, its reasons: the part itself, then its relationships, then its steps.
 */
function namedParts(comparison: VariantComparison, nameOf: NameOf): Named {
	const named: Named = new Map();
	nameMarkedParts(named, comparison);
	nameRelationshipEnds(named, comparison, nameOf);
	nameStepEnds(named, comparison, nameOf);
	return named;
}

export { namedParts, type Named };
