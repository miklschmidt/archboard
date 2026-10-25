// Test budgets: case bounds, poll cadences and fixture waits for the test
// owners. They live beside the tests and not in the product timing module,
// which holds only durations the product pulls against each other
// (TASK-153). Each says what it is bounded by, and none is computed from a
// product duration (TASK-154): a product change must never retune a test
// budget, so a test that must outwait a product timer says so beside its own
// literal.

/**
 * External bound for the exact Git lifecycle plus opener regression sequence:
 * four owner files that finish together in about five seconds on a development
 * machine. It is a ceiling that only a retained child or pipe reaches, and it
 * stays well inside the repository lane. It is a test number: the product's Git
 * command timeout is not what this sequence is about, and a change to it must
 * not retune this bound.
 */
const TEST_GIT_OPENER_WATCHDOG_MS = 20_000;

/**
 * How long the watchdog owner gives its own cleanup to kill a child group and
 * drain its pipes, then to see the group gone. Hosted macOS runners let a
 * killed member outlive one second (TASK-362), so it is three.
 */
const TEST_GIT_OPENER_CLEANUP_MS = 3000;

/** How often the watchdog owner looks for a killed process group to be gone. */
const TEST_PROCESS_GROUP_POLL_MS = 10;

/**
 * Bun's case deadline includes the watchdog plus two cleanup windows: one to
 * kill and drain the child group, and one for the owner to report it.
 */
const TEST_GIT_OPENER_CASE_TIMEOUT_MS =
	TEST_GIT_OPENER_WATCHDOG_MS + 2 * TEST_GIT_OPENER_CLEANUP_MS;

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
 * It is a ceiling: every proof polls and returns the moment its process is
 * gone, so a healthy proof never waits it out. It clears startup, owner
 * shutdown, and post-`archboard stop` PID observation on a slow hosted runner.
 * A stuck proof therefore fails with its PID and mode instead of hanging the
 * whole board suite.
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
 * These panes acknowledge callbacks directly and never render, so a frame
 * that has not arrived in two seconds is missing. It is long enough for a
 * server that waits on a pane's geometry to give up first: it pulls against
 * `PANE_MS.settleCap` (1.5 s), which this value must stay above.
 */
const TEST_PANE_MESSAGE_TIMEOUT_MS = 2000;

/**
 * Outer bound for one cross-process lock-watch delivery, from the completed
 * ownership change in one server to the matching board_lock frame on the pane
 * of the other. This owner is about that delivery, so it does wait for the
 * product's one-second lock sweep (`BOARD_LOCK_MS.watch`) to fire: a second server
 * learns of a lock file only by looking at it, and the sweep interval has no
 * test override.
 * The bound is a test number, three seconds: one sweep, then slack for timer
 * phase, loopback delivery and a stressed host. A change to the sweep interval
 * is meant to show up here as a failure, not to move this bound.
 */
const TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS = 3000;

/**
 * How long the cross-process lock owner waits after a pane takes a claim back
 * through one server, so that the server holding the claim has refused a
 * renewal and recorded the loss. This owner is about that discovery, so it does
 * wait for the product's one-second lease renewal (`BOARD_LOCK_MS.renew`) to fire: the
 * claiming server learns of the take-back only when that renewal is refused,
 * and the interval has no test override. It is a test number, 1.5 seconds: one
 * renewal, then slack for timer phase and a stressed host. A call to that
 * server earlier than this would retake the free lease and hide the loss, so it
 * is a wait and not a ceiling.
 */
const TEST_CROSS_PROCESS_CLAIM_RENEWAL_WAIT_MS = 1500;

/**
 * Ceiling for one browser command and for a browser-lane child to exit. A
 * Chromium cold start is the slow part (TASK-361). It is never waited out by a
 * passing run, and it is not the product's export timeout.
 */
const TEST_BROWSER_COMMAND_TIMEOUT_MS = 30_000;

/** How often the browser lane and its adapter look for a child or a condition; short enough to be prompt, long enough not to spin. */
const TEST_BROWSER_POLL_MS = 50;

/**
 * How long a browser owner waits for the shell to register its panes and draw
 * a board in them: a headless Chromium's load, layout and first report. It is
 * a patience, so the factor applies.
 */
const TEST_BROWSER_CONDITION_TIMEOUT_MS = TEST_PATIENCE_FACTOR * 1500;

/** Polls fake-opener lifecycle evidence within its 2s operation bound. */
const TEST_OPENER_LIFECYCLE = { pollMs: 20, timeoutMs: 2000 } as const;

/** Aggregate Bun case, not an operation cap/SLA: 20s avoids the hosted 5s cancellation path while keeping a finite bound. */
const TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS = 20_000;

export {
	TEST_RECORDING_CASE_MS,
	TEST_RECORDING_CLI_MS,
	TEST_VAULT_CLI_TIMEOUT_MS,
	TEST_GIT_OPENER_WATCHDOG_MS,
	TEST_GIT_OPENER_CLEANUP_MS,
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
	TEST_PROCESS_GROUP_POLL_MS,
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
	TEST_CROSS_PROCESS_CLAIM_RENEWAL_WAIT_MS,
	TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_CONDITION_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
	TEST_OPENER_LIFECYCLE,
	TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS,
};
