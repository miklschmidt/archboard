// What the active pane is reading, as the header names it: the board by the
// name the vault lists it under, the boards it sits under in the outline, its
// level, and the variant it shows, with its lifecycle, when that is not the
// one its name opens. Pure.

import {
	boardAncestors,
	listedBoard,
	listedBoardKey,
	nothingBuiltOn,
	type OutlineNode,
} from "@/ui/board-catalog";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import type { BoardListing, CatalogBoard, ListedVariant } from "@/ui/types";

/** A variant the header names: its name, and its lifecycle when the vault lists it. */
interface ShownVariant {
	readonly name: string;
	readonly lifecycle: ListedVariant["lifecycle"] | null;
}

/** The header's reading of the active pane. */
interface Reading {
	/** The board's name, or null before the pane shows one. */
	readonly name: string | null;
	/** Its level, when it has one. */
	readonly level: string | null;
	/** The boards above it in the outline, outermost first. */
	readonly ancestors: readonly CatalogBoard[];
	/** The variant shown, when it is not the one the board's name opens. */
	readonly variant: ShownVariant | null;
	/** Nothing the board describes is built (ADR 0031). */
	readonly unbuilt: boolean;
}

const NOTHING: Reading = Object.freeze({
	name: null,
	level: null,
	ancestors: [],
	variant: null,
	unbuilt: false,
});

/**
 * A variant the address names that the vault does not list: its name alone.
 * @param key The pane's key.
 * @returns The variant, or null for an address that names none.
 */
function unlistedVariant(key: string | null): ShownVariant | null {
	const name = boardAddressOf(key)?.variant;
	return name === undefined ? null : { name, lifecycle: null };
}

/**
 * The variant a key shows, when it is not the one the board's name opens.
 * @param board The listed board.
 * @param listing The listing.
 * @param key The pane's key.
 * @returns The variant, or null.
 */
function shownVariant(
	board: CatalogBoard,
	listing: BoardListing,
	key: string,
): ShownVariant | null {
	const listed = listedBoardKey(listing, key);
	const variant = board.variants.find((entry) => entry.key === listed);
	if (variant === undefined) return unlistedVariant(key);
	return variant.id === board.opens ? null : { name: variant.name, lifecycle: variant.lifecycle };
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
		return { ...NOTHING, name: address.board, variant: unlistedVariant(key) };
	}
	return {
		name: board.name,
		level: board.level ?? null,
		ancestors: boardAncestors(outline, board.name),
		variant: shownVariant(board, listing, key),
		unbuilt: nothingBuiltOn(listing, board.name),
	};
}

export { readingOf, type Reading, type ShownVariant };
