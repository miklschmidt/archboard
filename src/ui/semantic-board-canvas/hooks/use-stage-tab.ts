// Which way a pane is read: the picture, or one of the board's pages.
//
// The choice is kept with the board it was made on, so following a drill-down
// reads the board below as a diagram, and a walkthrough being read is always
// the picture. A page is a way of reading the board, so choosing one leaves a
// presented walkthrough.

import { useCallback, useState } from "react";

import type { BoardTab } from "@/ui/semantic-board-canvas/components/PaneHeader";

/** The tab that is open, and the way to open another. */
interface StageTab {
	/** The tab that is open. */
	readonly tab: BoardTab;
	/**
	 * Open a tab.
	 * @param tab The tab.
	 */
	readonly onTab: (tab: BoardTab) => void;
}

/**
 * Which way the pane is read.
 * @param board The board on screen.
 * @param presenting Whether a walkthrough is being read.
 * @param choose Choose the walkthrough to read, or null to leave the one being read.
 * @returns The open tab, and the way to open another.
 */
function useStageTab(
	board: string,
	presenting: boolean,
	choose: (walkthrough: string | null) => void,
): StageTab {
	const [place, setPlace] = useState<{ readonly board: string; readonly tab: BoardTab }>({
		board,
		tab: "diagram",
	});
	const tab: BoardTab = presenting || place.board !== board ? "diagram" : place.tab;
	const onTab = useCallback(
		(next: BoardTab): void => {
			if (next !== "diagram") choose(null);
			setPlace({ board, tab: next });
		},
		[choose, board],
	);
	return { tab, onTab };
}

export { useStageTab };
