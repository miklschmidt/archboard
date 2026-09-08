// Test budgets: case bounds, poll cadences and fixture waits for the test
// owners. They live beside the tests and not in the product timing module,
// which holds only durations the product pulls against each other
// (TASK-153). Each still says what it is bounded by.

import {
	BROWSER_EXPORT_TIMEOUT_MS,
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	LOCK_POLL_MS,
	LOCK_WATCH_MS,
} from "../../../src/shared/timing/timing.ts";

/**
 * Bound for a fake Git child to publish its startup marker in the module owner.
 * The owner also runs inside the serialized system watchdog, so observing the
 * fixture must allow the real command its complete deadline.
 */
const TEST_GIT_FIXTURE_START_MS = GIT_COMMAND_TIMEOUT_MS;

/**
 * Bun case bound for the composed Git module lifecycle owner. It leaves one
 * command deadline for fixture readiness and one for its remaining lifecycle
 * cases while the outer process-contract watchdog remains the final bound.
 */
const TEST_GIT_LIFECYCLE_CASE_TIMEOUT_MS = 2 * GIT_COMMAND_TIMEOUT_MS;

/**
 * Poll cadence for the delayed-checkout fixture's explicit release files.
 * The files, not elapsed time, gate each Git probe; a short cadence keeps the
 * four-stage concurrency owner well inside Bun's ordinary case bound.
 */
const TEST_DELAYED_CHECKOUT_RELEASE_POLL_MS = 25;

/**
 * External bound for the exact Git lifecycle plus opener regression sequence.
 * It is four ordinary Git command bounds: enough for the serial owners while
 * still diagnosing a retained child or pipe well inside the repository lane.
 */
const TEST_GIT_OPENER_WATCHDOG_MS = 4 * GIT_COMMAND_TIMEOUT_MS;

/**
 * Bun's case deadline includes the watchdog plus two cleanup grace windows:
 * one to kill and drain the child group, and one for the owner to report it.
 */
const TEST_GIT_OPENER_CASE_TIMEOUT_MS =
	TEST_GIT_OPENER_WATCHDOG_MS + 2 * GIT_PROCESS_GROUP_CLEANUP_MS;

/** Actual elapsed ceiling for a test with no reviewed source-local real-time declaration. */
const TEST_WALL_CLOCK_BUDGET_MS = 20_000;

/** One controlled Bun child runs three millisecond fixtures and must settle well below the repository budget. */
const TEST_WALL_CLOCK_PRELOAD_LIFECYCLE_TIMEOUT_MS = 5000;

/** Bun lifecycle failure thresholds, not hang ceilings or SLAs, clear hosted sweep 5.274s and totality 5,003.69ms at roughly 3x. */
const TEST_BOARD_INSPECTION_SWEEP_CASE_TIMEOUT_MS = 15_000;

const TEST_BOARD_INSPECTION_TOTALITY_CASE_TIMEOUT_MS = 15_000;

/** One packaged inspection stays below the required 20-second per-child diagnostic ceiling. */
const TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS = 18_000;

/** TERM, KILL, and leader/pipe settlement phases together stay below the 5-second cleanup cap. */
const TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS = 1000;

/** Observation cadence while proving a packaged inspection's detached group is absent. */
const TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS = 10;

/** The local HTTP sentinel must publish its ephemeral port before a package inspection starts. */
const TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS = 5000;

/** Lets the process-group fixture publish descendant readiness before its forced failure. */
const TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS = 1000;

/** Bounds both retained parent-SIGTERM owners while they join cleanup before replaying the signal. */
const TEST_BOARD_INSPECTION_PACKAGE_LIFECYCLE_CASE_TIMEOUT_MS = 15_000;

/** Canvas identity startup stays below TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS with bounded shutdown room. */
const TEST_CANVAS_STARTUP_TIMEOUT_MS = 15_000;

/**
 * How long one health request may wait inside the startup cap.
 *
 * It is ten TEST_CANVAS_HEALTH_POLL_MS intervals. A dead listener therefore
 * costs at most half a second per attempt, while a connection refusal returns
 * immediately and follows the shorter poll cadence.
 */
const TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS = 500;

/**
 * How long startup waits between refused health connections.
 *
 * This pulls against the server's ordinary sub-second startup. Shorter would
 * spin on a closed port; longer would make identity verification noticeably
 * lag behind a child that is already listening.
 */
const TEST_CANVAS_HEALTH_POLL_MS = 50;

/**
 * How long graceful shutdown gets before the owner escalates its exact child
 * to SIGKILL, and how long that forced exit gets to be observed.
 *
 * Two of these intervals plus TEST_CANVAS_STARTUP_TIMEOUT_MS must fit inside
 * TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS so the parent proof outlives the complete
 * child-owned cleanup path.
 */
const TEST_CANVAS_SHUTDOWN_TIMEOUT_MS = 1000;

/**
 * Outer threshold for one lifecycle proof subprocess, from spawn through cleanup.
 *
 * It clears startup, owner shutdown, and post-`canvas stop` PID observation
 * beyond the server's 2,000 ms forced-exit fallback. A stuck proof therefore
 * fails with its PID and mode instead of hanging the whole board suite.
 */
const TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS = 20_000;

/** Bound the shipped CLI below the surrounding vault workflow case deadline. */
const TEST_VAULT_CLI_TIMEOUT_MS = 20_000;

/**
 * Two shutdown intervals beyond TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS let the Bun
 * case receive rejection, assert it, and dispose a retained generation.
 */
const TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS = 2 * TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;

/**
 * Cap for the post-cleanup health probe.
 *
 * Five health-poll intervals are enough to distinguish a listener that still
 * answers from a refused connection without making four cleanup cases cost a
 * second each when a platform delays refusal.
 */
const TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS = 250;

/**
 * Delay between the early-death fixture sending response headers and exiting.
 *
 * Half one health-poll interval lets `fetch` expose the response before the
 * body is cut off, while the public liveness check still observes the exit
 * inside the same TEST_CANVAS_HEALTH_POLL_MS window.
 */
const TEST_CANVAS_EARLY_DEATH_DELAY_MS = 25;

/**
 * How often synthetic pane mechanics inspect their captured socket frames.
 *
 * The interval stays short enough to observe an already-delivered loopback
 * frame or registry update without turning the wait into a busy spin.
 */
const TEST_PANE_MESSAGE_POLL_MS = 20;

/**
 * Outer cap for a synthetic pane waiting on one named socket frame.
 *
 * This is longer than PANE_SETTLE_CAP_MS, so a server waiting for pane
 * geometry gets its full cap before the test declares the expected frame
 * missing. It remains far below BROWSER_EXPORT_TIMEOUT_MS because these
 * panes acknowledge callbacks directly and never render.
 */
const TEST_PANE_MESSAGE_TIMEOUT_MS = 2000;

/**
 * TASK-148.04 measures each real cross-process lock-watch delivery from the
 * completed ownership change to its matching board_lock frame. One sweep
 * should deliver it; three sweeps are the outer bound for timer phase,
 * loopback delivery, and a stressed system-test host.
 */
const TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS = 3 * LOCK_WATCH_MS;

/** Four LOCK_WATCH_MS sweeps cover a timestamp boundary and board_note delivery. */
const TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS = 4 * LOCK_WATCH_MS;

/**
 * LOCK_POLL_MS observes a delivered note-watch frame without polling faster
 * than the lock-file machinery that carries the notification.
 */
const TEST_NOTE_WATCH_MESSAGE_POLL_MS = LOCK_POLL_MS;

/** One LOCK_WATCH_MS bounds the board_note clearing frame after reload. */
const TEST_NOTE_WATCH_CLEAR_TIMEOUT_MS = LOCK_WATCH_MS;

/** Ordinary browser commands stay at 30s; the 10k-element initial render gets three windows, finite and not an SLA. */
const TEST_BROWSER_COMMAND_TIMEOUT_MS = BROWSER_EXPORT_TIMEOUT_MS;

/** Four real pointer moves add roughly 20 seconds of Chromium ACK latency on macOS. */
const TEST_HUMAN_UNDO_CASE_TIMEOUT_MS =
	process.platform === "darwin"
		? 2 * TEST_BROWSER_COMMAND_TIMEOUT_MS
		: TEST_BROWSER_COMMAND_TIMEOUT_MS;

const TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS = 3 * TEST_BROWSER_COMMAND_TIMEOUT_MS;

/** The 10,000-element real-browser performance owner measured 55.9-76.84s; eight command windows preserve its existing finite case bound. */
const TEST_HUMAN_EDIT_PERFORMANCE_CASE_TIMEOUT_MS = 8 * TEST_BROWSER_COMMAND_TIMEOUT_MS;

/** Forty-two real interleaved browser/server cycles were measured at about 40s; four command windows retain the existing finite Bun case bound. */
const TEST_LIVE_SESSION_CONVERGENCE_CASE_TIMEOUT_MS = 4 * TEST_BROWSER_COMMAND_TIMEOUT_MS;

/** Matches the existing loopback and lock polling cadence without busy-waiting. */
const TEST_BROWSER_POLL_MS = LOCK_POLL_MS;

/** Extends the negative pane window past one debounce without reaching its settle cap. */
const TEST_PANE_DEBOUNCE_MARGIN_MS = 2 * TEST_BROWSER_POLL_MS;

/** Polls fake-opener lifecycle evidence within its 2s operation bound. */
const TEST_OPENER_LIFECYCLE = { pollMs: 20, timeoutMs: 2000 } as const;

/** Aggregate Bun case, not an operation cap/SLA: 20s avoids the hosted 5s cancellation path while keeping a finite bound. */
const TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS = 20_000;

/** Aggregate Bun case, not an operation cap/SLA: 20s clears hosted 5,034ms and stressed 14,815.78ms. */
const TEST_CODE_TARGET_PRESENTATION_CASE_TIMEOUT_MS = 20_000;

/** Two real renderer acquisitions plus cleanup measured below 7s; 9.5s retains a narrow stressed-host margin. */
const TEST_BOARD_RENDERER_OWNER_TIMEOUT_MS = 9500;

/** The injected startup exit settles in under 300ms; 3s leaves room for process and pipe cleanup. */
const TEST_BOARD_RENDERER_STARTUP_FAILURE_TIMEOUT_MS = 3000;

/** The static fixture performs six loopback reads and starts no Chromium process. */
const TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS = 1000;

/** Cold PNG/SVG workflows measured 11.49–13.09s under a half-CPU quota (TASK-162), within the normal wall-clock ceiling. */
const TEST_SERVER_RENDERING_CASE_TIMEOUT_MS = TEST_WALL_CLOCK_BUDGET_MS;

/** A healthy pre-render human hold is immediate; 400ms fails the focused owner before a product lease can expire. */
const TEST_SERVER_RENDERING_HOLD_TIMEOUT_MS = 400;

/** Missing Chromium is a preflight refusal and should never approach the product startup bound. */
const TEST_SERVER_RENDERING_FAILURE_CASE_TIMEOUT_MS = 2000;

export {
	TEST_HUMAN_UNDO_CASE_TIMEOUT_MS,
	TEST_VAULT_CLI_TIMEOUT_MS,
	TEST_GIT_FIXTURE_START_MS,
	TEST_GIT_LIFECYCLE_CASE_TIMEOUT_MS,
	TEST_DELAYED_CHECKOUT_RELEASE_POLL_MS,
	TEST_GIT_OPENER_WATCHDOG_MS,
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
	TEST_WALL_CLOCK_BUDGET_MS,
	TEST_WALL_CLOCK_PRELOAD_LIFECYCLE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_SWEEP_CASE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_TOTALITY_CASE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS,
	TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_LIFECYCLE_CASE_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
	TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS,
	TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS,
	TEST_CANVAS_EARLY_DEATH_DELAY_MS,
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
	TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS,
	TEST_NOTE_WATCH_MESSAGE_POLL_MS,
	TEST_NOTE_WATCH_CLEAR_TIMEOUT_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS,
	TEST_HUMAN_EDIT_PERFORMANCE_CASE_TIMEOUT_MS,
	TEST_LIVE_SESSION_CONVERGENCE_CASE_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
	TEST_PANE_DEBOUNCE_MARGIN_MS,
	TEST_OPENER_LIFECYCLE,
	TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS,
	TEST_CODE_TARGET_PRESENTATION_CASE_TIMEOUT_MS,
	TEST_BOARD_RENDERER_OWNER_TIMEOUT_MS,
	TEST_BOARD_RENDERER_STARTUP_FAILURE_TIMEOUT_MS,
	TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS,
	TEST_SERVER_RENDERING_CASE_TIMEOUT_MS,
	TEST_SERVER_RENDERING_HOLD_TIMEOUT_MS,
	TEST_SERVER_RENDERING_FAILURE_CASE_TIMEOUT_MS,
};
