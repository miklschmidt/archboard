// Putting the two halves of the listing together: the boards the vault holds
// and the boards the live panes hold. They are read separately so that one of
// them failing leaves the other on screen, and this is the only place they
// meet. Pure: no React, no fetching.

import type { SemanticBoardEntry } from "@/ui/semantic-board-canvas";
import type { BoardListing, BrowserPaneListing } from "@/ui/types";

/** The listing before either half has been read. */
const EMPTY_LISTING: BoardListing = Object.freeze({ boards: [], onScreen: [] });

/**
 * The vault half, empty until it has been read. An unread vault is not an
 * empty one, which is why the navigator asks the query whether it is pending
 * rather than reading anything into a vault with no boards in it.
 * @param boards The vault's boards, or undefined while unread.
 * @returns The listed boards.
 */
function vaultHalf(boards: readonly SemanticBoardEntry[] | undefined): BoardListing["boards"] {
	return (boards ?? []).map((board) => ({
		key: board.key,
		identity: { board: board.name, variant: "current" },
	}));
}

/**
 * The listing the shell reads, from whichever halves have been read.
 * @param boards The vault's boards, or undefined while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The listing.
 */
function composeListing(
	boards: readonly SemanticBoardEntry[] | undefined,
	panes: BrowserPaneListing | undefined,
): BoardListing {
	if (boards === undefined && panes === undefined) {
		return EMPTY_LISTING;
	}
	const live = panes?.panes ?? [];
	return {
		boards: vaultHalf(boards),
		onScreen: live.map(({ paneId, place, board }) => ({ paneId, place, board })),
	};
}

/**
 * Plain words for a failed read.
 * @param failure What was thrown.
 * @returns The message.
 */
function failureMessage(failure: unknown): string {
	return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Why the navigator cannot show what it should, or null when it can.
 *
 * The vault's failure is the one that matters and keeps its long-standing
 * words. A pane inventory that failed on its own is reported separately and
 * only while nothing of it is left to show: the vault's boards are still
 * listed, and what is missing is which of them a pane has open.
 * @param vault What the vault read threw, or null.
 * @param panes What the pane read threw, or null.
 * @param panesRead Whether any pane inventory is still in hand.
 * @returns The message, or null.
 */
function listingError(vault: unknown, panes: unknown, panesRead: boolean): string | null {
	if (vault !== null && vault !== undefined) {
		return `The board listing could not be read: ${failureMessage(vault)}`;
	}
	if (panes !== null && panes !== undefined && !panesRead) {
		return `The open boards could not be read: ${failureMessage(panes)}`;
	}
	return null;
}

export { EMPTY_LISTING, composeListing, listingError };
