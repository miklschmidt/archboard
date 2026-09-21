// Telling the shell what a pane is reading, and only when that changes.

import { useEffect } from "react";

import type { SemanticPaneReading } from "@/ui/semantic-board-canvas/lib/address";

/**
 * Tell whoever is listening what this pane is reading, when it changes.
 *
 * Only when it changes. A pane re-renders for every hover and every camera
 * move, and a shell told the same four values sixty times a second would
 * publish sixty identical readings for anybody downstream to filter.
 * @param report Who to tell, when anybody is listening.
 * @param reading What the pane is reading now.
 */
function useReported(
	report: ((reading: SemanticPaneReading) => void) | undefined,
	reading: SemanticPaneReading,
): void {
	const { board, variant, view, selection, drawn, presentation } = reading;
	useEffect(() => {
		report?.({ board, variant, view, selection, drawn, presentation });
	}, [report, board, variant, view, selection, drawn, presentation]);
}

export { useReported };
