// How long rendering a recorded talk frame by frame may wait on the page that
// draws it (TASK-381). The talk's own clock stands still while the page is
// waited on, so none of these is a length of the recording: each is how long
// a real wait may take before the page counts as stuck.

import { handed, span } from "#shared/constants/uses.ts";

/** Rendering a recorded talk frame by frame. */
const REPLAY = {
	/**
	 * How long one frame may take to become ready to capture: its fonts loaded,
	 * its picture drawn by the layout workers, and nothing left changing. It pulls
	 * against the first layout of a new view on a large model in a page that draws
	 * in software, which the render budget holds to about a second. Thirty seconds
	 * is a page that is not going to finish.
	 */
	"replay.frameReady": span(30_000, "the frame to be ready to capture"),
	/**
	 * How far before the talk's first frame the replay page puts the model up, so
	 * that the first frame shows it at rest, as the recording's first moment did.
	 * It pulls against the model's entrance, `picture.entry` (760 ms), which runs
	 * on the stepped clock through these frames without being captured.
	 */
	"replay.preroll": handed(1500),
};

export { REPLAY };
