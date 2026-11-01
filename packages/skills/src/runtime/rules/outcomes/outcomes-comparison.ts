import type { EvaluationArchitecture as SemanticBoard } from "#runtime/rules/outcomes/reading.ts";
// The comparison of a proposal against the variant its picture is drawn
// against and `semantic compare` reads it against by default — the board's
// current one, or on a board with none its direct predecessor — as a check
// reads it: over every kind of subject together, and over the nodes alone.
// A scenario that replaces a node also replaces the relationships that touched
// it, so "two nodes removed" and "four subjects removed" describe the same
// proposal, and a check may state either.

import { comparedWith, compareVariants } from "@archboard/board/comparison";
import type { SemanticVariant } from "@archboard/board/document";
import {
	finding,
	located,
	isFinding,
	type Finding,
	type Reading,
} from "#runtime/rules/outcomes/reading.ts";
import type { OutcomeCheck } from "#runtime/schemas/suite.ts";

type Check = (check: OutcomeCheck, reading: Reading) => Finding;

/** How many subjects a comparison removed and added. */
interface ChangeCounts {
	readonly removed: number;
	readonly added: number;
}

/**
 * Removed and added counts over one collection of changes.
 * @param changes The changes, by subject.
 * @returns The counts.
 */
function countChanges(changes: ReadonlyMap<string, { readonly kind: string }>): ChangeCounts {
	const kinds = [...changes.values()].map((change) => change.kind);
	return {
		removed: kinds.filter((kind) => kind === "removed").length,
		added: kinds.filter((kind) => kind === "added").length,
	};
}

/**
 * The comparison of a variant against the one it is read against: over every kind
 * of subject together, and over the nodes alone. A scenario that replaces a
 * node also replaces the relationships that touched it, so "two nodes
 * removed" and "four subjects removed" describe the same proposal.
 * @param board The board.
 * @param variant The variant.
 * @returns The counts, or undefined when there is nothing to read it against.
 */
function standingCounts(
	board: SemanticBoard,
	variant: SemanticVariant,
):
	| { readonly against: string; readonly all: ChangeCounts; readonly nodes: ChangeCounts }
	| undefined {
	const against = comparedWith(board, variant);
	if (against === undefined) return undefined;
	const comparison = compareVariants(against.content, variant.content);
	const nodes = countChanges(comparison.nodes);
	const rest = [
		comparison.edges,
		comparison.flows,
		comparison.steps,
		comparison.walkthroughs,
		comparison.beats,
	].map(countChanges);
	return {
		against: against.name,
		nodes,
		all: {
			removed: nodes.removed + rest.reduce((sum, counts) => sum + counts.removed, 0),
			added: nodes.added + rest.reduce((sum, counts) => sum + counts.added, 0),
		},
	};
}

/**
 * Whether a proposal reads as the stated removals and additions against the
 * variant it is read against: `removed`/`addedAtLeast` count every kind of subject,
 * `removedNodes`/`addedNodesAtLeast` the nodes alone.
 * @param check The board, variant and counts.
 * @param reading The reading.
 * @returns The finding.
 */
const comparisonStanding: Check = (check, reading) => {
	const at = located(reading, check.board, check.variant);
	if (isFinding(at)) return at;
	const counts = standingCounts(at.board, at.variant);
	if (counts === undefined)
		return finding(false, `"${check.variant}" has nothing to be read against`);
	return finding(
		countsHold(counts.all, check.removed, check.addedAtLeast) &&
			countsHold(counts.nodes, check.removedNodes, check.addedNodesAtLeast),
		`${counts.nodes.removed} nodes removed, ${counts.nodes.added} added (${counts.all.removed} subjects removed, ${counts.all.added} added) against "${counts.against}"`,
	);
};

/**
 * Whether counts match what a check states: the exact removals when it
 * states them, and at least the additions it asks for.
 * @param counts The counts found.
 * @param removed The exact removals wanted, if stated.
 * @param addedAtLeast The least additions wanted, if stated.
 * @returns True when both hold.
 */
function countsHold(
	counts: ChangeCounts,
	removed: number | undefined,
	addedAtLeast: number | undefined,
): boolean {
	return (
		(removed === undefined || counts.removed === removed) && counts.added >= (addedAtLeast ?? 0)
	);
}

export { comparisonStanding };
