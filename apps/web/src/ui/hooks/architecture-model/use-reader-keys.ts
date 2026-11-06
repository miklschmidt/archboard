import { useEffect } from "react";

import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";
import {
	changeStep,
	readerMove,
	type ChangeStep,
	type ReaderMove,
} from "#ui/rules/architecture-model/reader-keys.ts";

/**
 * Hear some keys anywhere on the page, while the pane has focus.
 * @param read What a key press asks for, or null.
 * @param act Do it, and say whether there was anything to do.
 */
function usePageKeys<Move>(
	read: (event: KeyboardEvent) => Move | null,
	act: (move: Move) => boolean,
): void {
	const { active } = usePaneChrome();
	useEffect(() => {
		if (!active) return undefined;
		/**
		 * Take a key that asks for something.
		 * @param event The key event.
		 */
		const onKeyDown = (event: KeyboardEvent): void => {
			const move = read(event);
			if (move !== null && act(move)) event.preventDefault();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [active, read, act]);
}

/**
 * Hear the keys of a reading anywhere on the page, while its pane has focus. They hold while
 * presenting, when nothing else on screen can move the reader.
 * @param act Make the move, and say whether there was one to make.
 */
function useReaderKeys(act: (move: ReaderMove) => boolean): void {
	usePageKeys(readerMove, act);
}

/**
 * Hear the keys that walk a proposal's changes, also while a walkthrough has the middle.
 * @param act Take the step, and say whether there was one to take.
 */
function useChangeKeys(act: (step: ChangeStep) => boolean): void {
	usePageKeys(changeStep, act);
}

export { useChangeKeys, useReaderKeys };
