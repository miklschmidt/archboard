// Which board a pane is actually looking at, once somebody has followed a
// drill-down out of the one it was opened on.
//
// This is presentation state, in the same class as the camera and the
// selection: it is never written down, never sent to the server, and never
// part of an address. The pane's address keeps naming the board the pane was
// opened on; following a link down a level changes what is on screen and
// offers the way back, and closing the tab forgets it (ADR 0023).
//
// The stack is the whole of it. Empty means the pane is showing its own board,
// and in that case every value here is exactly what the pane was given — a pane
// nobody has drilled into behaves as though this hook were not there.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** One board a pane has been looking at, and which variant of it. */
interface DrillStop {
	/** The board name. */
	readonly board: string;
	/** A variant id or name, or undefined for the board's current variant. */
	readonly variant: string | undefined;
}

/** Where a pane is, and the two moves it can make. */
interface DrillNavigation {
	/** The board on screen. */
	readonly board: string;
	/** The variant on screen, or undefined for the board's current one. */
	readonly variant: string | undefined;
	/**
	 * How the pane got here, starting at the board it was opened on and ending
	 * at the one before the current stop. Empty when nothing has been followed.
	 */
	readonly trail: readonly DrillStop[];
	/**
	 * Follow a drill-down into another board.
	 * @param board The target board.
	 * @param variant A variant id or name, or undefined for its current one.
	 */
	readonly open: (board: string, variant: string | undefined) => void;
	/** Go back one level. */
	readonly back: () => void;
	/** Go back to the board the pane was opened on. */
	readonly home: () => void;
}

/**
 * Where the pane is looking, and how to move it.
 *
 * The stack is emptied whenever the pane itself is pointed somewhere else,
 * because at that moment the trail is a history of a different pane: the shell
 * decided what this one shows, and a back button leading to the board somebody
 * was reading before that would be lying about where they came from.
 * @param board The board the pane was opened on.
 * @param variant The variant the pane was opened on, if it named one.
 * @returns The board on screen, the trail behind it, and the moves.
 */
function useDrillDown(board: string, variant: string | undefined): DrillNavigation {
	const [stack, setStack] = useState<readonly DrillStop[]>([]);
	const opened = useRef({ board, variant });

	useEffect(() => {
		if (opened.current.board !== board || opened.current.variant !== variant) {
			opened.current = { board, variant };
			setStack([]);
		}
	}, [board, variant]);

	const open = useCallback((target: string, asked: string | undefined): void => {
		setStack((current) => [...current, { board: target, variant: asked }]);
	}, []);
	const back = useCallback((): void => {
		setStack((current) => current.slice(0, -1));
	}, []);
	const home = useCallback((): void => {
		setStack([]);
	}, []);

	return useMemo(() => {
		const here = stack[stack.length - 1];
		return {
			board: here?.board ?? board,
			variant: here === undefined ? variant : here.variant,
			trail: stack.length === 0 ? [] : [{ board, variant }, ...stack.slice(0, -1)],
			open,
			back,
			home,
		};
	}, [stack, board, variant, open, back, home]);
}

export { type DrillNavigation, type DrillStop, useDrillDown };
