// How the navigator names its rows and compares board names. A board row's
// id is the outline's id for the board, so the path the outline reports
// opens exactly the rows it names. Pure.

import type { CatalogBoard } from "@/ui/types";

/**
 * Two board names are the same board: the server folds keys to lower case.
 * @param one A name or key.
 * @param other Another.
 * @returns True when they name the same board.
 */
function sameBoard(one: string | null, other: string): boolean {
	return one !== null && one.toLowerCase() === other.toLowerCase();
}

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

export { boardRowId, earlierRowId, sameBoard, variantRowId };
