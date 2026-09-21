// Where a presented walkthrough has got to, as the pane reports it.
//
// The position is the pane's own (ADR 0023) and this only says it: which step
// is on screen, whether it has finished arriving, and whether a person or a
// request put it there. Something narrating the presentation follows the
// picture by reading this, and never by being told where the picture should be.

import { useMemo, useState } from "react";

import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { PanePresentation } from "@/ui/semantic-board-canvas/lib/address";

/** A presentation's position, and what the surface needs to say when it arrives. */
interface PresentationPosition {
	/** The position to report, or null when nothing is presented. */
	readonly position: PanePresentation | null;
	/** What the surface was asked to show, or null while there is nothing to arrive on. */
	readonly arrivalKey: string | null;
	/**
	 * The surface came to rest, or moved again.
	 * @param key The key it rests on, or null while it is moving.
	 */
	readonly onSettled: (key: string | null) => void;
}

/**
 * What the surface of a presented step has to come to rest on.
 *
 * The step, and the picture it is read through: a step told through another
 * view is on its way until that view's picture is the one drawn, and a new
 * version of the board is a new picture to arrive on.
 * @param narrative What is being read.
 * @param drawn The picture on screen, or null.
 * @param view The view the step asks for, or undefined for the whole variant.
 * @returns The key, or null while nothing is presented or the picture is on its way.
 */
function arrivalKeyOf(
	narrative: WalkthroughReading,
	drawn: SemanticDrawing | null,
	view: string | undefined,
): string | null {
	const { open, beatIndex } = narrative;
	if (open === null || drawn === null || drawn.view?.id !== view) {
		return null;
	}
	return JSON.stringify([open.id, beatIndex, drawn.view?.id, drawn.version]);
}

/**
 * Where a presented walkthrough has got to, and whether it has arrived there.
 * @param narrative What is being read.
 * @param drawn The picture on screen, or null.
 * @param view The view the step asks for, or undefined for the whole variant.
 * @returns The position, the key to arrive on, and how the surface says it has.
 */
function usePresentationPosition(
	narrative: WalkthroughReading,
	drawn: SemanticDrawing | null,
	view: string | undefined,
): PresentationPosition {
	const [settled, onSettled] = useState<string | null>(null);
	const arrivalKey = arrivalKeyOf(narrative, drawn, view);
	const { open, beatIndex, answering } = narrative;
	const arrived = arrivalKey !== null && arrivalKey === settled;
	const position = useMemo(
		(): PanePresentation | null =>
			open === null
				? null
				: { walkthrough: open.id, beat: beatIndex, of: open.beats.length, arrived, answering },
		[open, beatIndex, arrived, answering],
	);
	return useMemo(() => ({ position, arrivalKey, onSettled }), [position, arrivalKey]);
}

export { usePresentationPosition, type PresentationPosition };
