// ── Recording a walkthrough (TASK-304) ────────────────────────────────────
//
// A recording presents one walkthrough in a page nobody is watching: the page
// moves to a step, the voice explains it, and once the voice has finished the
// page moves on. Every duration here is either a beat the video shows or a
// bound on waiting for something that may never come. The beats pull against
// the length of the video; the bounds pull against giving up on a voice that
// was only slow, which costs the whole recording.

import { durations } from "#shared/constants/durations.ts";

/** The recording page's own pace: a step, the voice over it, and the beats between. */
const RECORDING_MS = durations({
	/**
	 * How long voice may take to go live once a recording starts: creating the
	 * recording tab's conversation, the coordinator and the workhorse becoming
	 * ready, and the realtime negotiation (`CODEX_REALTIME_MS.start`, 15 s, inside
	 * it). Creating a conversation is the slow part, and every recording pays it:
	 * the recording page is a tab session of its own (TASK-373).
	 */
	voiceStart: 60_000,
	/**
	 * How long the board is shown whole once the talk has begun, before the
	 * first step. The video opens on the overview and glides into the talk,
	 * rather than beginning mid-flight.
	 */
	lead: 1200,
	/**
	 * How long the voice may take to begin explaining a step the page moved to.
	 *
	 * The step reaches the voice as speech once the pane reports it (the report's
	 * debounce, `PANE_MS.selectionDebounce`, then a round trip through Codex), and a
	 * real voice began within about a second in the TASK-251 sessions. A voice
	 * that says nothing for this long has not heard the step, and the recording
	 * fails rather than showing a silent step.
	 */
	speechStart: 20_000,
	/**
	 * How long the voice's output has to stay below speaking level, after its
	 * line is final, before the page moves on.
	 *
	 * A line is final when the voice model ends its turn (`turn.done`), which may
	 * come before the audio has finished playing, so the finished line alone is
	 * not the end of the speech: the quiet is. It is also the pause the viewer
	 * gets between two steps. It pulls against the length of the video.
	 */
	quiet: 1200,
	/**
	 * The longest one step's explanation may run. A voice still talking about one
	 * step after this has lost the step, and the recording fails with the reason.
	 */
	stepMax: 180_000,
	/**
	 * How long the last step stays on screen after the voice has finished it,
	 * before the talk ends, so the video ends on the picture, not on the last
	 * syllable.
	 */
	tail: 1500,
	/**
	 * How long a finished talk waits for the voice's last samples to arrive from the audio thread
	 * (TASK-381). The tap passes on each render quantum as it plays, so what is outstanding at the end
	 * is a few quanta of 2.7 ms in flight between threads; a second is an audio thread that stopped,
	 * and the talk then ends in the silence it already has.
	 */
	tapDrain: 1000,
	/**
	 * How often the page decides whether to move on. It reads the voice's output
	 * level and transcript, both already in memory; a tenth of a second is below
	 * what a viewer notices in a pause.
	 */
	paceTick: 100,
});

/** The recorder process: the browser it drives, the page it waits on, and the encoder. */
const RECORDER_MS = durations({
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
	pageReady: 30_000,
	/**
	 * How often the recorder reads the page's state. The page's own pacing does
	 * not depend on it; this only decides how promptly progress is reported.
	 */
	poll: 250,
	/**
	 * How long the recorder waits for its private Chromium to start and answer on
	 * DevTools. A cold start of a headless browser on a loaded machine takes a
	 * few seconds; this is the bound past which it is not coming.
	 */
	browserStart: 15_000,
	/**
	 * How long one DevTools call into the recording page may take: reading its
	 * state, starting it, asking for its file. Each is a function call in a page
	 * that is otherwise busy drawing; seconds mean the page is stuck.
	 */
	call: 10_000,
	/**
	 * How long the recorder waits for the page's state to change before it
	 * decides the page is stuck. The page bounds every wait of its own, and the
	 * longest a live page stays on one state is a step's explanation
	 * (`RECORDING_MS.stepMax`) or getting voice live (`RECORDING_MS.voiceStart`),
	 * so this is both: past it the page has stopped keeping its own bounds.
	 */
	stall: RECORDING_MS.stepMax + RECORDING_MS.voiceStart,
	/**
	 * How long each call that takes the finished talk out of the page may take:
	 * resolving the voice's WAV file and every one-megabyte read of it, and
	 * reading the log (TASK-381). The stream as a whole has no bound of its own;
	 * ten minutes of voice is about 58 MB, sixty reads, and a 200 MB file streamed
	 * in 1.5 s when measured for TASK-304, so a read that takes seconds has stuck.
	 * It pulls against a page still building the WAV file when the first read
	 * arrives.
	 */
	fileRead: 30_000,
	/**
	 * How long the recorder waits for its Chromium's process group to be gone
	 * once it has asked it to stop.
	 */
	browserStop: 5000,
	/**
	 * How long asking an ffmpeg on disk which encoders it has may take, before the recorder starts a
	 * browser (TASK-381). It pulls against a binary that is already there: it answers in well under
	 * a second, so ten seconds is an ffmpeg that has stuck, on a disk that is not answering.
	 */
	encoderProbe: 10_000,
	/**
	 * How long the first ffmpeg run through nix may take, fetching the package (TASK-381). It pulls
	 * against a download of ffmpeg-headless and what it needs from the binary cache, which is
	 * minutes on a slow link and seconds once it is in the store. Past this, nix is offline or stuck.
	 */
	nixFetch: 300_000,
	/**
	 * How long one call into the replay page that draws a frame may take: loading a talk, or drawing
	 * a frame of it (TASK-381). The page bounds its own wait for a frame to be ready at 30 s
	 * (`REPLAY_MS.frameReady`) and rejects with what was pending; this is a margin above that,
	 * so the page's reason reaches the caller, and the call only times out on a page that has
	 * stopped answering. It pulls against a render that waits on a hung page, frame after frame.
	 */
	frameCall: 45_000,
	/**
	 * How long ffmpeg may take to finish the file once the last frame is written and its input is
	 * closed (TASK-381). Frames are encoded as they arrive, so what is left is the tail of the
	 * encoder's queue and, for a MP4, moving its index to the front of the file, which is seconds
	 * for a talk of minutes; VP9 holds more frames back than x264 does. Past this, ffmpeg has
	 * stuck. It pulls against a long talk on a slow machine, where the queue is the longest.
	 */
	encodeFinish: 120_000,
});

export { RECORDING_MS, RECORDER_MS };
