// Which way a pane is read: the picture, or the board's About page.
//
// The choice is kept with the board it was made on, so following a drill-down
// reads the board below as a diagram, and a walkthrough being read is always
// the picture. The page is a way of reading the board, so choosing it leaves a
// presented walkthrough, and leaving a walkthrough presented from it brings
// the page back.
//
// The page goes while the diagram is read, and it comes back where the reader
// left it: how far down it was is kept with the board too. It is kept outside
// React's state, since a page that scrolls has no reason to draw again.

import { useCallback, useMemo, useRef, useState } from "react";

import type { BoardTab } from "#ui/components/semantic-board-canvas/PaneHeader.tsx";

/** Where the About page was scrolled to on the board on screen, kept while the page is gone. */
interface PagePlace {
	/**
	 * How far down the page was when it went.
	 * @returns The scroll offset, in pixels: 0 for a page not read yet on this board.
	 */
	readonly recall: () => number;
	/**
	 * Keep how far down the page is.
	 * @param top The scroll offset, in pixels.
	 */
	readonly keep: (top: number) => void;
}

/** The tab that is open, the way to open another, and where the page was. */
interface StageTab {
	/** The tab that is open. */
	readonly tab: BoardTab;
	/**
	 * Open a tab.
	 * @param tab The tab.
	 */
	readonly onTab: (tab: BoardTab) => void;
	readonly place: PagePlace;
}

/**
 * Which way the pane is read.
 * @param board The board on screen.
 * @param presenting Whether a walkthrough is being read.
 * @param choose Choose the walkthrough to read, or null to leave the one being read.
 * @returns The open tab, the way to open another, and where the page was.
 */
function useStageTab(
	board: string,
	presenting: boolean,
	choose: (walkthrough: string | null) => void,
): StageTab {
	const [chosen, setChosen] = useState<{ readonly board: string; readonly tab: BoardTab }>({
		board,
		tab: "diagram",
	});
	const scrolled = useRef<{ readonly board: string; readonly top: number }>({ board, top: 0 });
	const tab: BoardTab = presenting || chosen.board !== board ? "diagram" : chosen.tab;
	const onTab = useCallback(
		(next: BoardTab): void => {
			if (next !== "diagram") choose(null);
			setChosen({ board, tab: next });
		},
		[choose, board],
	);
	const recall = useCallback(
		(): number => (scrolled.current.board === board ? scrolled.current.top : 0),
		[board],
	);
	const keep = useCallback(
		(top: number): void => {
			scrolled.current = { board, top };
		},
		[board],
	);
	const place = useMemo(() => ({ recall, keep }), [recall, keep]);
	return { tab, onTab, place };
}

export { useStageTab, type PagePlace };
