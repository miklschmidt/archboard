// A Git command and the process group it runs in, and the cadence every owner
// of a killed process group observes it at until it is gone.

import { durations } from "#shared/constants/durations.ts";

/** Observation cadence while proving a killed process group is absent. */
const PROCESS_GROUP_OBSERVATION_POLL_MS = 10;

/** One Git command: its bound, and the end of its detached process group. */
const GIT_MS = durations({
	/**
	 * Outer bound for one Git identity probe while an operation captures its checkout snapshot. Snapshot
	 * work runs before a board lock or synchronous note write, so this never extends either critical
	 * section. It is longer than the server mutation-drain refusal window: stop may refuse and keep the
	 * application intact while a slow probe is still cancellable by its request or application owner.
	 * The exception is code-target's probe of the checkout that holds a vault: its Git calls, at most
	 * three, are synchronous for the synchronous vault check, so each can block the event loop this long.
	 */
	command: 5000,
	/**
	 * Grace after Git termination for the detached group, leader and both output
	 * pipes to disappear. A killed group normally leaves within milliseconds. The
	 * macOS group that outlived one second (TASK-362) was not slow: a child forked
	 * during the stop had escaped both group signals (TASK-470, fixed in the stop
	 * barrier). Three seconds stays below GIT_MS.command, so failed
	 * cleanup is still diagnosed before the command timeout would be.
	 */
	groupCleanup: 3000,
	/** Git process cleanup uses the shared process-group observation cadence. */
	groupPoll: PROCESS_GROUP_OBSERVATION_POLL_MS,
});

/**
 * Outer grace before an interrupted CLI restores the signal's default action.
 * Git may spend one cleanup grace terminating and cancelling its leader and
 * pipes, then another proving the detached group is absent. A third grace is
 * reserved for that settled failure to cross the command runner before the CLI
 * re-signals itself; the outer owner must never pre-empt either inner proof.
 */
const CLI_INTERRUPT_CLEANUP_MS = 3 * GIT_MS.groupCleanup;

export { PROCESS_GROUP_OBSERVATION_POLL_MS, GIT_MS, CLI_INTERRUPT_CLEANUP_MS };
