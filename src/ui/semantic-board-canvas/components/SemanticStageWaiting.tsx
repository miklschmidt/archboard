// What a semantic pane shows while its board is being drawn and nothing of
// that board has arrived yet.
//
// When the reader came from another board, that board's picture is still on
// the pane, leaving the way the reader went; otherwise the pane simply waits.
// The picture leaving is put up as the same diagram the next picture goes
// into, not a component of its own, so the arriving picture lands on the
// surface the last one is leaving from and can arrive over whatever of it is
// still on its way out.

import type { JSX } from "react";

import { SemanticDiagram } from "@/ui/semantic-board-canvas/components/SemanticDiagram";
import type { GroupControls } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import { SemanticStageLoading } from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import type { Leaving } from "@/ui/semantic-board-canvas/hooks/use-departure";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";

/** What the waiting pane is drawn from. */
interface WaitingView {
	/** Which board is being drawn. */
	readonly drill: { readonly board: string };
	/** The last board's picture on its way out, or null. */
	readonly leaving: Leaving | null;
	/** The pane's camera, kept across the wait. */
	readonly camera: BoardCamera;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion?: boolean | undefined;
	/** How the inspector names memberships; nothing on a leaving picture opens it. */
	readonly groupControls: GroupControls;
}

/** A picture on its way out cannot be picked from. */
function ignorePick(): void {
	// Nothing on a leaving picture is somebody's to pick.
}

/** Nor opened from. */
function ignoreOpen(): void {
	// Nothing on a leaving picture opens anything.
}

/**
 * The pane while its board is drawn: the last board leaving, or the wait itself.
 * @param view The board being drawn, and what is leaving.
 * @returns The waiting stage.
 */
function waitingStage(view: WaitingView): JSX.Element {
	const { leaving } = view;
	if (leaving === null) {
		return <SemanticStageLoading board={view.drill.board} />;
	}
	return (
		<SemanticDiagram
			camera={view.camera}
			drawing={leaving.drawing}
			departure={leaving.departure}
			selection={null}
			onSelect={ignorePick}
			reducedMotion={view.reducedMotion ?? false}
			onOpenDown={ignoreOpen}
			groupId={null}
			groupMarks={null}
			groupControls={view.groupControls}
		/>
	);
}

export { waitingStage };
