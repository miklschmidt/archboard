// What the active pane is reading, as the header names it: the board by the
// name the vault lists it under, the boards it sits under in the outline, its
// level, and the state it shows when that is not the one its name opens. Pure.

import { boardAncestors, listedBoard, listedBoardKey, type OutlineNode } from "@/ui/board-catalog";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import type { BoardListing, CatalogBoard } from "@/ui/types";

/** The header's reading of the active pane. */
interface Reading {
	/** The board's name, or null before the pane shows one. */
	readonly name: string | null;
	/** Its level, when it has one. */
	readonly level: string | null;
	/** The boards above it in the outline, outermost first. */
	readonly ancestors: readonly CatalogBoard[];
	/** The state shown, when it is not the one the board's name opens. */
	readonly state: string | null;
	/** Nothing the board describes is built (ADR 0031). */
	readonly unbuilt: boolean;
}

const NOTHING: Reading = Object.freeze({
	name: null,
	level: null,
	ancestors: [],
	state: null,
	unbuilt: false,
});

/**
 * The state a key shows, when it is not the one the board's name opens.
 * @param board The listed board.
 * @param listing The listing.
 * @param key The pane's key.
 * @returns The state's name, or null.
 */
function shownState(board: CatalogBoard, listing: BoardListing, key: string): string | null {
	const listed = listedBoardKey(listing, key);
	const variant = board.variants.find((entry) => entry.key === listed);
	if (variant === undefined) return boardAddressOf(key)?.variant ?? null;
	return variant.id === board.opens ? null : variant.name;
}

/**
 * What the active pane is reading.
 * @param listing The listing.
 * @param outline The outline.
 * @param key The active pane's board key, or null.
 * @returns The reading.
 */
function readingOf(
	listing: BoardListing,
	outline: readonly OutlineNode<CatalogBoard>[],
	key: string | null,
): Reading {
	const address = boardAddressOf(key);
	if (address === null || key === null) return NOTHING;
	const board = listedBoard(listing, address.board);
	if (board === undefined) {
		return { ...NOTHING, name: address.board, state: address.variant ?? null };
	}
	const variants = board.variants;
	return {
		name: board.name,
		level: board.level ?? null,
		ancestors: boardAncestors(outline, board.name),
		state: shownState(board, listing, key),
		unbuilt: variants.length > 0 && variants.every((variant) => variant.lifecycle !== "current"),
	};
}

export { readingOf, type Reading };
