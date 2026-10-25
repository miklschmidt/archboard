// Letting a whole board go (TASK-304.02).
//
// A board made only to be recorded should not stay in the vault. Discarding is
// the one change that leaves no board behind, and it is still a change to the
// board: it takes the same lease a write takes, through the same admission, so
// a board somebody else holds is refused with the same words a write gets and
// an agent working under a claim discards as that claim.
//
// What goes, per thing the vault keeps about a board:
//
//   the note, every variant with it, because one document holds them all. It
//     is unlinked and its directory synced, so the removal is as durable as a
//     write (`atomic-write.ts`).
//   this server's claim on the board, when the discard ran under it. A claim is
//     a fact about the board, and one left standing would keep a banner over a
//     pane that has nothing left to show until the campaign ran out. Releasing
//     it removes its lease file; a per-write lease is released by the lock as
//     after any write.
//   nothing else. A directory a nested name created is left, because another
//     board's create may be about to write into it, and the listing never reads
//     an empty one as a board. A semantic board keeps no images outside its
//     note.

import { unlinkDurably } from "@archboard/workspace/atomic-write";
import { claimWriterId, releaseClaim } from "#runtime/store/lock/lock.ts";
import type { SemanticBoardLocation } from "#runtime/store/location.ts";
import { boardBefore, rejected } from "#runtime/operations/write/candidate.ts";
import {
	underBoardLease,
	type BoardLeaseAsk,
	type SemanticWriteCommand,
	type SemanticWriteRejection,
} from "#runtime/operations/write/write.ts";

/**
 * One board to let go, who is letting it go, and the version they read when
 * they state one: a board somebody changed since is refused, not deleted.
 */
type SemanticDiscardCommand = BoardLeaseAsk & Pick<SemanticWriteCommand, "expectedVersion">;

/** What a discard removed, or why it removed nothing. */
type SemanticDiscardResult =
	| {
			readonly outcome: "discarded";
			readonly location: SemanticBoardLocation;
			/** The version the board was at when it went. */
			readonly previousVersion: number;
			/** The identity the board was held under while it went. */
			readonly heldAs: string;
	  }
	| SemanticWriteRejection;

/**
 * Remove the board on disk, inside the lease.
 *
 * Only a board that really is this one goes: a file at this address holding
 * another board's name, one that is not a board at all, or one at another
 * version than the discarder stated, is refused exactly as a write to it would
 * be, and a board that is not there is refused as missing.
 * @param vault The vault root the board lives in.
 * @param location Where the board lives.
 * @param expected The version the discarder read, when it stated one.
 * @returns What was removed, or why nothing was.
 */
function discardUnderLease(
	vault: string,
	location: SemanticBoardLocation,
	expected: number | undefined,
):
	| Omit<Extract<SemanticDiscardResult, { outcome: "discarded" }>, "heldAs">
	| SemanticWriteRejection {
	const before = boardBefore(vault, location, expected);
	if (!("ok" in before)) {
		return before;
	}
	if (before.board === null) {
		return rejected(
			location,
			null,
			"BOARD_MISSING",
			`There is no board "${location.name}" to discard. Nothing was removed.`,
		);
	}
	unlinkDurably(location.file);
	return { outcome: "discarded", location, previousVersion: before.board.version };
}

/**
 * Delete one board, every variant of it, under its lease.
 * @param command Which board, and who is discarding it.
 * @returns What was removed, or why nothing was.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
async function discardSemanticBoard(
	command: SemanticDiscardCommand,
): Promise<SemanticDiscardResult> {
	const result = await underBoardLease(command, (location) =>
		discardUnderLease(command.vault, location, command.expectedVersion),
	);
	if (
		result.outcome === "discarded" &&
		claimWriterId(command.vault, result.location.key) === result.heldAs
	) {
		releaseClaim(command.vault, result.location.key);
	}
	return result;
}

export { type SemanticDiscardCommand, type SemanticDiscardResult, discardSemanticBoard };
