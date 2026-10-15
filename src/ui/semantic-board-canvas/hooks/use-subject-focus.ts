// Bringing one subject into the middle of the picture, close enough to read:
// the camera glides to fit it. A code warning asks this of its subject, and so
// does the About page's control that shows a row on the diagram. A subject the
// view on screen does not draw opens the whole board, and is fitted once that
// picture arrives.

import { useCallback, useEffect, useRef } from "react";

import { EXPLORING_MS } from "@/shared/timing/timing";
import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

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
	// The subject asked for while the picture on screen does not draw it.
	const pending = useRef<string | null>(null);
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
		if (pending.current !== null && focus(pending.current)) pending.current = null;
	}, [focus]);
	return useCallback(
		(id: string): void => {
			pending.current = focus(id) ? null : id;
			if (pending.current !== null) onView(null);
		},
		[focus, onView],
	);
}

export { useSubjectFocus };
