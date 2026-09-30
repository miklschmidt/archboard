// How long rendering a recorded talk frame by frame may wait on the page that
// draws it (TASK-381). The talk's own clock stands still while the page is
// waited on, so none of these is a length of the recording: each is how long
// a real wait may take before the page counts as stuck.

/**
 * How long one frame may take to become ready to capture: its fonts loaded,
 * its picture drawn by the layout workers, and nothing left changing. It pulls
 * against the first layout of a new view on a large board in a page that draws
 * in software, which the render budget holds to about a second. Thirty seconds
 * is a page that is not going to finish.
 */
const RECORDING_FRAME_READY_MS = 30_000;

/**
 * How far before the talk's first frame the replay page puts the board up, so
 * that the first frame shows it at rest, as the recording's first moment did.
 * It pulls against the board's entrance, PICTURE_ENTRY_MS (760 ms), which runs
 * on the stepped clock through these frames without being captured.
 */
const RECORDING_REPLAY_PREROLL_MS = 1500;

export { RECORDING_FRAME_READY_MS, RECORDING_REPLAY_PREROLL_MS };
