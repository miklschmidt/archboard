// The frame of a recording (TASK-304): one pane and nothing else, filling the
// page, which is the picture a recording's frames are rendered from (TASK-381).
// The pane reads it the way it reads a pane presented fullscreen, so its
// sidebar steps aside, and the caption drops controls nobody in a video can
// press.

import type { JSX, ReactNode } from "react";

/** Inputs for the frame. */
interface RecordingStageProps {
	/** The recorded pane. */
	readonly children: ReactNode;
}

/**
 * One pane, filling the page.
 * @param props The pane.
 * @returns The frame.
 */
function RecordingStage(props: RecordingStageProps): JSX.Element {
	return (
		<main
			data-slot="recording-stage"
			data-recording=""
			data-presenting=""
			className="bg-background flex h-screen w-screen overflow-hidden"
		>
			{props.children}
		</main>
	);
}

export { RecordingStage, type RecordingStageProps };
