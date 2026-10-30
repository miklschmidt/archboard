import { useEffect } from "react";

import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { readerMove, type ReaderMove } from "#ui/rules/architecture-model/reader-keys.ts";

/**
 * Hear the keys of a reading anywhere on the page, while its pane has focus. They hold while
 * presenting, when nothing else on screen can move the reader.
 * @param act Make the move, and say whether there was one to make.
 */
function useReaderKeys(act: (move: ReaderMove) => boolean): void {
	const { active } = usePaneChrome();
	useEffect(() => {
		if (!active) return undefined;
		/**
		 * Take a key that is a move of the reader.
		 * @param event The key event.
		 */
		const onKeyDown = (event: KeyboardEvent): void => {
			const move = readerMove(event);
			if (move !== null && act(move)) event.preventDefault();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [active, act]);
}

export { useReaderKeys };
