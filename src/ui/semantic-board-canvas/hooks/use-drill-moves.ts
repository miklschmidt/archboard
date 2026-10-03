// What following a card's drill-down, and going back a level, do to a pane.
//
// Both clear the selection the move was made from, tell the shell that the
// reader changed the board by hand, and say which way the reader went so the
// picture being left knows how to leave. Which of the two is a flight is the
// dive's to decide: it is handed what the plain move does, and ends with it.

import { useCallback, useMemo } from "react";

import type { SemanticPanePart } from "@/shared/semantic-pane-context";
import type { Destination, Flier } from "@/ui/semantic-board-canvas/hooks/use-dive";
import type { DrillNavigation } from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import type { DepartureWay } from "@/ui/semantic-board-canvas/lib/picture-departure";

/** What a pane's moves between boards are made from. */
interface DrillMovesInputs {
	/** Where the pane is looking, and how it got there. */
	readonly drill: DrillNavigation;
	/** The flights into a card's board and back out of it. */
	readonly flier: Pick<Flier, "into" | "out">;
	/**
	 * Say which way the reader is about to go, before they go.
	 * @param way Into a card, back out, or across.
	 * @param card The card opened, when going into one.
	 */
	readonly leave: (way: DepartureWay, card?: string | null) => void;
	/** The subject picked out, which a drill-down opens from. */
	readonly picked: string | null;
	/** The view the shell has the pane read its own board through. */
	readonly ownView: string | undefined;
	/**
	 * Clear the selection.
	 * @param id Nothing is selected.
	 */
	readonly onSelect: (id: null) => void;
	/** The user changed a part of the reading by hand that the shell hears of no other way. */
	readonly onUserChanged: ((part: SemanticPanePart) => void) | undefined;
}

/** The two moves a pane makes between boards. */
interface DrillMoves {
	/**
	 * Follow a drill-down to a board and one of its variants.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	readonly onOpenDown: (board: string, variant: string) => void;
	/** Go back a level. */
	readonly onBack: () => void;
}

/**
 * The board above the one on screen, and how the pane reads it once the reader
 * is back on it: the shell's view for the board the pane was opened on, and the
 * whole of the board for one a level further down.
 * @param trail How the pane got here, from the board it was opened on.
 * @param ownView The view the shell has the pane read its own board through.
 * @returns The board, or null when the pane is on the board it was opened on.
 */
function levelAbove(
	trail: DrillNavigation["trail"],
	ownView: string | undefined,
): Destination | null {
	const above = trail.at(-1);
	if (above === undefined) {
		return null;
	}
	return {
		board: above.board,
		variant: above.variant,
		view: trail.length === 1 ? ownView : undefined,
	};
}

/**
 * The moves a pane makes between boards.
 * @param inputs Where the pane is looking, what it can fly, and what a move clears.
 * @returns Following a drill-down, and going back.
 */
function useDrillMoves(inputs: DrillMovesInputs): DrillMoves {
	const { drill, flier, leave, picked, ownView, onSelect, onUserChanged } = inputs;
	const { into, out } = flier;
	const above = useMemo(() => levelAbove(drill.trail, ownView), [drill.trail, ownView]);
	const onOpenDown = useCallback(
		(board: string, variant: string): void => {
			into(picked, { board, variant }, () => {
				leave("into", picked);
				onSelect(null);
				onUserChanged?.("board");
				drill.open(board, variant);
			});
		},
		[drill, into, leave, onSelect, onUserChanged, picked],
	);
	const onBack = useCallback((): void => {
		/** Go back the plain way. */
		const proceed = (): void => {
			leave("out");
			onSelect(null);
			onUserChanged?.("board");
			drill.back();
		};
		if (above === null) {
			proceed();
			return;
		}
		out(above, proceed);
	}, [above, drill, leave, onSelect, onUserChanged, out]);
	return { onOpenDown, onBack };
}

export { useDrillMoves };
