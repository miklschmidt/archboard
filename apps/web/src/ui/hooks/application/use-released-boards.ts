// A board that stops being shown has to be read again.
//
// While a pane shows a board, the server announces every change to it and the
// pane's picture follows. The moment no pane shows it any more, nothing says
// what happens to it: an agent can rewrite it while nobody is looking, and the
// next time it is opened the cached picture would be the one from before.
// Letting go of a board is the one signal that covers every way it can have
// been written since.

import { useEffect, useRef } from "react";

import { releasedBoards, type HeldBoard } from "#ui/rules/application/pane-records.ts";
import type { BoardCatalog } from "#ui/hooks/board-catalog/use-board-catalog.ts";

/**
 * Read a board again once no pane is showing it.
 * @param held The boards the panes show, in pane order.
 * @param catalog The board cache.
 */
function useReleasedBoards(held: readonly HeldBoard[], catalog: BoardCatalog): void {
	const previous = useRef<readonly HeldBoard[]>([]);
	const { boardsChanged } = catalog;
	useEffect(() => {
		const released = releasedBoards(previous.current, held);
		previous.current = held;
		for (const board of released) {
			boardsChanged(board.vault, [board.key]);
		}
	}, [held, boardsChanged]);
}

export { useReleasedBoards };
