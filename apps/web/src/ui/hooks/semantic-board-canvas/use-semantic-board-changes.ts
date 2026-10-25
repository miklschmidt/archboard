// A pane's subscription to its own board's news.
//
// The picture has no timer behind it (see `queries.ts`), so this is the whole
// of what makes it out of date: the server announced a new version of this
// board over the pane socket, and every drawing of it is now a picture of
// something that is no longer there.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { onSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import { boardChanged } from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";

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
					void boardChanged(client, vault, board);
				}
			}),
		[board, client, goesBy, vault],
	);
}

export { useSemanticBoardChanges };
