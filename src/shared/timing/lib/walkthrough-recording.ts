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
 * libavoid in WebAssembly) and reads the workbench snapshot; a large board
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
 * How long the board is shown whole once capture has started, before the
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
 * before capture stops, so the video ends on the picture, not on the last
 * syllable.
 */
const RECORDING_TAIL_MS = 1500;

/**
 * How long a page that has just captured its tab waits for the browser to draw the bar that says
 * the tab is being shared. The bar takes room from the page (56 px on Chromium 153), and the
 * recorder gives it back before anything is written; the bar appeared 121 ms after the capture
 * began in every measurement on 2026-09-23. A browser that draws no bar costs this wait once.
 */
const RECORDING_CAPTURE_BAR_MS = 2000;

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
 * How long each call that streams the finished file out of the page may
 * take: resolving the file, then every one-megabyte read of it. The stream as
 * a whole has no bound of its own; a ten-minute recording at the capture's
 * bit rate is a few hundred reads, and a 200 MB file streamed in 1.5 s when
 * measured for TASK-304, so a read that takes seconds has stuck. It pulls
 * against a page still busy finishing the file when the first read arrives.
 */
const RECORDING_FILE_READ_MS = 30_000;

/**
 * How long the recorder waits for its Chromium's process group to be gone
 * once it has asked it to stop.
 */
const RECORDING_BROWSER_STOP_MS = 5000;

/**
 * How long converting a finished MP4's sound to AAC may take (TASK-305). The
 * picture is copied, not encoded again, so only the sound is work: seconds for
 * a ten-minute talk. Past this, the file keeps the sound it was recorded with.
 */
const RECORDING_SOUND_CONVERT_MS = 120_000;

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

export {
	RECORDING_ENCODER_PROBE_MS,
	RECORDING_NIX_FETCH_MS,
	RECORDING_SOUND_CONVERT_MS,
	RECORDING_CAPTURE_BAR_MS,
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
