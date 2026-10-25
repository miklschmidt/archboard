// A write in two steps, for a caller that must read something about the
// candidate before it may land: a historical correction reads the code at the
// revisions it cites (ADR 0023's historical-correction amendment).
//
// Preparing reads the board as its lease would read it, checks the stated
// version, applies the change and admits the candidate under the vault's
// policy and the board's address. It holds no lease, so nobody waits for a
// board while somebody else reads Git. Committing writes exactly that candidate
// under the lease (ADR 0016): it reads the board again, refuses with
// BOARD_VERSION_CONFLICT when the version moved, and admits the candidate
// again under the policy as it is then. The change is never applied a second
// time, so the subject ids a caller read evidence about are the ids written.

import type { SemanticBoard } from "#shared/schemas/board-document.ts";
import type { HistoricalCorrectionInput } from "#shared/protocol/historical-correction.ts";
import { resolveSemanticBoard } from "#runtime/store/former-names.ts";
import { locateSemanticBoard, type SemanticBoardLocation } from "#runtime/store/location.ts";
import { readSemanticBoardAtAsLeased } from "#runtime/operations/read/read.ts";
import type { DescendantOutcome } from "#runtime/operations/variant/propagate.ts";
import { refuse } from "#runtime/operations/write/outcome.ts";
import type { SemanticTransition } from "#runtime/operations/write/transitions.ts";
import { correctHistoricalTransition } from "#runtime/operations/write/correction.ts";
import {
	checkedCandidate,
	rejected,
	type CheckedCandidate,
} from "#runtime/operations/write/candidate.ts";
import {
	writeSemanticBoardAt,
	type SemanticWriteCommand,
	type SemanticWriteRejection,
	type SemanticWriteResult,
} from "#runtime/operations/write/write.ts";

/** Which board to change, the version the writer read, and the change: a transition or a historical correction. */
type SemanticWritePreparation = Pick<SemanticWriteCommand, "vault" | "board" | "expectedVersion"> &
	(
		| { readonly transition: SemanticTransition; readonly correct?: never }
		| { readonly correct: HistoricalCorrectionInput; readonly transition?: never }
	);

/** A candidate the store would write now, and the one way to write it. */
interface PreparedSemanticWrite {
	readonly outcome: "prepared";
	/** The board as the commit writes it, stamped at the next version. */
	readonly board: SemanticBoard;
	/** Where the board is written. */
	readonly location: SemanticBoardLocation;
	/** The version the board is at, which the commit requires it still to be at. */
	readonly previousVersion: number | null;
	/** What every draft under the change did about it. */
	readonly descendants: readonly DescendantOutcome[];
	/**
	 * Write exactly this candidate under the board's lease, or refuse: with
	 * BOARD_VERSION_CONFLICT when the board moved since it was prepared, and as
	 * any write refuses when the policy, a claim or the lease says no.
	 */
	readonly commit: (
		by: Pick<SemanticWriteCommand, "writer" | "signal">,
	) => Promise<SemanticWriteResult>;
}

/**
 * The transition a commit writes: the prepared candidate, on the board it was prepared from.
 *
 * A board that states a version is held to it by the write's own version
 * check. A candidate prepared where no board was has no version to state, so
 * a board that appeared since is refused here.
 * @param transition The change as stated, for its summary and whether it changes an existing board.
 * @param checked The prepared candidate.
 * @returns The transition.
 */
function preparedTransition(
	transition: SemanticTransition,
	checked: CheckedCandidate,
): SemanticTransition {
	return {
		summary: transition.summary,
		changesExistingBoard: transition.changesExistingBoard,
		/**
		 * The prepared candidate, when the board is still the one it was prepared from.
		 * @param before The board as the lease reads it.
		 * @returns The candidate, or the refusal.
		 */
		apply: (before) => {
			if (before !== null && checked.previousVersion === null) {
				return refuse(
					"BOARD_VERSION_CONFLICT",
					`this write was prepared where no board was and it is at version ${before.version}; prepare it again`,
				);
			}
			const { board, descendants, notices } = checked;
			return {
				ok: true,
				board,
				...(descendants === undefined ? {} : { descendants }),
				...(notices === undefined ? {} : { notices }),
			};
		},
	};
}

/**
 * Prepare one change to one board: the candidate the store would write now, or why it would not.
 *
 * Holds no lease and writes nothing. A change to an existing board that finds
 * no board is refused with BOARD_MISSING.
 * @param preparation Which board, the version the writer read, and the change.
 * @returns The prepared candidate with its commit, or the refusal.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
function prepareSemanticBoardWrite(
	preparation: SemanticWritePreparation,
): PreparedSemanticWrite | SemanticWriteRejection {
	const { vault, expectedVersion } = preparation;
	const transition =
		preparation.correct === undefined
			? preparation.transition
			: correctHistoricalTransition(preparation.correct);
	const location = locateSemanticBoard(resolveSemanticBoard(preparation.board, vault).name, vault);
	// Read as the commit's lease would read it: a board that awaits its
	// migration is answered at the version the commit then finds.
	const read = readSemanticBoardAtAsLeased(vault, location);
	if (!read.ok && read.code === "BOARD_MISSING" && transition.changesExistingBoard) {
		return rejected(location, null, read.code, read.problem);
	}
	const at = new Date().toISOString();
	const checked = checkedCandidate(
		location,
		{ vault, transition, expectedVersion },
		at,
		() => read,
	);
	if (checked.outcome === "rejected") {
		return checked;
	}
	return {
		outcome: "prepared",
		board: checked.board,
		location: checked.moved.location,
		previousVersion: checked.previousVersion,
		descendants: checked.descendants ?? [],
		commit: (by) =>
			writeSemanticBoardAt(
				{
					vault,
					board: preparation.board,
					...by,
					expectedVersion: checked.previousVersion ?? undefined,
					transition: preparedTransition(transition, checked),
				},
				at,
			),
	};
}

export { prepareSemanticBoardWrite };
