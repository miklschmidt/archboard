// What makes a candidate board one the store would write: it is stamped as the
// store stamps every accepted write, it is coherent, and every kind it newly
// introduces is one the vault configures. The store checks it before every
// write, and the evaluation harness checks a fixture with the same function,
// so a fixture that lays is a fixture the store accepts. This only checks; it
// reads and writes no file.

import {
	nextVersion,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type SemanticBoard,
} from "#shared/schemas/board-document.ts";
import { parseSemanticBoard } from "#shared/rules/coherence/parse-board.ts";
import type { SemanticPolicy } from "#shared/schemas/semantic-policy.ts";
import { newVocabularyProblem } from "#runtime/operations/check/vocabulary.ts";
import { refuse } from "#runtime/operations/write/outcome.ts";
import type {
	SemanticTransition,
	TransitionResult,
} from "#runtime/operations/write/transitions.ts";

/**
 * The board a transition produced, stamped as a write stamps it, and whether it may be written.
 * @param before The family before the transition, or null before its creation.
 * @param produced The board the transition produced.
 * @param at The timestamp to stamp it with.
 * @param policy The vault's configured policy, or null when it is unreadable, which checks no vocabulary.
 * @returns The checked board, or why it is refused.
 */
function acceptedBoard(
	before: SemanticBoard | null,
	produced: SemanticBoard,
	at: string,
	policy: SemanticPolicy | null,
): { readonly board: SemanticBoard } | { readonly problem: string } {
	const parsed = parseSemanticBoard({
		...produced,
		// Every accepted write stamps the contract it was written under. A board
		// created before a field existed and then written to now holds what this
		// build can say, and saying so is the whole purpose of the field: a reader
		// that finds an older version knows what it may not expect to find.
		// Nothing migrates a file nobody wrote to — reading is unchanged.
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		version: nextVersion(before),
		updatedAt: at,
	});
	if (!parsed.ok) return { problem: parsed.problem };
	const unconfigured = policy === null ? null : newVocabularyProblem(parsed.board, before, policy);
	return unconfigured === null ? { board: parsed.board } : { problem: unconfigured };
}

/**
 * Apply a transition to a board held in memory and admit what it produced, as
 * the store's write does before it writes: for a caller with no vault on disk,
 * such as the evaluation harness laying a fixture under the fixture's policy.
 * @param before The family before the transition, or null before its creation.
 * @param transition The change.
 * @param at The timestamp to apply and stamp it with.
 * @param policy The policy to check new vocabulary against, or null to check none.
 * @returns The accepted board with what the transition said beside it, or the refusal.
 */
function acceptedTransition(
	before: SemanticBoard | null,
	transition: SemanticTransition,
	at: string,
	policy: SemanticPolicy | null,
): TransitionResult {
	const produced = transition.apply(before, at);
	if (!produced.ok) return produced;
	const accepted = acceptedBoard(before, produced.board, at, policy);
	return "problem" in accepted
		? refuse("INVALID_CONTENT", `refusing to ${transition.summary}: ${accepted.problem}`)
		: { ...produced, board: accepted.board };
}

export { acceptedBoard, acceptedTransition };
