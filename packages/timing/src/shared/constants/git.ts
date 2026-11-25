// A Git command and the process group it runs in.

import { bound, delay, handed, polled } from "#shared/constants/uses.ts";

/**
 * Grace after Git termination for the detached group, leader and both output
 * pipes to disappear. A killed group normally leaves within milliseconds. The
 * macOS group once seen to outlive one second was not slow: a child forked
 * during the stop had escaped both group signals, which the stop barrier now
 * prevents. Three seconds stays below `git.command`, so failed cleanup is still
 * diagnosed before the command timeout would be. Each of its three uses below has
 * a name of its own.
 */
const GROUP_CLEANUP_MS = 3000;

/** Default for both the bounded Git runner and the runners that accept a number. */
const COMMAND_MS = 5000;

/** One Git command: its bound, and the end of its detached process group. */
const GIT = {
	/**
	 * Outer bound for one Git identity probe while an operation captures its checkout snapshot. Snapshot
	 * work runs before a model lock or synchronous note write, so this never extends either critical
	 * section. It is longer than the server mutation-drain refusal window: stop may refuse and keep the
	 * application intact while a slow probe is still cancellable by its request or application owner.
	 * The exception is code-target's probe of the checkout that holds the model: its Git calls, at
	 * most three, are synchronous for a synchronous check, so each can block the event loop this long.
	 * Handed to the command runner, which a caller may give a longer bound of its own.
	 */
	"git.command": handed(COMMAND_MS),
	/** The asynchronous runner's bound before it starts termination and proves cleanup. */
	"git.commandRun": bound(COMMAND_MS, "a Git command to finish"),
	/** How long a terminated Git command's output and exit may take to settle. */
	"git.groupCleanup": bound(GROUP_CLEANUP_MS, "a terminated Git command to settle"),
	/** How long a terminated Git group may take to disappear. */
	"git.groupGone": polled(GROUP_CLEANUP_MS, "a terminated Git process group to disappear"),
	/** How long a stopped Git group may take to freeze before it is killed. */
	"git.groupFreeze": polled(GROUP_CLEANUP_MS, "a stopped Git process group to freeze"),
	/**
	 * Outer grace before an interrupted CLI restores the signal's default action.
	 * Git may spend one cleanup grace terminating and cancelling its leader and
	 * pipes, then another proving the detached group is absent. A third grace is
	 * reserved for that settled failure to cross the command runner before the CLI
	 * re-signals itself; the outer owner must never pre-empt either inner proof.
	 */
	"git.cliInterruptCleanup": delay(3 * GROUP_CLEANUP_MS),
};

export { GIT };
