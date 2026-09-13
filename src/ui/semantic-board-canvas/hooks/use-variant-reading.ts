// What the pane knows about the board behind the picture: which variants it
// holds, which one is on screen, and what that one explains about itself.
//
// It comes from the board document — the same read the inspector goes through —
// because a render answer says which variant it drew and not which others the
// board has, and carries the board's views and not the variant's narrative. The read is
// cached per board and invalidated by the board's own change announcement, so
// two panes on one board share it and a pane pays for it once.
//
// Nothing here writes. The browser never states anything about a semantic
// board (ADR 0023); it reads one, and says which part of it a person is
// looking at.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { readVariant, type VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";

/**
 * The board behind one pane's picture.
 * @param board The board on screen.
 * @param variant The variant on screen: an id or name, or undefined for the
 *   current one.
 * @returns The reading, or null while the board has not arrived or cannot be read.
 */
function useVariantReading(board: string, variant: string | undefined): VariantReading | null {
	const held = useQuery(semanticBoardDocumentQuery(board));
	const answer = held.data;
	return useMemo(() => readVariant(answer, variant), [answer, variant]);
}

export { useVariantReading };
