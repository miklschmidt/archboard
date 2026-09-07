// What the comparison has to say about itself.
//
// Without these an empty diff would be indistinguishable from two identical
// boards, and "nothing changed" is the most damaging thing to say wrongly.

import type { CompareSideInput } from "@/runtime/engine/lib/compare-contract";
import type { BoardModel } from "@/runtime/engine/lib/compare-board-model";
import { MAX_RELATION_PAIRS } from "@/runtime/engine/lib/compare-diff";

/**
 * The node names both boards use despite their ids differing, which is almost
 * always the same architectural unit promoted twice.
 * @param A One board.
 * @param B The other.
 * @returns The shared names.
 */
function overlappingNames(A: BoardModel, B: BoardModel): string[] {
	const theirNames = new Set([...B.nodes.values()].map((n) => n.name));
	return [...new Set([...A.nodes.values()].map((n) => n.name))].filter((name) =>
		theirNames.has(name),
	);
}

/**
 * What to say when the two boards share no node ids.
 * @param A One board.
 * @param B The other.
 * @returns The warnings.
 */
function unjoinedWarnings(A: BoardModel, B: BoardModel): string[] {
	const warnings = [
		"The two boards share no node ids, so nothing could be joined and every node reads as added or removed. " +
			"The boards were promoted independently: re-promote with matching `--node` ids (or promote the " +
			"proposal from a copy of the current board) to make them comparable.",
	];
	const overlap = overlappingNames(A, B);
	if (overlap.length > 0) {
		warnings.push(
			`${overlap.length} node name(s) do appear on both boards despite the ids differing — ` +
				`${overlap.slice(0, 12).join(", ")}${overlap.length > 12 ? ", …" : ""}. Same label, different node ` +
				"id: almost certainly the same architectural unit promoted twice.",
		);
	}
	return warnings;
}

/**
 * What the comparison has to say about the join it managed.
 * @param A One board.
 * @param B The other.
 * @param from The board being compared from, for its key.
 * @param to The board being compared to, for its key.
 * @param shared How many nodes the join joined.
 * @param comparable Whether there was an architecture to compare at all.
 * @returns The warnings.
 */
function joinWarnings(
	A: BoardModel,
	B: BoardModel,
	from: CompareSideInput,
	to: CompareSideInput,
	shared: number,
	comparable: boolean,
): string[] {
	const empty = emptySide(A, B, from, to);
	if (empty === "both") {
		return comparable ? [] : [NOTHING_PROMOTED];
	}
	if (empty !== null) {
		return [
			`"${empty}" has no promoted nodes at all, so every node on the other board reads as added or removed. ` +
				"That is an artefact of nothing having been promoted, not a statement about the architecture.",
		];
	}
	return shared === 0 ? unjoinedWarnings(A, B) : [];
}

const NOTHING_PROMOTED =
	"Neither board has a single promoted node, so there is nothing to compare on and the empty node and " +
	'edge sections below mean "could not be compared", not "unchanged" — summary.comparable is false. ' +
	"Everything that is known is in the plain-element inventory. Promote the boxes on both boards " +
	"(`promote --kind ...`) to give them the node ids this diff joins on.";

/**
 * Which side has no promoted nodes at all.
 * @param A One board.
 * @param B The other.
 * @param from The board being compared from, for its key.
 * @param to The board being compared to, for its key.
 * @returns The empty board's key, "both", or null when both have nodes.
 */
function emptySide(
	A: BoardModel,
	B: BoardModel,
	from: CompareSideInput,
	to: CompareSideInput,
): string | null {
	if (A.nodes.size === 0 && B.nodes.size === 0) {
		return "both";
	}
	if (A.nodes.size === 0) {
		return from.key;
	}
	return B.nodes.size === 0 ? to.key : null;
}

/**
 * What to say when the pairwise relation pass was past its budget.
 * @param pairCount How many related pairs there were.
 * @returns The warning.
 */
function relationBudgetWarning(pairCount: number): string {
	return (
		`${pairCount} related node pairs is past the ${MAX_RELATION_PAIRS}-pair budget for the ` +
		"relative-direction pass, so relation changes were not computed. Every other layout signal " +
		"(cluster, container, group, region, prominence) is complete."
	);
}

/**
 * What to say when the two boards frame their shared nodes differently enough
 * that region names are not directly comparable.
 * @returns The warning.
 */
function divergentFrameWarning(): string {
	return (
		"The two boards frame the nodes they share differently enough (aspect ratio differs by more than half " +
		'again) that region names are not directly comparable — "top-left" on one is not the same physical ' +
		"place as on the other. Read cluster, container and relation changes instead; region changes here may " +
		"be an artefact of the frame rather than anything anyone moved."
	);
}

export { divergentFrameWarning, joinWarnings, relationBudgetWarning };
