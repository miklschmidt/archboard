// The boards above the one on screen, as the header's breadcrumb lists them.
//
// While the pane is on the board it was opened on, they are where the navigator
// places that board. Once the reader has followed a drill-down, they are where
// the navigator places the board the pane was opened on, then every board the
// reader came down through. Each of those is a way back along the drill, not a
// way to open the board again: the pane is still on the board it was opened on,
// and only the drill moved.
//
// The way back is not read off the navigator's placing of the board on screen.
// A drill-down can run up a level or across, and a board that several boards
// link down to sits under only one of them. That placing can leave out the
// board the reader came from, and the pane would then offer no way back to it.
//
// Each board the reader came through is named as it names itself, with its
// level, from the document the pane read while that board was on screen.

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BoardPlace } from "@/ui/semantic-board-canvas/components/PaneHeader";
import type { DrillNavigation } from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import { readBoard } from "@/ui/semantic-board-canvas/lib/board-document";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";
import { usePaneVault } from "@/ui/semantic-board-canvas/hooks/use-pane-vault";

/** What a board calls itself, and its level. */
interface Named {
	readonly name: string;
	readonly level: string | undefined;
}

/**
 * What each board of the trail calls itself.
 * @param results The trail's documents, in the trail's order.
 * @returns Each board's name and level, or undefined while its document cannot be read.
 */
function namesOf(results: readonly { readonly data: unknown }[]): (Named | undefined)[] {
	return results.map((result) => {
		const read = readBoard(result.data);
		return read.ok ? { name: read.board.name, level: read.board.level } : undefined;
	});
}

/**
 * The boards above the one on screen, outermost first, each a way to it.
 * @param placeOf The boards above one as the navigator places them, when the shell can say.
 * @param drill The board on screen, and how the pane got there.
 * @param onBackTo Go back to the board at this depth of the trail.
 * @returns The places.
 */
function useDrillPlaces(
	placeOf: ((board: string) => readonly BoardPlace[]) | undefined,
	drill: Pick<DrillNavigation, "board" | "trail">,
	onBackTo: (depth: number) => void,
): readonly BoardPlace[] {
	const { board, trail } = drill;
	const vault = usePaneVault();
	const names = useQueries({
		queries: trail.map((stop) => semanticBoardDocumentQuery(vault, stop.board)),
		combine: namesOf,
	});
	return useMemo(() => {
		const own = trail[0]?.board ?? board;
		const passed = trail.map((stop, at) => ({
			name: names[at]?.name ?? stop.board,
			level: names[at]?.level,
			/** Go back to this board of the trail. */
			open: (): void => {
				onBackTo(at);
			},
		}));
		return [...(placeOf?.(own) ?? []), ...passed];
	}, [placeOf, board, trail, names, onBackTo]);
}

export { useDrillPlaces };
