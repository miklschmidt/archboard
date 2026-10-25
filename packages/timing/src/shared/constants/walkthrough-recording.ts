// ── Recording a walkthrough (TASK-304) ────────────────────────────────────
//
// A recording presents one walkthrough in a page nobody is watching: the page
// moves to a step, the voice explains it, and once the voice has finished the
// page moves on. Every duration here is either a beat the video shows or a
// bound on waiting for something that may never come. The beats pull against
// the length of the video; the bounds pull against giving up on a voice that
// was only slow, which costs the whole recording.

/**
 * How long the page waits, from the moment it is opened, to be ready to
 * record: the pane registered and showing the board, the board drawn and at
 * rest, and the agent at a phase from which voice can start.
 *
 * A cold page fetches the bundle, lays the board out in its worker (Graphviz and
 * the renderer core in WebAssembly) and reads the workbench snapshot; a large board
 * takes a few seconds. It pulls against an agent that waits this long to be
 * told the server cannot record.
 */
const RECORDING_PAGE_READY_MS = 30_000;

/**
 * How long voice may take to go live once a recording starts: creating the
 * recording tab's conversation, the coordinator and the workhorse becoming
 * ready, and the realtime negotiation (`CODEX_REALTIME_START_MS`, 15 s, inside
 * it). Creating a conversation is the slow part, and every recording pays it:
 * the recording page is a tab session of its own (TASK-373).
 */
const RECORDING_VOICE_START_MS = 60_000;

/**
 * How long the board is shown whole once the talk has begun, before the
 * first step. The video opens on the overview and glides into the talk,
 * rather than beginning mid-flight.
 */
const RECORDING_LEAD_MS = 1200;

/**
 * How long the voice may take to begin explaining a step the page moved to.
 *
 * The step reaches the voice as speech once the pane reports it (the report's
 * debounce, `SELECTION_DEBOUNCE_MS`, then a round trip through Codex), and a
 * real voice began within about a second in the TASK-251 sessions. A voice
 * that says nothing for this long has not heard the step, and the recording
 * fails rather than showing a silent step.
 */
const RECORDING_SPEECH_START_MS = 20_000;

/**
 * How long the voice's output has to stay below speaking level, after its
 * line is final, before the page moves on.
 *
 * A line is final when the voice model ends its turn (`turn.done`), which may
 * come before the audio has finished playing, so the finished line alone is
 * not the end of the speech: the quiet is. It is also the pause the viewer
 * gets between two steps. It pulls against the length of the video.
 */
const RECORDING_QUIET_MS = 1200;

/**
 * The longest one step's explanation may run. A voice still talking about one
 * step after this has lost the step, and the recording fails with the reason.
 */
const RECORDING_STEP_MAX_MS = 180_000;

/**
 * How long the last step stays on screen after the voice has finished it,
 * before the talk ends, so the video ends on the picture, not on the last
 * syllable.
 */
const RECORDING_TAIL_MS = 1500;

/**
 * How long a finished talk waits for the voice's last samples to arrive from the audio thread
 * (TASK-381). The tap passes on each render quantum as it plays, so what is outstanding at the end
 * is a few quanta of 2.7 ms in flight between threads; a second is an audio thread that stopped,
 * and the talk then ends in the silence it already has.
 */
const RECORDING_TAP_DRAIN_MS = 1000;

/**
 * How often the page decides whether to move on. It reads the voice's output
 * level and transcript, both already in memory; a tenth of a second is below
 * what a viewer notices in a pause.
 */
const RECORDING_PACE_TICK_MS = 100;

/**
 * How often the recorder reads the page's state. The page's own pacing does
 * not depend on it; this only decides how promptly progress is reported.
 */
const RECORDING_POLL_MS = 250;

/**
 * How long the recorder waits for its private Chromium to start and answer on
 * DevTools. A cold start of a headless browser on a loaded machine takes a
 * few seconds; this is the bound past which it is not coming.
 */
const RECORDING_BROWSER_START_MS = 15_000;

/**
 * How long one DevTools call into the recording page may take: reading its
 * state, starting it, asking for its file. Each is a function call in a page
 * that is otherwise busy drawing; seconds mean the page is stuck.
 */
const RECORDING_CALL_MS = 10_000;

/**
 * How long the recorder waits for the page's state to change before it
 * decides the page is stuck. The page bounds every wait of its own, and the
 * longest a live page stays on one state is a step's explanation
 * (`RECORDING_STEP_MAX_MS`) or getting voice live (`RECORDING_VOICE_START_MS`),
 * so this is both: past it the page has stopped keeping its own bounds.
 */
const RECORDING_STALL_MS = RECORDING_STEP_MAX_MS + RECORDING_VOICE_START_MS;

/**
 * How long each call that takes the finished talk out of the page may take:
 * resolving the voice's WAV file and every one-megabyte read of it, and
 * reading the log (TASK-381). The stream as a whole has no bound of its own;
 * ten minutes of voice is about 58 MB, sixty reads, and a 200 MB file streamed
 * in 1.5 s when measured for TASK-304, so a read that takes seconds has stuck.
 * It pulls against a page still building the WAV file when the first read
 * arrives.
 */
const RECORDING_FILE_READ_MS = 30_000;

/**
 * How long the recorder waits for its Chromium's process group to be gone
 * once it has asked it to stop.
 */
const RECORDING_BROWSER_STOP_MS = 5000;

/**
 * How long asking an ffmpeg on disk which encoders it has may take, before the recorder starts a
 * browser (TASK-381). It pulls against a binary that is already there: it answers in well under
 * a second, so ten seconds is an ffmpeg that has stuck, on a disk that is not answering.
 */
const RECORDING_ENCODER_PROBE_MS = 10_000;

/**
 * How long the first ffmpeg run through nix may take, fetching the package (TASK-381). It pulls
 * against a download of ffmpeg-headless and what it needs from the binary cache, which is
 * minutes on a slow link and seconds once it is in the store. Past this, nix is offline or stuck.
 */
const RECORDING_NIX_FETCH_MS = 300_000;

/**
 * How long one call into the replay page that draws a frame may take: loading a talk, or drawing
 * a frame of it (TASK-381). The page bounds its own wait for a frame to be ready at 30 s
 * (`RECORDING_FRAME_READY_MS`) and rejects with what was pending; this is a margin above that,
 * so the page's reason reaches the caller, and the call only times out on a page that has
 * stopped answering. It pulls against a render that waits on a hung page, frame after frame.
 */
const RECORDING_FRAME_CALL_MS = 45_000;

/**
 * How long ffmpeg may take to finish the file once the last frame is written and its input is
 * closed (TASK-381). Frames are encoded as they arrive, so what is left is the tail of the
 * encoder's queue and, for a MP4, moving its index to the front of the file, which is seconds
 * for a talk of minutes; VP9 holds more frames back than x264 does. Past this, ffmpeg has
 * stuck. It pulls against a long talk on a slow machine, where the queue is the longest.
 */
const RECORDING_ENCODE_FINISH_MS = 120_000;

export {
	RECORDING_ENCODE_FINISH_MS,
	RECORDING_ENCODER_PROBE_MS,
	RECORDING_FRAME_CALL_MS,
	RECORDING_NIX_FETCH_MS,
	RECORDING_TAP_DRAIN_MS,
	RECORDING_BROWSER_START_MS,
	RECORDING_BROWSER_STOP_MS,
	RECORDING_CALL_MS,
	RECORDING_FILE_READ_MS,
	RECORDING_STALL_MS,
	RECORDING_LEAD_MS,
	RECORDING_PACE_TICK_MS,
	RECORDING_PAGE_READY_MS,
	RECORDING_POLL_MS,
	RECORDING_QUIET_MS,
	RECORDING_SPEECH_START_MS,
	RECORDING_STEP_MAX_MS,
	RECORDING_TAIL_MS,
	RECORDING_VOICE_START_MS,
};
