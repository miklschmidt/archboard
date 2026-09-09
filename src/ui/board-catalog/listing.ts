// Putting the two halves of the listing together: the boards the vault holds
// and the boards the live panes hold. They are read separately so that one of
// them failing leaves the other on screen, and this is the only place they
// meet. Pure: no React, no fetching.

import type { BoardListing, BrowserPaneListing, PersistedBoardListing } from "@/ui/types";

/** The listing before either half has been read. */
const EMPTY_LISTING: BoardListing = Object.freeze({
	vault: "",
	boards: [],
	open: [],
	onScreen: [],
});

/**
 * The boards the live panes hold, once each. Two panes on one board is one
 * open board, and the first pane's report is the one that names it.
 * @param live The panes the server has registered.
 * @returns The open boards.
 */
function openBoards(live: BrowserPaneListing["panes"]): BoardListing["open"] {
	const open = new Map<string, BoardListing["open"][number]>();
	for (const pane of live) {
		if (!open.has(pane.board)) {
			open.set(pane.board, {
				key: pane.board,
				identity: pane.identity,
				elementCount: pane.elementCount,
			});
		}
	}
	return [...open.values()];
}

/**
 * The vault half, empty until it has been read. An unread vault is not an
 * empty one, which is why the navigator asks the query whether it is pending
 * rather than reading anything into a vault with no boards in it.
 * @param persisted The vault's boards, or undefined while unread.
 * @returns The vault and its boards.
 */
function vaultHalf(persisted: PersistedBoardListing | undefined): PersistedBoardListing {
	return persisted ?? { vault: "", boards: [] };
}

/**
 * The listing the shell reads, from whichever halves have been read.
 * @param persisted The vault's boards, or undefined while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The listing.
 */
function composeListing(
	persisted: PersistedBoardListing | undefined,
	panes: BrowserPaneListing | undefined,
): BoardListing {
	if (persisted === undefined && panes === undefined) {
		return EMPTY_LISTING;
	}
	const live = panes?.panes ?? [];
	return {
		...vaultHalf(persisted),
		open: openBoards(live),
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
 * @param persisted What the vault read threw, or null.
 * @param panes What the pane read threw, or null.
 * @param panesRead Whether any pane inventory is still in hand.
 * @returns The message, or null.
 */
function listingError(persisted: unknown, panes: unknown, panesRead: boolean): string | null {
	if (persisted !== null && persisted !== undefined) {
		return `The board listing could not be read: ${failureMessage(persisted)}`;
	}
	if (panes !== null && panes !== undefined && !panesRead) {
		return `The open boards could not be read: ${failureMessage(panes)}`;
	}
	return null;
}

export { EMPTY_LISTING, composeListing, listingError, openBoards };
