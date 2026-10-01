// How the navigator names its rows. A board row's id is the outline's id for
// the board, so the path the outline reports opens exactly the rows it names.
// Pure.

import type { CatalogBoard } from "@/ui/types";

/**
 * The id of a board's row: the outline's id for it.
 * @param name The board's name.
 * @returns The id.
 */
function boardRowId(name: string): string {
	return `board:${name.toLowerCase()}`;
}

/**
 * The id of a variant's row.
 * @param key The variant's listed key.
 * @returns The id.
 */
function variantRowId(key: string): string {
	return `variant:${key}`;
}

/**
 * The id of a board's Earlier row.
 * @param board The board.
 * @returns The id.
 */
function earlierRowId(board: CatalogBoard): string {
	return `earlier:${board.key}`;
}

export { boardRowId, earlierRowId, variantRowId };
