// What one browser tab's canvas holds now, as its voice and coordinator are told about it
// (TASK-293): the boards its panes show, and the board a narration in one of them is on.

import type { CoordinatorCallbackCanvas } from "@/runtime/codex-coordinator-callbacks";
import { boardForPane, panes } from "@/server/archboard/lib/pane-registry";
import { aggregateKey } from "@/server/archboard/lib/semantic-board-context";
import { semanticPaneContextFor } from "@/server/archboard/lib/semantic-pane-context";
import { tabSessionOf } from "@/server/archboard/lib/tab-sessions";
import { narratedBoardOf } from "@/server/archboard/lib/walkthrough-narration";
import type { TabSessionId } from "@/server/codex-workbench";

/**
 * What one tab's canvas holds now, read at the moment it is asked: a pane moves, and leaving a
 * walkthrough ends its narration. A pane is on two boards for a moment: the one the server last
 * pointed it at, which a show changes before the pane says so, and the one the pane last said it
 * reads, which a drill-down changes without the server.
 * @param tabSessionId The tab.
 * @returns The boards its panes show and the narrated one, each by aggregate key.
 */
function canvasOf(tabSessionId: TabSessionId): CoordinatorCallbackCanvas {
	const boards = [...panes.values()].flatMap((pane) => {
		if (tabSessionOf(pane.clientId) !== tabSessionId) {
			return [];
		}
		const said = semanticPaneContextFor(pane.clientId)?.board?.name ?? null;
		return [boardForPane(pane), said].flatMap((board) =>
			board === null ? [] : [aggregateKey(board)],
		);
	});
	return { boards, narrated: narratedBoardOf(tabSessionId) };
}

export { canvasOf };
