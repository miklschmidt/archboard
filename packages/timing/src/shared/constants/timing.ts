// Every duration that decides when a change is flushed, when a board is
// considered still, and how long anybody waits for either.
//
// They used to sit next to the code that consumed them, five in the pane's
// session hook, two in the change feed, two in the server's pane routes and
// two in the injection config. Read one at a time they all look independent,
// and they are not. ADR 0016 is where that stopped being tolerable:
//
//     A person's edit has two flush deadlines and a leading-edge hold. The
//     fixed progress deadline bounds how long continuous work stays only in
//     the pane; the longer idle deadline produces the final settled write.
//     Shortening either writes to the vault more often. Lengthening either
//     extends how long the human hold delays an agent.
//
// So they live here, with what pulls against what written beside them. Nothing
// in this file has behaviour. It is numbers and the reasons for them, and the
// reasons are the point: the next person to halve one of these should not have
// to discover by accident what else they halved. Some groups are large enough
// to read on their own: holding a board, the motion a person watches rather than
// waits out, and recording a walkthrough. Each sits in a file beside this one and
// is re-exported below.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read.

// ── A user's edits reaching the server ────────────────────────────────────

/**
 * The fixed deadline from the first unsent content change to a progress
 * report when later changes show work is continuing. Later changes do not
 * restart it. If the next change arrives after this deadline but before idle,
 * the elapsed deadline makes that progress immediately due; without a next
 * change, the final dirty state waits for the idle deadline.
 *
 * A user edit should be on the server before they finish saying what they
 * did. The report is a delta, not the scene, so this can be short without
 * being expensive.
 *
 * `POST /api/boards/hold` goes out on the leading edge and renews every
 * LOCK_RENEW_MS while content is pending. This deadline both gives a long drag
 * periodic durability and caps how long hold acquisition waits out an
 * already-started agent write. At most one report is in flight; another due
 * deadline records one queued latest delivery rather than fanning out.
 */
const REPORT_PROGRESS_MS = 400;

/**
 * The trailing idle deadline from the last content edit to the final report.
 * It restarts on every content edit and stays below DEFAULT_SETTLE_MS so the
 * change feed can fold the final write into the same observed human act. It is
 * deliberately twice REPORT_PROGRESS_MS: continuous work makes progress at
 * 400 ms, while a brief pause does not immediately manufacture another tail.
 */
const REPORT_IDLE_SETTLE_MS = 800;

/**
 * How long the pane waits before retrying a report the server refused or never
 * answered.
 *
 * The baseline is untouched by a failure, so the retry recomputes the very
 * same delta and nothing is lost except promptness. It is longer than a settle
 * window, which means a report that only lands on the retry is a second event
 * in the feed rather than part of the first. That is the right way round: the
 * agent hearing about one drag twice costs it a sentence, and a retry inside
 * the settle window would mean hammering a server that is already failing.
 */
const REPORT_RETRY_MS = 2000;

/**
 * How long the pane waits before publishing a changed selection.
 *
 * Selection is high-frequency and cheap, ids only, so it gets its own and much
 * shorter debounce. 150 ms coalesces a lasso drag into one POST while still
 * feeling immediate to somebody talking to an agent about "these boxes".
 *
 * Selection and changes travel by different routes, so these two numbers are
 * what orders them, and 150 against 400 orders them the useful way round: an
 * agent hears which boxes were picked up before it hears what happened to
 * them. Raising this past REPORT_PROGRESS_MS reverses that, and the symptom
 * would be an agent describing a move against the previous selection.
 */
const SELECTION_DEBOUNCE_MS = 150;

/**
 * How long a pane waits before dialling the socket again after it drops.
 *
 * It is also the grace before a pane reads a dropped socket as anything at
 * all. A pane stays editable through a socket blip (ADR 0022, TASK-153): lock
 * state is broadcast over this socket, but a pane that cannot hear it for a
 * moment does not assume the board is held, because a person refused their
 * own edit for a network hiccup is the wall stopping for no reason they can
 * see. Only CONTACT_LOST_MS below puts the pane in view mode. It is
 * deliberately unrelated to REPORT_PROGRESS_MS: change reports go by HTTP and
 * are not gated on the socket, so a dropped socket must not also stop a
 * user's edits reaching the server.
 */
const SOCKET_RECONNECT_MS = 3000;

/**
 * How long a pane goes without the server before it treats contact as lost
 * and shows the board in view mode.
 *
 * Two redial intervals, so one failed redial is a blip and a second is loss.
 * A redial that succeeds inside the first interval never shows view mode for
 * a frame, and a pane that cannot hear lock broadcasts for longer than that
 * stops accepting content edits, since it can no longer say whether an agent
 * has claimed the board (ADR 0022). Pan and zoom keep working throughout.
 */
const CONTACT_LOST_MS = 2 * SOCKET_RECONNECT_MS;

// ── What a pane looks like from outside ───────────────────────────────────

/**
 * How long the pane waits before reporting where it sits and what of its board
 * is on screen.
 *
 * It changes on every scroll and zoom, and it is only sent when it has
 * actually changed. An agent must be able to read it every turn, which it can
 * only afford if the browser is not posting it continuously.
 */
const PANE_DEBOUNCE_MS = 300;

/**
 * How long the server waits for the panes to say where they ended up, after
 * asking the browser to split or close one.
 *
 * This is a cap, not a delay. The wait ends as soon as the panes the layout
 * change moved have re-reported; a pane it did not touch is not waited on
 * (TASK-153). It exists because a pane that has just been mounted, or just
 * been squeezed into half the width, reports its new rectangle a beat later,
 * and answering before that arrives means answering out of stale geometry.
 * That is how a plain left/right split once came back described as "row 2,
 * column 2". Observed on the first real browser run, not guessed.
 *
 * The beat it is waiting out is PANE_DEBOUNCE_MS, which is the coupling worth
 * knowing about: this must stay comfortably above it, or the cap expires while
 * the browser is still sitting on the report that would have ended the wait.
 * 300 against 1500 leaves room for the round trip and a slow frame.
 */
const PANE_SETTLE_CAP_MS = 1500;

/**
 * How long the server waits for the browser to change its layout at all.
 *
 * The acknowledgement is the pane appearing in the registry or its socket
 * closing, never a promise from the shell, because a registration is the only
 * evidence anywhere that a pane exists. This is the outer bound on that, and
 * it is generous because failing it means telling a user their split did not
 * happen when it may only have been slow.
 */
const PANE_LAYOUT_TIMEOUT_MS = 10_000;

/**
 * How long the server waits for a pane to say a walkthrough step it asked for
 * has finished arriving: the first step of a narration (TASK-251).
 *
 * The acknowledgement is the pane's own report, for the same reason a layout's
 * is a registration. A step costs the glide (`PRESENTATION_STEP_MS`, 900), or a
 * picture flight when it changes view (`PICTURE_TRANSITION_MS`, 640) after the
 * new picture has been fetched and drawn, then the report's debounce
 * (`SELECTION_DEBOUNCE_MS`, 150) and a round trip: a couple of seconds at worst.
 * It pulls against a voice that stays silent until that step reaches it, so it
 * is far shorter than a layout's bound.
 */
const PRESENTATION_ARRIVAL_TIMEOUT_MS = 8000;

// ── Subtitles of the voice over the canvas (TASK-292) ─────────────────────
//

/**
 * How long a subtitle stays after the latest word of it arrived.
 *
 * The voice model's transcript arrives a word at a time, on the audio clock, so silence on that
 * stream is the voice being silent. This has to outlast the pauses inside one turn, or the
 * subtitle would blink off between sentences: the longest measured in a real session was 1.6
 * seconds. It pulls against reading a finished line, which wants it long, and against a stale
 * line hanging over the picture after an interruption, which wants it short.
 */
const SUBTITLE_LINGER_MS = 2500;

// ── What the browser keeps of the server's answers (TASK-167) ─────────────
//
// Three durations, one cache. The listing is small and every event that can
// change it invalidates it by name, so its window is only the floor under a
// burst of them — and it is the one thing re-read when the tab comes back to
// the foreground, since nothing announces that the vault gained a note. A
// preview is a whole scene plus an export, so it is staler on purpose; a board
// a pane holds is drawn from that pane and never read here at all. Collection
// pulls against the tab's memory rather than the server: it is what lets a
// board come back showing its last preview instead of an empty card.

const BOARD_LISTING_STALE_MS = 30_000;
const BOARD_PREVIEW_STALE_MS = 60_000;
const BOARD_CACHE_GC_MS = 5 * 60_000;

// ── Time passing, as the shell says it (TASK-302) ─────────────────────────
//
// The navigator says how long ago an agent last said what it was doing, and
// the agent dock how long a turn has run. Neither is a deadline: each is a clock
// a person reads at a glance. The age is coarse ("now", "12s", "4m"), so a
// slower tick is enough and re-renders the navigator less often; the elapsed
// time counts seconds, so it ticks every second while a turn runs and not at
// all otherwise. The quiet threshold is when a running turn that has reported
// nothing new is worth pointing out: long enough that thinking, a slow build
// or a long test run is not called stuck, short enough that a person glancing
// back learns it before they would have given up on it.

/** How often the navigator re-reads how long ago each agent spoke. */
const SHELL_AGE_TICK_MS = 5000;

/** How often the agent dock counts a running turn's seconds. */
const AGENT_ELAPSED_TICK_MS = 1000;

/** How long a running turn reports nothing new before the agent dock says it is quiet. */
const AGENT_QUIET_MS = 120_000;

/**
 * How long a board's viewport keeps its size before the camera fits to it: longer than
 * a slow frame, so a slide is fitted at its end, and short enough not to trail a resize.
 */
const BOARD_RESIZE_SETTLE_MS = 64;

export { AGENT_ELAPSED_TICK_MS, AGENT_QUIET_MS, BOARD_RESIZE_SETTLE_MS, SHELL_AGE_TICK_MS };

/** Outer cap for any browser-owned export request. The wait ends on correlation, not delay. */
const BROWSER_EXPORT_TIMEOUT_MS = 30_000;

/** Delay after refreshing one pane before asking it to capture the presented board. */
const BROWSER_CAPTURE_DISPATCH_MS = 800;

/** Window in which capture results compete; the largest successful payload wins. */
const BROWSER_CAPTURE_COLLECTION_MS = 3000;

/** Outer cap for one correlated browser viewport request. */
const BROWSER_VIEWPORT_SETTLEMENT_MS = 10_000;

// ── Server-owned board rendering (ADR 0020) ──────────────────────────────

/**
 * Bound for one serialized PNG or SVG job in the private renderer. This is intentionally half the proof harness's 20-second
 * fault deadline. Product work renders one immutable request and reports its
 * named page phase when this bound expires.
 */
const SEMANTIC_RASTER_JOB_TIMEOUT_MS = 10_000;

/**
 * Bound for each startup phase of the private Chromium: its control port, then
 * the renderer page. Startup is lazy, so it delays the first Board render only.
 * It pulls against how soon an operator learns that Chromium cannot start. Ten
 * seconds completed three cold starts under a half-CPU quota (TASK-162), but
 * hosted Linux cold starts exceeded it in 2 of 5 gate runs (October 2026, TASK-470).
 */
const SEMANTIC_RASTER_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Bound for each renderer TERM/KILL phase. Two phases fit inside the CLI
 * interrupt grace, leaving time to remove the private profile after the group
 * is proved absent.
 */
const SEMANTIC_RASTER_CLEANUP_MS = 1000;

/**
 * Bound for one DevTools command whose caller names none. A command to a
 * private local Chromium answers in milliseconds, so this only decides how
 * long a wedged browser is waited on before the caller hears so. It matches
 * the renderer's job bound, which a cold page's commands fit inside.
 */
const HEADLESS_CHROMIUM_CALL_MS = SEMANTIC_RASTER_JOB_TIMEOUT_MS;

/** Bounds native clipboard startup after rasterizer teardown; local copies take milliseconds, but a large image gets five seconds. */
export const IMAGE_CLIPBOARD_TIMEOUT_MS = 5000;
/** Retire a Linux clipboard owner within one second of replacement, without polling on every event-loop turn. */
export const IMAGE_CLIPBOARD_POLL_MS = 1000;
// ── When a board is considered still ──────────────────────────────────────

/**
 * How long the change feed waits for a board to stop moving before diffing it
 * against the last state anybody was told about.
 *
 * Overridable with ARCHBOARD_SETTLE_MS. Three checks set it, two down to a few
 * hundred milliseconds so they are not mostly sleep, and one up to a minute so
 * that only the settles it asks for explicitly ever fire.
 *
 * This is the number the ADR 0016 tension is about, seen from the far end. It
 * has to be longer than REPORT_IDLE_SETTLE_MS, because that deadline sets the
 * closest together two trailing flushes from separate stretches can arrive. A
 * settle window shorter than the trailing idle deadline would make every
 * flush its own event and the coalescing would do nothing. 800 against 1200
 * leaves room for a flush, its round trip and the next flush inside one window,
 * which is what turns
 * "they rearranged that corner" into one thing the agent is told rather than
 * three.
 */
const DEFAULT_SETTLE_MS = 1200;

/**
 * The longest the feed will hold an unsettled board before emitting anyway.
 *
 * Overridable with ARCHBOARD_SETTLE_MAX_MS. Without it, somebody drawing
 * continuously for a minute would keep restarting the settle timer and the
 * agent would hear nothing for that minute. This caps that at five settle
 * windows, so a long stretch of continuous work still reports every few
 * seconds.
 */
const DEFAULT_SETTLE_MAX_MS = 6000;

// ── Server application shutdown (ADR 0021) ────────────────────────────────

/**
 * Longest a stop attempt waits for admitted request parsing and explicit
 * mutation work to settle before refusing teardown and restoring admission.
 *
 * It stays below the CLI's five-second stop observation window, so a stuck
 * request produces a healthy, inspectable refusal rather than looking like a
 * dead server. It is longer than REPORT_IDLE_SETTLE_MS, allowing an ordinary
 * human edit and trailing report to drain without turning stop into a refusal.
 * A disconnected board-lock waiter does not spend this budget: its request
 * signal cancels the LOCK_POLL_MS wait immediately.
 */
const SERVER_MUTATION_DRAIN_TIMEOUT_MS = 1000;

// ── Git checkout inspection ───────────────────────────────────────────────

/**
 * Outer bound for one Git identity probe while an operation captures its checkout snapshot. Snapshot
 * work runs before a board lock or synchronous note write, so this never extends either critical
 * section. It is longer than the server mutation-drain refusal window: stop may refuse and keep the
 * application intact while a slow probe is still cancellable by its request or application owner.
 * The exception is code-target's probe of the checkout that holds a vault: its Git calls, at most
 * three, are synchronous for the synchronous vault check, so each can block the event loop this long.
 */
const GIT_COMMAND_TIMEOUT_MS = 5000;

/**
 * Grace after Git termination for the detached group, leader and both output
 * pipes to disappear. A killed group normally leaves within milliseconds. The
 * macOS group that outlived one second (TASK-362) was not slow: a child forked
 * during the stop had escaped both group signals (TASK-470, fixed in the stop
 * barrier). Three seconds stays below GIT_COMMAND_TIMEOUT_MS, so failed
 * cleanup is still diagnosed before the command timeout would be.
 */
const GIT_PROCESS_GROUP_CLEANUP_MS = 3000;

/** Observation cadence while proving a killed process group is absent. */
const PROCESS_GROUP_OBSERVATION_POLL_MS = 10;

/** Git process cleanup uses the shared process-group observation cadence. */
const GIT_PROCESS_GROUP_POLL_MS = PROCESS_GROUP_OBSERVATION_POLL_MS;

/**
 * Outer grace before an interrupted CLI restores the signal's default action.
 * Git may spend one cleanup grace terminating and cancelling its leader and
 * pipes, then another proving the detached group is absent. A third grace is
 * reserved for that settled failure to cross the command runner before the CLI
 * re-signals itself; the outer owner must never pre-empt either inner proof.
 */
const CLI_INTERRUPT_CLEANUP_MS = 3 * GIT_PROCESS_GROUP_CLEANUP_MS;

// ── Codex workbench policy (ADR 0019) ─────────────────────────────────────
//
// These are authored policy values, not consumer defaults. Their expiry
// classifications matter: an expiry bounds a retry, lease, readiness,
// freshness, approval, recovery, or shutdown operation, but never proves that
// a remote mutation failed. Consumers must use these names and must not add a
// local duration or an override hook.
//
// Restart delay doubles after each failed child attempt, caps at the maximum,
// and resets only after one account-ready session. Shutdown is ordered around
// the child lifecycle: stop realtime, settle local waiters, close stdin, wait for
// EOF, TERM, then freeze and KILL the group (codex-group-freeze.ts), all within the composed cap.

/** Retry-delay classification. Pulls against the first restart attempt. */
const CODEX_PROCESS_RESTART_BASE_MS = 1000;
/** Retry-delay cap classification. Pulls against request settlement and the backoff ceiling. */
const CODEX_PROCESS_RESTART_MAX_MS = 30_000;
/** Uncertainty-bound classification. Pulls against a lost non-idempotent response before `outcome_unknown`. */
const CODEX_REQUEST_SETTLEMENT_MS = 30_000;

/** Browser-command lease classification. Pulls against the public browser wait contract and approval expiry. */
const CODEX_BROWSER_COMMAND_LEASE_MS = 150_000;

/** Visual-approval expiry classification. Pulls against the browser-command lease. */
const CODEX_APPROVAL_EXPIRY_MS = 90_000;

/**
 * How long a browser tab's conversation outlives its last pane socket (TASK-373). Pulls against a
 * reload plus SOCKET_RECONNECT_MS redials, which it must outlast or a reload loses the
 * conversation, and CODEX_APPROVAL_EXPIRY_MS, which it must stay under so a closed tab's approvals
 * end as "tab session ended" rather than expiring unanswered.
 */
const TAB_SESSION_GRACE_MS = 60_000;

/** Spoken-approval gate expiry classification. Pulls against visual approval expiry. */
const CODEX_SPOKEN_GATE_EXPIRY_MS = 60_000;

/** Semantic-freshness expiry classification. Pulls against realtime recovery. */
const CODEX_SEMANTIC_FRESHNESS_MS = 30_000;

/** Realtime-readiness timeout classification. Pulls against permission-independent SDP/start readiness. */
const CODEX_REALTIME_START_MS = 15_000;

/** Realtime-stop timeout classification. Pulls against TERM grace so realtime stops first. */
const CODEX_REALTIME_STOP_MS = 3000;
/** Realtime-recovery window classification. Pulls against semantic freshness while reconnecting. */
const CODEX_REALTIME_RECOVERY_MS = 45_000;
/** TERM grace classification. Pulls against realtime stop before TERM-to-KILL escalation. */
const CODEX_TERM_GRACE_MS = 5000;
/**
 * Stdin EOF grace lets the child consume drained frames before TERM and ends on closure.
 * Realtime stop, EOF and TERM leave one second of the composed cap for group absence proof.
 */
const CODEX_STDIN_EOF_GRACE_MS = 1000;
/** Composed-shutdown cap classification. Pulls against realtime stop, stdin EOF grace, and TERM grace. */
const CODEX_COMPOSED_SHUTDOWN_MS = 10_000;
/** Public server readiness classification. Pulls against mandatory Codex startup readiness. */
const SERVER_STARTUP_READINESS_MS = 8000;

/**
 * Bounds dynamic wait detection latency against app-server thread status
 * reads. Request uncertainty must contain a whole number of polls so the last
 * observation cannot cross the settlement boundary.
 */
const CODEX_WAIT_TARGET_POLL_MS = 250;

/**
 * Read-amplification floor classification. Pulls against the wait-target poll
 * below and request settlement above.
 *
 * Serving a browser snapshot request re-reads the authoritative workhorse
 * queue, which is a paginated app-server call. A client is free to ask for a
 * snapshot as often as it likes, so the Archboard server coalesces concurrent re-reads and
 * will not start a new one inside this floor. It sits at or above one
 * wait-target poll, because a browser must not out-run the cadence the server
 * observes thread state at, and far below request settlement, so a person's
 * refresh still reads as immediate.
 */
const CODEX_QUEUE_REREAD_FLOOR_MS = 1000;

// ── Server subprocesses owned by checks (TASK-086) ───────────────────────

export {
	FAR_VIEW_SWAP_MS,
	FLOW_CYCLE_CAP_MS,
	PICTURE_ENTRY_MS,
	PICTURE_ENTRY_PHASES,
	PICTURE_EXIT_MS,
	PICTURE_TRANSITION_MS,
	PICTURE_TRANSITION_PHASES,
	PRESENTATION_BOX_IN_MS,
	PRESENTATION_BOX_STEP_MS,
	PRESENTATION_STEP_MS,
	SUBJECT_TIP_DELAY_MS,
} from "#shared/constants/diagram-motion.ts";
export { EXPLORING_MS } from "#shared/constants/exploring.ts";
export {
	AGENT_PANEL_SLIDE_MS,
	SIDEBAR_MS,
	SLIDE_SETTLED_MS,
} from "#shared/constants/column-motion.ts";
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
} from "#shared/constants/walkthrough-recording.ts";
export {
	RECORDING_FRAME_READY_MS,
	RECORDING_REPLAY_PREROLL_MS,
} from "#shared/constants/walkthrough-replay.ts";
export {
	ACTIVITY_LINGER_MS,
	CLAIM_DEFAULT_MS,
	CLAIM_LEASE_MS,
	CLAIM_MAX_MS,
	LOCK_LEASE_MS,
	LOCK_POLL_MS,
	LOCK_RENEW_MS,
	LOCK_STEAL_GUARD_MS,
	LOCK_WAIT_CAP_MS,
	LOCK_WATCH_MS,
} from "#shared/constants/board-locks.ts";
export {
	REPORT_PROGRESS_MS,
	REPORT_IDLE_SETTLE_MS,
	REPORT_RETRY_MS,
	SELECTION_DEBOUNCE_MS,
	SOCKET_RECONNECT_MS,
	CONTACT_LOST_MS,
	PANE_DEBOUNCE_MS,
	PANE_SETTLE_CAP_MS,
	PANE_LAYOUT_TIMEOUT_MS,
	SUBTITLE_LINGER_MS,
	PRESENTATION_ARRIVAL_TIMEOUT_MS,
	BOARD_LISTING_STALE_MS,
	BOARD_PREVIEW_STALE_MS,
	BOARD_CACHE_GC_MS,
	BROWSER_EXPORT_TIMEOUT_MS,
	BROWSER_CAPTURE_DISPATCH_MS,
	BROWSER_CAPTURE_COLLECTION_MS,
	BROWSER_VIEWPORT_SETTLEMENT_MS,
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
	HEADLESS_CHROMIUM_CALL_MS,
	DEFAULT_SETTLE_MS,
	DEFAULT_SETTLE_MAX_MS,
	SERVER_MUTATION_DRAIN_TIMEOUT_MS,
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
	PROCESS_GROUP_OBSERVATION_POLL_MS,
	CLI_INTERRUPT_CLEANUP_MS,
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_PROCESS_RESTART_MAX_MS,
	CODEX_REQUEST_SETTLEMENT_MS,
	CODEX_BROWSER_COMMAND_LEASE_MS,
	CODEX_APPROVAL_EXPIRY_MS,
	TAB_SESSION_GRACE_MS,
	CODEX_SPOKEN_GATE_EXPIRY_MS,
	CODEX_SEMANTIC_FRESHNESS_MS,
	CODEX_REALTIME_START_MS,
	CODEX_REALTIME_STOP_MS,
	CODEX_REALTIME_RECOVERY_MS,
	CODEX_TERM_GRACE_MS,
	CODEX_STDIN_EOF_GRACE_MS,
	CODEX_COMPOSED_SHUTDOWN_MS,
	SERVER_STARTUP_READINESS_MS,
	CODEX_WAIT_TARGET_POLL_MS,
	CODEX_QUEUE_REREAD_FLOOR_MS,
};

/** Notice vault/configuration edits promptly without scanning the whole vault on every frame. */
export const VAULT_CHECK_POLL_MS = 5_000;

// ── Skill evaluation harness (TASK-209) ──────────────────────────────────
// Every duration the on-demand skill evaluation pulls against. None of them is
// reached from the product: the harness owns its own Archboard server per run, spawns the
// archboard CLI to lay fixtures, and runs Codex authors and one grader, and
// each of those has a point past which waiting longer is a hang, not patience.

/** An owned evaluation server answering /health after spawn; a cold bun start on a busy box. */
export const SKILL_EVAL_SERVER_STARTUP_MS = 20_000;
/** Between /health probes while an evaluation server starts. */
export const SKILL_EVAL_HEALTH_POLL_MS = 100;
/** One /health probe; a listener that cannot answer in this time is treated as not up yet. */
export const SKILL_EVAL_HEALTH_REQUEST_MS = 1000;
/** Let the server finish its separately owned Codex shutdown before harness escalation, with one composed budget of margin. */
export const SKILL_EVAL_SERVER_SHUTDOWN_MS = CODEX_COMPOSED_SHUTDOWN_MS * 2;
/** One archboard CLI call laying a fixture or reading an outcome; each is one HTTP round trip. */
export const SKILL_EVAL_CLI_TIMEOUT_MS = 60_000;
/** One git command fetching or checking out Flask; a first clone from the network is the slow case. */
export const SKILL_EVAL_GIT_TIMEOUT_MS = 10 * 60_000;
/** One author run end to end; a run still going after this is killed and recorded as timed out. */
export const SKILL_EVAL_AUTHOR_TIMEOUT_MS = 40 * 60_000;
/** The one grading session over a whole batch; it reads three Flask revisions and every run. */
export const SKILL_EVAL_GRADER_TIMEOUT_MS = 4 * 60 * 60_000;
/**
 * How long the voice of a fixture's kept talk speaks about each step. Long enough for a subtitle
 * to be read in the video an author renders from it; every second is 30 frames the author's
 * replay draws in software, about 2.5 s of the run, so three steps render in under half a minute.
 */
export const SKILL_EVAL_TALK_STEP_MS = 3000;
/** From SIGTERM to SIGKILL for a Codex process the harness gives up on. */
export const SKILL_EVAL_CODEX_TERM_GRACE_MS = 10_000;

// ── History lens (ADR 0045) ─────────────────────────────────────────────
export { LOCALITY_DEFAULT_PERIOD_MS } from "#shared/constants/history-lens.ts";

// ── Code check (ADR 0046) and embeds check (ADR 0057) ───────────────────
export { LANGUAGE_SERVER_STOP_MS } from "#shared/constants/code-check.ts";
export { FETCH_INCOMING_STALE_MS, VAULT_FETCH_TIMEOUT_MS } from "#shared/constants/embeds-check.ts";

export { createElapsedClock } from "#shared/constants/elapsed-clock.ts";
export { CODEX_GROUP_FREEZE_MS } from "#shared/constants/codex-group-freeze.ts";

export {
	SERVER_HTTP_STOP_GRACE_MS,
	SERVER_STOP_CONFIRM_MS,
	SERVER_STOP_PIDFILE_POLL_MS,
	SERVER_STOP_PIDFILE_WAIT_MS,
	SERVER_STOP_PROBE_POLL_MS,
} from "#shared/constants/server-stop.ts";
