// Putting the two halves of the listing together: the boards the vault holds
// and the boards the live panes hold. They are read separately so that one of
// them failing leaves the other on screen, and this is the only place they
// meet. Pure: no React, no fetching.

import { asksForDesignation } from "@/shared/semantic-board/index";
import { boardAddressOf, boardKeyFor, sameBoardName } from "@/ui/semantic-board-canvas";
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
	return (boards ?? []).flatMap((board) =>
		board.variants.length === 0
			? [
					{
						key: board.key,
						identity: { board: board.name, variant: "Unavailable" },
						...(board.level === undefined ? {} : { level: board.level }),
						...(board.error === undefined ? {} : { error: board.error }),
					},
				]
			: board.variants.map((variant) => ({
					key: boardKeyFor(board.key, variant.lifecycle === "current" ? undefined : variant.id),
					identity: { board: board.name, variant: variant.name },
					...(board.level === undefined ? {} : { level: board.level }),
					variant,
				})),
	);
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

/**
 * The listed row for a pane address, including the current designation and names.
 * @param listing The persisted variant summaries.
 * @param key The pane address.
 * @returns The row key, or the original address when it is not listed.
 */
function listedBoardKey(listing: BoardListing, key: string | null): string | null {
	const target = boardAddressOf(key);
	if (target === null) {
		return key;
	}
	const candidates = listing.boards.filter((entry) =>
		sameBoardName(entry.identity.board, target.board),
	);
	const wanted = target.variant;
	const entry = asksForDesignation(wanted ?? "current")
		? candidates.find((candidate) => candidate.variant?.lifecycle === "current")
		: (candidates.find((candidate) => candidate.variant?.id === wanted) ??
			candidates.find((candidate) => candidate.variant?.name === wanted));
	return entry === undefined ? key : entry.key;
}

export { EMPTY_LISTING, composeListing, listingError, listedBoardKey };
