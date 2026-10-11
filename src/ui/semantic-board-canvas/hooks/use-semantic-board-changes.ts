// A pane's subscription to its own board's news.
//
// The picture has no timer behind it (see `queries.ts`), so this is the whole
// of what makes it out of date: the server announced a new version of this
// board over the pane socket, and every drawing of it is now a picture of
// something that is no longer there.

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sameBoardName } from "@/ui/semantic-board-canvas/lib/address";
import { onSemanticBoardChange } from "@/ui/semantic-board-canvas/lib/board-changes";
import { semanticBoardKeys } from "@/ui/semantic-board-canvas/lib/queries";

/**
 * Read one board again, from after the change rather than from before it.
 *
 * Both reads of it, not only the picture: the drawing and the document are two
 * readings of one versioned board, and a new version makes both of them a
 * description of something that is no longer there. Leaving the document behind
 * would be the quietest kind of wrong — the diagram would move and the panel
 * beside it would go on explaining the architecture from before the edit.
 *
 * Cancelling first is what makes "from after" true, for the same reason the
 * board catalog cancels first: a read already on the wire carries an answer the
 * server made before the write, and letting it land would clear the
 * invalidation and count as fresh.
 * @param client The cache.
 * @param board The board that changed.
 * @returns Settles once the fresh reads have been asked for.
 */
async function readBoardAgain(client: QueryClient, board: string): Promise<void> {
	const keys = [semanticBoardKeys.boardRenders(board), semanticBoardKeys.document(board)];
	// Every read in flight is stopped before any of them is asked for again, so
	// that no answer made before the write can land on a key that has already
	// been invalidated and count as fresh.
	await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
	// A read that starts after the cancelling is from after the write, so it is joined and not
	// cancelled again: the picture reading the document is such a read, and cancelling it would
	// leave a pane that asks for its variant by name with the old drawing.
	await Promise.all(
		keys.map((queryKey) => client.invalidateQueries({ queryKey }, { cancelRefetch: false })),
	);
}

/**
 * Ask the server for this board's picture again whenever it changes.
 * @param board The board as this reader asks for it.
 * @param goesBy The name the board goes by now, when this reader asks for it by
 *   a name it had before a rename (ADR 0036); its news is announced under this.
 */
function useSemanticBoardChanges(board: string, goesBy: string = board): void {
	const client = useQueryClient();
	useEffect(
		() =>
			onSemanticBoardChange((changed): void => {
				if (sameBoardName(changed, board) || sameBoardName(changed, goesBy)) {
					void readBoardAgain(client, board);
				}
			}),
		[board, client, goesBy],
	);
}

export { useSemanticBoardChanges };
