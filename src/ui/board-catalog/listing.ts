// Putting the two halves of the listing together: the boards the vault holds
// and the boards the live panes hold. They are read separately so that one of
// them failing leaves the other on screen, and this is the only place they
// meet. Pure: no React, no fetching.

import { asksForDesignation } from "@archboard/board/document";
import {
	boardAddressOf,
	boardKeyFor,
	sameBoardName,
} from "#web/ui/rules/semantic-board-canvas/board/address.ts";
import type {
	SemanticBoardEntry,
	SemanticBoardListing,
} from "#web/ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardListing, BrowserPaneListing, CatalogBoard, ListedVariant } from "@/ui/types";

/** The listing before either half has been read. */
const EMPTY_LISTING: BoardListing = Object.freeze({ boards: [], levels: [], onScreen: [] });

/** The vault's half of the listing: its boards as the shell lists them, and its levels. */
type VaultHalf = Omit<BoardListing, "onScreen">;

/** The vault's half while it is unread. */
const NO_BOARDS: VaultHalf = Object.freeze({ boards: [], levels: [] });

/**
 * One board as the shell lists it: every variant carries the key a pane opens
 * it by, bare for the variant the board's name opens.
 * @param board The board as the vault lists it.
 * @returns The listed board.
 */
function catalogBoard(board: SemanticBoardEntry): CatalogBoard {
	return {
		...board,
		variants: board.variants.map((variant): ListedVariant => ({
			...variant,
			key: boardKeyFor(board.key, variant.id === board.opens ? undefined : variant.id),
		})),
	};
}

/**
 * The listing the shell reads, from whichever halves have been read. An unread
 * vault is not an empty one, which is why the navigator asks the query whether
 * it is pending rather than reading anything into a vault with no boards.
 *
 * The vault's half comes in already made, so a caller that keeps it while only
 * the panes move hands on the same boards: every pane reads them, and new ones
 * would draw every pane again for a move in another pane.
 * @param vault The vault's half, or undefined while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The listing.
 */
function composeListing(
	vault: VaultHalf | undefined,
	panes: BrowserPaneListing | undefined,
): BoardListing {
	if (vault === undefined && panes === undefined) {
		return EMPTY_LISTING;
	}
	return { ...(vault ?? NO_BOARDS), onScreen: paneHalf(panes) };
}

/**
 * The vault's half: its boards, each variant with the key a pane opens it by, and its levels.
 * @param vault The vault's listing.
 * @returns The boards and levels.
 */
function vaultHalf(vault: SemanticBoardListing): VaultHalf {
	return { boards: vault.boards.map(catalogBoard), levels: vault.levels };
}

/**
 * The pane half: what each live pane holds, empty while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The panes.
 */
function paneHalf(panes: BrowserPaneListing | undefined): BoardListing["onScreen"] {
	return (panes?.panes ?? []).map(({ paneId, place, board }) => ({ paneId, place, board }));
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
 * The listed board a name or key names.
 * @param listing The listing.
 * @param board The board's name or key.
 * @returns The board, or undefined when it is not listed.
 */
function listedBoard(listing: BoardListing, board: string): CatalogBoard | undefined {
	return listing.boards.find((entry) => sameBoardName(entry.name, board));
}

/**
 * The listed variant a pane address shows: the one the bare name opens, the
 * current one for `current`, or the one named by id or name.
 * @param board The listed board.
 * @param wanted The variant the address asks for, or undefined for the bare name.
 * @returns The variant, or undefined when none matches.
 */
function listedVariant(board: CatalogBoard, wanted: string | undefined): ListedVariant | undefined {
	const { variants } = board;
	if (wanted === undefined) {
		return variants.find((variant) => variant.id === board.opens);
	}
	if (asksForDesignation(wanted)) {
		return variants.find((variant) => variant.lifecycle === "current");
	}
	return (
		variants.find((variant) => variant.id === wanted) ??
		variants.find((variant) => variant.name === wanted)
	);
}

/**
 * The listed row for a pane address: the key of the variant it shows, so two
 * spellings of one reading are recognised as one.
 * @param listing The listing.
 * @param key The pane address.
 * @returns The variant's key, or the original address when it is not listed.
 */
function listedBoardKey(listing: BoardListing, key: string | null): string | null {
	const target = boardAddressOf(key);
	if (target === null) {
		return key;
	}
	const board = listedBoard(listing, target.board);
	const variant = board === undefined ? undefined : listedVariant(board, target.variant);
	return variant?.key ?? key;
}

/**
 * Whether a listed board says nothing it describes is built: it lists variants and none of
 * them is current (ADR 0031). A board that is not listed, or could not be read, says nothing.
 * @param listing The listing.
 * @param board The board's name.
 * @returns True when the board has variants and no current one.
 */
function nothingBuiltOn(listing: BoardListing, board: string): boolean {
	const variants = listedBoard(listing, board)?.variants ?? [];
	return variants.length > 0 && variants.every((variant) => variant.lifecycle !== "current");
}

export {
	EMPTY_LISTING,
	composeListing,
	listedBoard,
	listingError,
	listedBoardKey,
	nothingBuiltOn,
	vaultHalf,
	type VaultHalf,
};
