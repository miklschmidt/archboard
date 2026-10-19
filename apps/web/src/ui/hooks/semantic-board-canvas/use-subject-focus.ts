// Bringing one subject into the middle of the picture, close enough to read:
// the camera glides to fit it. A code warning asks this of its subject, and so
// does the About page's control that shows a row on the diagram. A subject the
// view on screen does not draw opens the whole board, and is fitted once that
// picture arrives.
//
// Whoever asks picks the subject out in the same moment, and a pick moves the
// camera in its own right: one made off the picture glides just far enough to
// show the part (use-reveal.ts), and a panel the pick floats over the picture
// moves it clear (use-clear-of-panel.ts). Both answer the pick's commit, so the
// fit is made in an effect after that commit, and the stage calls this after
// both, so the fit is the last move and not the first.

import { useCallback, useEffect, useRef, useState } from "react";

import { EXPLORING_MS } from "@archboard/timing";
import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { subjectBox } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** One ask to fit a subject: a new one each time, so asking for one subject again fits it again. */
interface Ask {
	readonly id: string;
}

/**
 * Fit the camera to a subject.
 * @param drawing The picture on screen, when one has arrived.
 * @param camera The pane's camera.
 * @param reducedMotion Whether the reader asked for no motion, which lands the camera at once.
 * @param onView Choose a view of the board: null for the whole board.
 * @returns Fit one subject, by its id.
 */
function useSubjectFocus(
	drawing: SemanticRender | undefined,
	camera: BoardCamera,
	reducedMotion: boolean,
	onView: (view: string | null) => void,
): (id: string) => void {
	const [ask, setAsk] = useState<Ask | null>(null);
	// The last ask the camera went to, and the last one the whole board was opened for.
	const fitted = useRef<Ask | null>(null);
	const widened = useRef<Ask | null>(null);
	const focus = useCallback(
		(id: string): boolean => {
			const box = drawing?.kind === "drawn" ? subjectBox(drawing.atlas, id) : null;
			return (
				box !== null &&
				camera.glide({ kind: "focus", rect: box }, reducedMotion ? 0 : EXPLORING_MS.reveal, true)
			);
		},
		[drawing, camera, reducedMotion],
	);
	useEffect(() => {
		if (ask === null || fitted.current === ask) return;
		if (focus(ask.id)) {
			fitted.current = ask;
		} else if (widened.current !== ask) {
			widened.current = ask;
			onView(null);
		}
	}, [ask, focus, onView]);
	return useCallback((id: string): void => {
		setAsk({ id });
	}, []);
}

export { useSubjectFocus };
