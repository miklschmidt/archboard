// Which of the boards on screen are scratch: a note with no name anybody
// chose (ADR 0009). One read per board, cached under that board's key, so two
// panes on one board ask once and a pane that comes back to a board it showed
// earlier asks not at all.

import { useQueries, type UseQueryResult } from "@tanstack/react-query";

import { boardInfoQuery } from "@/ui/board-catalog/lib/queries";
import type { BoardInfo } from "@/ui/types";

/** What one board-info read answers. */
type BoardInfoResult = UseQueryResult<BoardInfo & { success: true }>;

/**
 * The keys of the boards that turned out to be scratch. A board whose info
 * could not be read is not scratch: the navigator offers a name for a board it
 * knows has none, never for one it failed to ask about.
 * @param results One result per board asked about.
 * @returns The scratch board keys.
 */
function scratchKeys(results: readonly BoardInfoResult[]): ReadonlySet<string> {
	const keys = new Set<string>();
	for (const result of results) {
		if (result.data?.placeholder === true) {
			keys.add(result.data.board);
		}
	}
	return keys;
}

/**
 * The scratch boards among the ones the panes hold.
 * @param boards The board keys the panes hold.
 * @returns The subset that has no chosen name.
 */
function useScratchBoards(boards: readonly string[]): ReadonlySet<string> {
	return useQueries({
		queries: boards.map((board) => boardInfoQuery(board)),
		combine: scratchKeys,
	});
}

export { scratchKeys, useScratchBoards };
