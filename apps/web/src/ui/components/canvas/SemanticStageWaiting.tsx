// What a semantic pane shows while its model is being drawn and nothing of
// that model has arrived yet.
//
// When the reader came from another model, that model's picture is still on
// the pane, leaving the way the reader went; otherwise the pane simply waits.
// The picture leaving is put up as the same diagram the next picture goes
// into, not a component of its own, so the arriving picture lands on the
// surface the last one is leaving from and can arrive over whatever of it is
// still on its way out.

import type { JSX } from "react";

import { SemanticDiagram } from "#ui/components/canvas/SemanticDiagram.tsx";
import { SemanticStageLoading } from "#ui/components/canvas/SemanticStageStates.tsx";
import type { Leaving } from "#ui/hooks/canvas/use-departure.ts";
import type { PictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";

/** What the waiting pane is drawn from. */
interface WaitingView {
	/** Which model is being drawn. */
	readonly drill: { readonly model: string };
	/** The last model's picture on its way out, or null. */
	readonly leaving: Leaving | null;
	/** The pane's camera, kept across the wait. */
	readonly camera: PictureCamera;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion?: boolean | undefined;
}

/** A picture on its way out cannot be picked from. */
function ignorePick(): void {
	// Nothing on a leaving picture is somebody's to pick.
}

/**
 * The pane while its model is drawn: the last model leaving, or the wait itself.
 * @param view The model being drawn, and what is leaving.
 * @returns The waiting stage.
 */
function waitingStage(view: WaitingView): JSX.Element {
	const { leaving } = view;
	if (leaving === null) {
		return <SemanticStageLoading model={view.drill.model} />;
	}
	return (
		<SemanticDiagram
			camera={view.camera}
			drawing={leaving.drawing}
			departure={leaving.departure}
			selection={null}
			onSelect={ignorePick}
			reading={null}
			reducedMotion={view.reducedMotion ?? false}
			group={null}
			veil={null}
		/>
	);
}

export { waitingStage };
