// Bringing one subject into the middle of the picture, close enough to read:
// the camera glides to fit it. A code warning asks this of its subject, and so
// does the About page's control that shows a row on the diagram. A step through
// a design question's answer asks for its subject with the parts around it,
// which the fit takes in where the picture draws them, nearest first, while
// their cards still read (READ_SCALE). A subject the view on
// screen does not draw opens Everything, the reading of the whole board, and is
// fitted once that picture arrives. The Overview, which a pane with no view
// reads, draws every container closed (ADR 0052), so it hides most parts.
//
// Whoever asks picks the subject out in the same moment, and a pick moves the
// camera in its own right: one made off the picture glides just far enough to
// show the part (use-reveal.ts), and a panel the pick floats over the picture
// moves it clear (use-clear-of-panel.ts). Both answer the pick's commit, so the
// fit is made in an effect after that commit, and the stage calls this after
// both, so the fit is the last move and not the first.

import { useCallback, useEffect, useRef, useState } from "react";

import { EVERYTHING_VIEW } from "@archboard/board/views";
import { EXPLORING_MS } from "@archboard/timing";
import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import type { ViewChange } from "#ui/hooks/semantic-board-canvas/use-level-reading.ts";
import { subjectBox } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";
import type { FitTarget } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** One ask to fit a subject: a new one each time, so asking for one subject again fits it again. */
interface Ask {
	readonly id: string;
	/** The parts to fit with it, where the picture draws them. */
	readonly around: readonly string[];
}

/**
 * What the camera fits for an ask: its subject, with the parts around it.
 * @param drawing The picture on screen, when one has arrived.
 * @param ask The subject and the parts around it.
 * @returns The fit, or null when the picture does not draw the subject.
 */
function targetOf(drawing: SemanticRender | undefined, ask: Ask): FitTarget | null {
	if (drawing?.kind !== "drawn") return null;
	const { atlas } = drawing;
	const subject = subjectBox(atlas, ask.id);
	const around = ask.around.flatMap((id) => subjectBox(atlas, id) ?? []);
	return subject === null ? null : { kind: "around", subject, around };
}

/**
 * Fit the camera to a subject.
 * @param drawing The picture on screen, when one has arrived.
 * @param camera The pane's camera.
 * @param reducedMotion Whether the reader asked for no motion, which lands the camera at once.
 * @param onView Choose a view of the board, by its id.
 * @returns Fit one subject, by its id, with any parts around it.
 */
function useSubjectFocus(
	drawing: SemanticRender | undefined,
	camera: BoardCamera,
	reducedMotion: boolean,
	onView: ViewChange,
): (id: string, around?: readonly string[]) => void {
	const [ask, setAsk] = useState<Ask | null>(null);
	// The last ask the camera went to, and the last one Everything was opened for.
	const fitted = useRef<Ask | null>(null);
	const widened = useRef<Ask | null>(null);
	const focus = useCallback(
		(target: Ask): boolean => {
			const fit = targetOf(drawing, target);
			return fit !== null && camera.glide(fit, reducedMotion ? 0 : EXPLORING_MS.reveal, true);
		},
		[drawing, camera, reducedMotion],
	);
	useEffect(() => {
		if (ask === null || fitted.current === ask) return;
		if (focus(ask)) {
			fitted.current = ask;
		} else if (widened.current !== ask) {
			widened.current = ask;
			onView(EVERYTHING_VIEW.id, "reveal");
		}
	}, [ask, focus, onView]);
	return useCallback((id: string, around: readonly string[] = []): void => {
		setAsk({ id, around });
	}, []);
}

export { useSubjectFocus };
