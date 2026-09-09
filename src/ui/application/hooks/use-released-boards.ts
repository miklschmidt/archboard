// A board that stops being held has to be read again.
//
// While a pane holds a board the navigator draws that pane's own scene, so
// what the person is doing to it shows without anything being read (ADR 0015).
// The moment no pane holds it any more, the drawing comes from the server's
// snapshot instead — and that snapshot predates everything the person just
// drew, because ordinary edits are written by the pane's change reports and go
// through no command whose outcome anybody hears (TASK-167). Letting go of a
// board is the one signal that covers every way it can have been written:
// drawing, typing, an undo, a paste. The card keeps its last frame while the
// fresh one is read.

import { useEffect, useRef } from "react";

import { releasedBoardKeys } from "@/ui/application/pane-records";
import type { BoardCatalog } from "@/ui/board-catalog";

/**
 * Read a board again once no pane is holding it.
 * @param held The board keys the panes hold, in pane order.
 * @param catalog The board cache.
 */
function useReleasedBoards(held: readonly string[], catalog: BoardCatalog): void {
	const previous = useRef<readonly string[]>([]);
	const { boardsChanged } = catalog;
	useEffect(() => {
		const released = releasedBoardKeys(previous.current, held);
		previous.current = held;
		if (released.length > 0) {
			boardsChanged(released);
		}
	}, [held, boardsChanged]);
}

export { useReleasedBoards };
