// The frame of a recording (TASK-304): one pane and nothing else, filling the
// page, which is what the tab capture takes. The pane reads it the way it
// reads a pane presented fullscreen, so its sidebar steps aside, and the
// caption drops controls nobody in a video can press. Behind it lies a layer
// nobody sees that repaints the whole frame every frame, so the capture sends
// frames at a steady rate (TASK-378, `recording-frame-pacer` in app.css).

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
			<div data-slot="recording-frame-pacer" aria-hidden className="recording-frame-pacer" />
		</main>
	);
}

export { RecordingStage, type RecordingStageProps };
