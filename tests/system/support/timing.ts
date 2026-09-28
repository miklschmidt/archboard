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

/**
 * How much slower than a development machine the machine running a test may
 * be. GitHub's hosted runners vary widely from one run to the next: a Chromium
 * cold start that takes under two seconds here took past five there (TASK-361).
 * It multiplies a test's patience, how long it waits for something that should
 * happen, and never a poll cadence, a window in which nothing may happen, or a
 * product duration.
 */
const TEST_PATIENCE_FACTOR = 3;

/** Bun's own 5 s per-case default times the patience factor; the preload installs it for every case without its own bound. */
const TEST_CASE_TIMEOUT_MS = TEST_PATIENCE_FACTOR * 5000;

/** Actual elapsed ceiling for a test with no reviewed source-local real-time declaration. */
const TEST_WALL_CLOCK_BUDGET_MS = TEST_PATIENCE_FACTOR * 20_000;

/** Server identity startup stays below TEST_SERVER_CHILD_EXIT_TIMEOUT_MS with bounded shutdown room. */
const TEST_SERVER_STARTUP_TIMEOUT_MS = 15_000;

/**
 * How long one health request may wait inside the startup cap.
 *
 * It is ten TEST_SERVER_HEALTH_POLL_MS intervals. A dead listener therefore
 * costs at most half a second per attempt, while a connection refusal returns
 * immediately and follows the shorter poll cadence.
 */
const TEST_SERVER_HEALTH_REQUEST_TIMEOUT_MS = 500;

/**
 * How long startup waits between refused health connections.
 *
 * This pulls against the server's ordinary sub-second startup. Shorter would
 * spin on a closed port; longer would make identity verification noticeably
 * lag behind a child that is already listening.
 */
const TEST_SERVER_HEALTH_POLL_MS = 50;

/**
 * How long graceful shutdown gets before the owner escalates its exact child
 * to SIGKILL, and how long that forced exit gets to be observed.
 *
 * Two of these intervals plus TEST_SERVER_STARTUP_TIMEOUT_MS must fit inside
 * TEST_SERVER_CHILD_EXIT_TIMEOUT_MS so the parent proof outlives the complete
 * child-owned cleanup path.
 */
const TEST_SERVER_SHUTDOWN_TIMEOUT_MS = 1000;

/**
 * Outer threshold for one lifecycle proof subprocess, from spawn through cleanup.
 *
 * It clears startup, owner shutdown, and post-`archboard stop` PID observation
 * beyond the server's 2,000 ms forced-exit fallback. A stuck proof therefore
 * fails with its PID and mode instead of hanging the whole board suite.
 */
const TEST_SERVER_CHILD_EXIT_TIMEOUT_MS = 20_000;

/** Bound the shipped CLI below the surrounding vault workflow case deadline. */
const TEST_VAULT_CLI_TIMEOUT_MS = 20_000;

/**
 * Bound one `semantic record` of a two-step walkthrough against the narrating fixture: a
 * headless Chromium's start, the page's load and layout, a conversation created and voice
 * started, then two steps each glided to, spoken and followed by the recording's pause, and
 * the file streamed out. A recording is as long as its talk, so this is well above a vault
 * command's bound.
 */
const TEST_RECORDING_CLI_MS = 90_000;

/** The recording case: the command's bound, and the server's start and disposal around it. */
const TEST_RECORDING_CASE_MS = TEST_RECORDING_CLI_MS + 30_000;

/**
 * Two shutdown intervals beyond TEST_SERVER_CHILD_EXIT_TIMEOUT_MS let the Bun
 * case receive rejection, assert it, and dispose a retained generation.
 */
const TEST_SERVER_CASE_TIMEOUT_MARGIN_MS = 2 * TEST_SERVER_SHUTDOWN_TIMEOUT_MS;

/**
 * Cap for the post-cleanup health probe.
 *
 * Five health-poll intervals are enough to distinguish a listener that still
 * answers from a refused connection without making four cleanup cases cost a
 * second each when a platform delays refusal.
 */
const TEST_SERVER_LISTENER_PROBE_TIMEOUT_MS = 250;

/**
 * Delay between the early-death fixture sending response headers and exiting.
 *
 * Half one health-poll interval lets `fetch` expose the response before the
 * body is cut off, while the public liveness check still observes the exit
 * inside the same TEST_SERVER_HEALTH_POLL_MS window.
 */
const TEST_SERVER_EARLY_DEATH_DELAY_MS = 25;

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

/** Ordinary browser commands stay at 30s; the 10k-element initial render gets three windows, finite and not an SLA. */
const TEST_BROWSER_COMMAND_TIMEOUT_MS = BROWSER_EXPORT_TIMEOUT_MS;

/** Matches the existing loopback and lock polling cadence without busy-waiting. */
const TEST_BROWSER_POLL_MS = LOCK_POLL_MS;

/** Polls fake-opener lifecycle evidence within its 2s operation bound. */
const TEST_OPENER_LIFECYCLE = { pollMs: 20, timeoutMs: 2000 } as const;

/** Aggregate Bun case, not an operation cap/SLA: 20s avoids the hosted 5s cancellation path while keeping a finite bound. */
const TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS = 20_000;

export {
	TEST_RECORDING_CASE_MS,
	TEST_RECORDING_CLI_MS,
	TEST_VAULT_CLI_TIMEOUT_MS,
	TEST_GIT_OPENER_WATCHDOG_MS,
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
	TEST_CASE_TIMEOUT_MS,
	TEST_WALL_CLOCK_BUDGET_MS,
	TEST_SERVER_STARTUP_TIMEOUT_MS,
	TEST_SERVER_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_SERVER_HEALTH_POLL_MS,
	TEST_SERVER_SHUTDOWN_TIMEOUT_MS,
	TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
	TEST_SERVER_CASE_TIMEOUT_MARGIN_MS,
	TEST_SERVER_LISTENER_PROBE_TIMEOUT_MS,
	TEST_SERVER_EARLY_DEATH_DELAY_MS,
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
	TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
	TEST_OPENER_LIFECYCLE,
	TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS,
};
