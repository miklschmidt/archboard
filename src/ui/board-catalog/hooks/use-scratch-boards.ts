// Which of the boards on screen are scratch: a note with no name anybody
// chose (ADR 0009). One read per board, cached under that board's key, so two
// panes on one board ask once and a pane that comes back to a board it showed
// earlier asks not at all.

import { useQueries, type UseQueryResult } from "@tanstack/react-query";

import { boardInfoQuery } from "@/ui/board-catalog/lib/queries";
import type { BoardInfo } from "@/ui/types";

/** What one board-info read answers. */
type BoardInfoResult = UseQueryResult<BoardInfo & { success: true }>;

/** Which open boards are scratch, and which could not be asked about. */
interface ScratchBoards {
	/** The board keys that have no chosen name. */
	readonly keys: ReadonlySet<string>;
	/**
	 * How many open boards could not be asked about. A board that could not be
	 * read is not a board without a name: the affordance is withheld rather than
	 * offered, and the navigator says so rather than silently omitting it.
	 */
	readonly unreadable: number;
}

/**
 * What the reads answered: the scratch boards, and how many could not be read.
 * @param results One result per board asked about.
 * @returns The scratch keys and the count of unreadable boards.
 */
function scratchBoards(results: readonly BoardInfoResult[]): ScratchBoards {
	const keys = new Set<string>();
	let unreadable = 0;
	for (const result of results) {
		if (result.data?.placeholder === true) {
			keys.add(result.data.board);
		}
		if (result.error !== null) {
			unreadable += 1;
		}
	}
	return { keys, unreadable };
}

/**
 * The scratch boards among the ones the panes hold.
 * @param boards The board keys the panes hold.
 * @returns Which have no chosen name, and how many could not be asked about.
 */
function useScratchBoards(boards: readonly string[]): ScratchBoards {
	return useQueries({
		queries: boards.map((board) => boardInfoQuery(board)),
		combine: scratchBoards,
	});
}

export { scratchBoards, useScratchBoards, type ScratchBoards };
