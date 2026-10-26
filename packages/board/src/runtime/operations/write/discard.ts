// Letting a whole board go (TASK-304.02), which `semantic delete` asks for
// by name and `semantic record --discard` asks for after a recording (ADR 0057).
//
// Discarding is the one change that leaves no board behind, and it is still a
// change to the board: it takes the same lease a write takes, through the same
// admission, so a board somebody else holds is refused with the same words a
// write gets and an agent working under a claim discards as that claim.
//
// It is refused while a node on another board of the vault opens the board
// (ADR 0029): the link would open nothing afterwards, and the person who asked
// for the delete is the one who can say whether the link goes or points
// elsewhere. The refusal names every such node. A tracked embed is no reason to
// refuse: the answer lists them, and each one's own embeds check reports the
// board gone.
//
// What goes, per thing the vault keeps about a board:
//
//   the note, every variant with it, because one document holds them all. It
//     is unlinked and its directory synced, so the removal is as durable as a
//     write (`atomic-write.ts`). Its name and its former names go with it,
//     because the note is where they are written (ADR 0036), so a new board
//     can take any of them.
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
import type { BoardOpener } from "#shared/protocol/board-discard.ts";
import type { TrackedEmbed } from "#shared/schemas/board-document.ts";
import { claimWriterId, releaseClaim } from "#runtime/store/lock/lock.ts";
import type { SemanticBoardLocation } from "#runtime/store/location.ts";
import { boardBefore, rejected } from "#runtime/operations/write/candidate.ts";
import { drillDownsOpening } from "#runtime/operations/move/checks.ts";
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

/** What a discard removed, before the lease says who held the board. */
interface Discarded {
	readonly outcome: "discarded";
	readonly location: SemanticBoardLocation;
	/** The version the board was at when it went. */
	readonly previousVersion: number;
	/** The embeds the board listed, which now show a board that is gone. */
	readonly trackedEmbeds: readonly TrackedEmbed[];
}

/** What a discard removed and the identity it held the board under, or why it removed nothing. */
type SemanticDiscardResult = (Discarded & { readonly heldAs: string }) | SemanticWriteRejection;

/**
 * Refuse a discard while nodes on other boards open the board.
 * @param location Where the board lives.
 * @param version The version it is at.
 * @param openedBy Every node that opens it.
 * @returns The refusal.
 */
function openedByRefusal(
	location: SemanticBoardLocation,
	version: number,
	openedBy: readonly BoardOpener[],
): SemanticWriteRejection {
	const boards = [...new Set(openedBy.map((one) => `"${one.board}"`))].join(", ");
	return {
		...rejected(
			location,
			version,
			"BOARD_OPENED_BY",
			`${openedBy.length} node(s) on ${boards} open "${location.name}", and after the delete ` +
				"they would open nothing. Remove each drill-down, or point it at another board, " +
				"first. Nothing was removed.",
		),
		openedBy,
	};
}

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
): Discarded | SemanticWriteRejection {
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
	const openedBy = drillDownsOpening(vault, location.key);
	if (openedBy.length > 0) {
		return openedByRefusal(location, before.board.version, openedBy);
	}
	unlinkDurably(location.file);
	return {
		outcome: "discarded",
		location,
		previousVersion: before.board.version,
		trackedEmbeds: before.board.trackedEmbeds ?? [],
	};
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
