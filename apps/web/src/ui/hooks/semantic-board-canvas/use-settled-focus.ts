// What the walkthrough step on screen asks of the picture, once the picture it
// asks about is the one on screen.
//
// A step told through another view asks the server for that view's picture,
// and until it arrives the pane is still showing the last one. A focus worked
// out against that picture would point the camera at whatever of the step's
// subjects the old view happens to draw, and light and veil those — then move
// again, and relight, when the right picture comes. So while the step's picture
// is on its way the pane keeps the focus it had, and moves once.

import { useMemo, useState } from "react";

import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	beatFocus,
	type BeatFocus,
} from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import type { WalkthroughBeatSchema } from "@archboard/board/content";
import type { z } from "zod";

type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/**
 * Whether the picture on screen is the reading a step asked for.
 * @param drawn The picture on screen, or null.
 * @param view The view asked for, or undefined for the whole variant.
 * @returns True when there is nothing still on its way.
 */
function readingArrived(drawn: SemanticDrawing | null, view: string | undefined): boolean {
	return drawn === null || (drawn.view?.id ?? undefined) === view;
}

/**
 * The focus a step asks for, held back while the picture it is about is still on its way.
 * @param beat The step on screen, or null.
 * @param drawn The picture on screen, or null.
 * @param view The view the pane has asked the server for, or undefined for the whole variant.
 * @param reading The variant the step belongs to, or null when it cannot be read.
 * @returns The focus.
 */
function useSettledFocus(
	beat: WalkthroughBeat | null,
	drawn: SemanticDrawing | null,
	view: string | undefined,
	reading: VariantReading | null,
): BeatFocus {
	const variant = reading?.variant ?? null;
	const fresh = useMemo(() => beatFocus(beat, drawn, variant), [beat, drawn, variant]);
	const arrived = readingArrived(drawn, view);
	const [settled, setSettled] = useState(fresh);
	// Held during render, as React asks for a value derived from the last one.
	if (arrived && settled !== fresh) {
		setSettled(fresh);
	}
	return arrived ? fresh : settled;
}

export { useSettledFocus };
