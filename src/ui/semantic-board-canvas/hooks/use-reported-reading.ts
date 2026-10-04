// Telling the shell what a pane is reading, and only when that changes.

import { useEffect, useMemo } from "react";

import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { PanePresentation, SemanticPaneReading } from "@/ui/semantic-board-canvas/lib/address";

/** What the pane has on screen, as it knows it. */
interface OnScreen {
	/** The board on screen, which is the drilled-into one when there is one. */
	readonly board: string;
	/** The server's answer for that board, once there is one. */
	readonly answer: SemanticRender | undefined;
	/** The view it is being read through, or undefined for the whole variant. */
	readonly view: string | undefined;
	/** What is selected on that board, or null when nothing is. */
	readonly selection: string | null;
	/** Where a presented walkthrough has got to, or null when none is presented. */
	readonly presentation: PanePresentation | null;
}

/**
 * Tell whoever is listening what this pane is reading, when it changes.
 *
 * Only when it changes. A pane re-renders for every hover and every camera
 * move, and a shell told the same four values sixty times a second would
 * publish sixty identical readings for anybody downstream to filter.
 * @param report Who to tell, when anybody is listening.
 * @param onScreen What the pane has on screen now.
 */
function useReported(
	report: ((reading: SemanticPaneReading) => void) | undefined,
	onScreen: OnScreen,
): void {
	const { board, answer, selection, presentation } = onScreen;
	// Empty views retain their resolved identity for the pane and its address.
	const drawn = useMemo(
		() =>
			answer === undefined
				? null
				: { variant: answer.variant, view: answer.view, version: answer.version },
		[answer],
	);
	// The variant the server resolved, not the one that was asked for: the pane
	// asks for "whichever is current" constantly, and "current" is not something
	// a shell can hand to anybody as what is being looked at.
	const variant = answer?.variant.id ?? null;
	const view = onScreen.view ?? null;
	useEffect(() => {
		report?.({ board, variant, view, selection, drawn, presentation });
	}, [report, board, variant, view, selection, drawn, presentation]);
}

export { useReported };
