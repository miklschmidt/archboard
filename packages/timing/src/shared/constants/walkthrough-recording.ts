// ── Recording a walkthrough (TASK-304) ────────────────────────────────────
//
// A recording presents one walkthrough in a page nobody is watching: the page
// moves to a step, the voice explains it, and once the voice has finished the
// page moves on. Every duration here is either a beat the video shows or a
// bound on waiting for something that may never come. The beats pull against
// the length of the video; the bounds pull against giving up on a voice that
// was only slow, which costs the whole recording.

import { delay, handed, polled, span, tick } from "#shared/constants/uses.ts";

/** `recording.stepMax`, named once so that a recorder's stall can be measured against it. */
const STEP_MAX_MS = 180_000;

/** `recording.voiceStart`, named once so that a recorder's stall can be measured against it. */
const VOICE_START_MS = 60_000;

/** `recorder.pageReady`, named once so that loading a reading into the page waits as long. */
const PAGE_READY_MS = 30_000;

/** The recording page's own pace: a step, the voice over it, and the beats between. */
const RECORDING = {
	/**
	 * How long voice may take to go live once a recording starts: creating the
	 * recording tab's conversation, the coordinator and the workhorse becoming
	 * ready, and the realtime negotiation (`codex.realtimeStart`, 15 s, inside
	 * it). Creating a conversation is the slow part, and every recording pays it:
	 * the recording page is a tab session of its own (TASK-373).
	 */
	"recording.voiceStart": span(VOICE_START_MS, "voice to go live"),
	/**
	 * How long the model is shown whole once the talk has begun, before the
	 * first step. The video opens on the overview and glides into the talk,
	 * rather than beginning mid-flight.
	 */
	"recording.lead": span(1200),
	/**
	 * How long the voice may take to begin explaining a step the page moved to.
	 *
	 * The step reaches the voice as speech once the pane reports it (the report's
	 * debounce, `pane.selectionDebounce`, then a round trip through Codex), and a
	 * real voice began within about a second in the TASK-251 sessions. A voice
	 * that says nothing for this long has not heard the step, and the recording
	 * fails rather than showing a silent step.
	 */
	"recording.speechStart": span(20_000, "the voice to begin explaining the step"),
	/**
	 * How long the voice's output has to stay below speaking level, after its
	 * line is final, before the page moves on.
	 *
	 * A line is final when the voice model ends its turn (`turn.done`), which may
	 * come before the audio has finished playing, so the finished line alone is
	 * not the end of the speech: the quiet is. It is also the pause the viewer
	 * gets between two steps. It pulls against the length of the video.
	 */
	"recording.quiet": span(1200),
	/**
	 * The longest one step's explanation may run. A voice still talking about one
	 * step after this has lost the step, and the recording fails with the reason.
	 */
	"recording.stepMax": span(STEP_MAX_MS, "the voice to finish explaining the step"),
	/**
	 * How long the last step stays on screen after the voice has finished it,
	 * before the talk ends, so the video ends on the picture, not on the last
	 * syllable.
	 */
	"recording.tail": span(1500),
	/**
	 * How long a finished talk waits for the voice's last samples to arrive from the audio thread
	 * (TASK-381). The tap passes on each render quantum as it plays, so what is outstanding at the end
	 * is a few quanta of 2.7 ms in flight between threads; a second is an audio thread that stopped,
	 * and the talk then ends in the silence it already has.
	 */
	"recording.tapDrain": span(1000),
	/**
	 * How much of the voice the recording's browser holds before playing it: the WebRTC receiver's
	 * `jitterBufferTarget`. The voice's packets come unevenly at the start of each sentence. With
	 * the browser's own conversational target, the buffer is 30 to 50 ms between sentences, and a
	 * recording on 2026-11-03 ran dry nine times in 83 s: 1.5 s of the voice was invented and
	 * 1.8 s was stretched, which a listener hears as a call with bad reception. The buffer then
	 * grew to between 200 and 650 ms. Nobody talks back to a recording, so it starts with that
	 * much and loses nothing but latency.
	 */
	"recording.voiceBuffer": handed(600),
	/**
	 * How often the page decides whether to move on. It reads the voice's output
	 * level and transcript, both already in memory; a tenth of a second is below
	 * what a viewer notices in a pause.
	 */
	"recording.paceTick": tick(100),
};

/** The recorder process: the browser it drives, the page it waits on, and the encoder. */
const RECORDER = {
	/**
	 * How long the page waits, from the moment it is opened, to be ready to
	 * record: the pane registered and showing the model, the model drawn and at
	 * rest, and the agent at a phase from which voice can start.
	 *
	 * A cold page fetches the bundle, lays the model out in its worker (Graphviz and
	 * the renderer core in WebAssembly) and reads the workbench snapshot; a large model
	 * takes a few seconds. It pulls against an agent that waits this long to be
	 * told the server cannot record.
	 */
	"recorder.pageReady": polled(PAGE_READY_MS, "the canvas page to be ready to record"),
	/** Loading a reading into a page that may not offer it yet, within the page's readiness. */
	"recorder.pageLoad": polled(PAGE_READY_MS, "the canvas page to offer canonical playback"),
	/** A replay page publishing its replay, within the page's readiness. */
	"recorder.replayReady": polled(PAGE_READY_MS, "the canvas page to offer a replay"),
	/**
	 * How long one DevTools call into the recording page may take: reading its
	 * state, starting it, asking for its file. Each is a function call in a page
	 * that is otherwise busy drawing; seconds mean the page is stuck.
	 */
	"recorder.call": handed(10_000),
	/**
	 * How long the recorder waits for the page's state to change before it
	 * decides the page is stuck. The page bounds every wait of its own, and the
	 * longest a live page stays on one state is a step's explanation
	 * (`recording.stepMax`) or getting voice live (`recording.voiceStart`),
	 * so this is both: past it the page has stopped keeping its own bounds.
	 */
	"recorder.stall": polled(STEP_MAX_MS + VOICE_START_MS, "the canvas page to report progress"),
	/**
	 * How long each call that takes the finished talk out of the page may take:
	 * resolving the voice's WAV file and every one-megabyte read of it, and
	 * reading the log (TASK-381). The stream as a whole has no bound of its own;
	 * ten minutes of voice is about 58 MB, sixty reads, and a 200 MB file streamed
	 * in 1.5 s when measured for TASK-304, so a read that takes seconds has stuck.
	 * It pulls against a page still building the WAV file when the first read
	 * arrives.
	 */
	"recorder.fileRead": handed(30_000),
	/**
	 * How long asking an ffmpeg on disk which encoders it has may take, before the recorder starts a
	 * browser (TASK-381). It pulls against a binary that is already there: it answers in well under
	 * a second, so ten seconds is an ffmpeg that has stuck, on a disk that is not answering.
	 */
	"recorder.encoderProbe": handed(10_000),
	/**
	 * How long the first ffmpeg run through nix may take, fetching the package (TASK-381). It pulls
	 * against a download of ffmpeg-headless and what it needs from the binary cache, which is
	 * minutes on a slow link and seconds once it is in the store. Past this, nix is offline or stuck.
	 */
	"recorder.nixFetch": handed(300_000),
	/**
	 * How long one call into the replay page that draws a frame may take: loading a talk, or drawing
	 * a frame of it (TASK-381). The page bounds its own wait for a frame to be ready at 30 s
	 * (`replay.frameReady`) and rejects with what was pending; this is a margin above that,
	 * so the page's reason reaches the caller, and the call only times out on a page that has
	 * stopped answering. It pulls against a render that waits on a hung page, frame after frame.
	 */
	"recorder.frameCall": handed(45_000),
	/**
	 * How long ffmpeg may take to finish the file once the last frame is written and its input is
	 * closed (TASK-381). Frames are encoded as they arrive, so what is left is the tail of the
	 * encoder's queue and, for a MP4, moving its index to the front of the file, which is seconds
	 * for a talk of minutes; VP9 holds more frames back than x264 does. Past this, ffmpeg has
	 * stuck. It pulls against a long talk on a slow machine, where the queue is the longest.
	 */
	"recorder.encodeFinish": delay(120_000, "ffmpeg to finish the file"),
};

export { RECORDER, RECORDING };
