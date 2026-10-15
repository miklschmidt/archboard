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
import { readAgain } from "@/ui/semantic-board-canvas/lib/read-again";
import { semanticBoardKeys } from "@/ui/semantic-board-canvas/lib/queries";

/**
 * Read one board again, from after the change rather than from before it.
 *
 * Both reads of it, not only the picture: the drawing and the document are two
 * readings of one versioned board, and a new version makes both of them a
 * description of something that is no longer there. Leaving the document behind
 * would be the quietest kind of wrong — the diagram would move and the panel
 * beside it would go on explaining the architecture from before the edit. The
 * document goes first, because the pictures are drawn from it.
 * @param client The cache.
 * @param vault The vault the board is in.
 * @param board The board that changed.
 * @returns Settles once the fresh reads have been asked for.
 */
function readBoardAgain(client: QueryClient, vault: string, board: string): Promise<void> {
	return readAgain(client, [
		semanticBoardKeys.document(vault, board),
		semanticBoardKeys.boardRenders(vault, board),
	]);
}

/**
 * Ask the server for this board's picture again whenever it changes.
 * @param vault The vault the board is in.
 * @param board The board as this reader asks for it.
 * @param goesBy The name the board goes by now, when this reader asks for it by
 *   a name it had before a rename (ADR 0036); its news is announced under this.
 */
function useSemanticBoardChanges(vault: string, board: string, goesBy: string = board): void {
	const client = useQueryClient();
	useEffect(
		() =>
			onSemanticBoardChange((inVault, changed): void => {
				if (inVault !== vault) {
					return;
				}
				if (sameBoardName(changed, board) || sameBoardName(changed, goesBy)) {
					void readBoardAgain(client, vault, board);
				}
			}),
		[board, client, goesBy, vault],
	);
}

export { useSemanticBoardChanges };
