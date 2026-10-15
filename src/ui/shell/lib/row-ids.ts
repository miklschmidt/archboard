// How the navigator names its rows. A board row's id is the outline's id for
// the board, so the path the outline reports opens exactly the rows it names.
// Every row under a repository is named within it: two repositories can each
// have a board of the same name (ADR 0050). A repository is named by its
// identity or registry name, never by the checkout it reads, so what a person
// opened stays open when another checkout is chosen. Pure.

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

/**
 * The id of a repository's row.
 * @param repository The repository's name.
 * @returns The id.
 */
function repositoryRowId(repository: string): string {
	return `repository:${repository}`;
}

/**
 * The id of a row inside a repository: the repository's id and the row's own.
 * @param repository The repository's name.
 * @param id The row's id within its repository's outline.
 * @returns The id, unique in the whole tree.
 */
function scopedRowId(repository: string, id: string): string {
	return `${repositoryRowId(repository)}|${id}`;
}

export { boardRowId, earlierRowId, repositoryRowId, scopedRowId, variantRowId };
