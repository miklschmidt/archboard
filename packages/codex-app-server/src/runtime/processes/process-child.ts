import { after, backoff, TimedOut, within } from "@archboard/timing";
import {
	CodexProcessError,
	type ChildExit,
	type CodexProcessExit,
} from "#runtime/processes/process-contract.ts";
import {
	clearReadiness,
	failureValue,
	processErrorFrom,
	publicDiagnostic,
	publish,
	rejectPendingStart,
	releaseStorage,
	retireListener,
	safeCauseMessage,
	sanitizeProcessError,
	setState,
	shutdownError,
	terminalFailure,
	type ChildRecord,
	type ProcessOwnerState,
} from "#runtime/processes/process-owner-state.ts";
import { exitFailureMessage, strictConfigHint } from "#runtime/processes/process-startup-checks.ts";

import { publicChild } from "#runtime/processes/child-generation.ts";

const STRICT_CONFIG_MATCH_WINDOW = 256;

/**
 * Mark a child generation quiescent once its process group has drained, and forget the
 * generation when its close has also been handled.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function markGroupQuiescent(state: ProcessOwnerState, record: ChildRecord): void {
	record.groupQuiescent = true;
	if (record.closedHandled) state.groups.delete(record);
}

/**
 * Give background cleanup a bound, then let it finish its escalation and final inspection.
 * @param state - The owner state.
 * @param record - The child generation.
 * @returns The cleanup's proof or failure.
 */
function cleanGroupInBackground(state: ProcessOwnerState, record: ChildRecord): Promise<void> {
	let cleanup: Promise<void> | undefined;
	return within("codex.composedShutdown", (signal) => {
		cleanup = state.processGroupCleanup.cleanup({ identity: record.group, signal });
		return cleanup;
	}).catch((cause: unknown) => {
		if (cause instanceof TimedOut && cleanup !== undefined) return cleanup;
		throw cause;
	});
}

/**
 * Start, or join, the process-group cleanup for a child generation.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param signal - A stop's composed shutdown, which the cleanup joins; without it, the
 * cleanup runs within a composed shutdown of its own.
 * @returns Settles when the group is quiescent, rejects when it cannot be proved so.
 */
function ensureGroupCleanup(
	state: ProcessOwnerState,
	record: ChildRecord,
	signal?: AbortSignal,
): Promise<void> {
	if (record.groupQuiescent) {
		markGroupQuiescent(state, record);
		return Promise.resolve();
	}
	if (record.groupCleanup) return record.groupCleanup;
	const pending =
		signal === undefined
			? cleanGroupInBackground(state, record)
			: state.processGroupCleanup.cleanup({ identity: record.group, signal });
	record.groupCleanup = pending;
	void pending.then(
		() => markGroupQuiescent(state, record),
		() => {
			if (record.groupCleanup === pending) record.groupCleanup = undefined;
		},
	);
	return pending;
}

/**
 * Turn a failed group cleanup into the owner's terminal failure.
 * @param state - The owner state.
 * @param cause - What cleanup rejected with.
 */
function groupCleanupFailed(state: ProcessOwnerState, cause: unknown): void {
	terminalFailure(
		state,
		processErrorFrom(state, cause, (message) =>
			shutdownError(state, `Could not complete Codex process-group cleanup: ${message}.`),
		),
	);
}

/**
 * Release storage after a terminal owner's last group drains, when nothing
 * else is still owned.
 * @param state - The owner state.
 */
function releaseStorageAfterTerminalCleanup(state: ProcessOwnerState): void {
	if (state.state !== "terminal_failure" || state.current || state.groups.size > 0) return;
	const cleanupError = releaseStorage(state);
	if (cleanupError) {
		state.terminalError = cleanupError;
		state.lastFailure = failureValue(state, cleanupError);
		publish(state);
	}
}

/**
 * Clean up a closed child's group in the background, releasing storage when
 * the terminal owner has nothing left.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function observeGroupCleanup(state: ProcessOwnerState, record: ChildRecord): void {
	const cleanup = ensureGroupCleanup(state, record);
	void cleanup.then(
		() => {
			releaseStorageAfterTerminalCleanup(state);
			return undefined;
		},
		(cause: unknown) => groupCleanupFailed(state, cause),
	);
}

/**
 * Classify why a child closed.
 * @param state - The owner state.
 * @param record - The child generation.
 * @returns The exit classification.
 */
function classifyExit(
	state: ProcessOwnerState,
	record: ChildRecord,
): CodexProcessExit["classification"] {
	if (state.stopping) return "requested";
	if (record.strictHint) return "strict_config";
	return record.ready ? "crash" : "early_exit";
}

/**
 * Run the scheduled restart, making any spawn failure terminal.
 * @param state - The owner state.
 */
function runScheduledRestart(state: ProcessOwnerState): void {
	state.restartTimer = undefined;
	state.nextRestartAtMs = null;
	state.restartDelayMs = null;
	if (state.stopping || state.state !== "backoff") return;
	try {
		state.hooks.spawnAttempt();
	} catch (cause) {
		terminalFailure(
			state,
			processErrorFrom(
				state,
				cause,
				(message) =>
					new CodexProcessError({
						code: "spawn_failed",
						terminal: true,
						message: `Could not restart the Codex child: ${message}.`,
						cause,
					}),
			),
		);
	}
}

/**
 * Enter backoff after an unexpected exit and schedule the next spawn.
 * @param state - The owner state.
 * @param exit - The exit code and signal.
 * @param classification - Whether the child crashed after readiness or exited early.
 */
function scheduleRestart(
	state: ProcessOwnerState,
	exit: ChildExit,
	classification: "early_exit" | "crash",
): void {
	const delayMs = backoff("codex.restart", state.restartAttempt);
	state.restartAttempt += 1;
	state.restartDelayMs = delayMs;
	state.nextRestartAtMs = Date.now() + delayMs;
	state.lastFailure = Object.freeze({
		code: classification,
		terminal: false,
		message: publicDiagnostic(
			state,
			exitFailureMessage(classification, exit, state.argv, state.diagnostics.snapshot()),
		),
	});
	setState(state, "backoff");
	const restart = setTimeout(() => runScheduledRestart(state), delayMs);
	/** Cancel the scheduled restart. */
	state.restartTimer = () => {
		clearTimeout(restart);
	};
}

/**
 * Watch pre-readiness stderr for a strict-config rejection, matching across
 * chunk boundaries with a bounded tail.
 * @param record - The child generation.
 * @param chunk - The stderr chunk.
 */
function updateStrictHint(record: ChildRecord, chunk: Uint8Array | string): void {
	const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
	record.strictHint ||= strictConfigHint(text);
	record.strictTail = `${record.strictTail}${text}`.slice(-STRICT_CONFIG_MATCH_WINDOW);
	record.strictHint ||= strictConfigHint(record.strictTail);
}

/**
 * Build the process error for an exit of the given classification.
 * @param state - The owner state.
 * @param classification - The exit classification.
 * @param exit - The exit code and signal.
 * @param terminal - Whether the failure ends the owner.
 * @param suffix - Extra guidance appended to the message.
 * @returns The process error.
 */
function exitError(
	state: ProcessOwnerState,
	classification: "early_exit" | "crash" | "strict_config",
	exit: ChildExit,
	terminal: boolean,
	suffix = "",
): CodexProcessError {
	return new CodexProcessError({
		code: classification === "strict_config" ? "strict_config_rejected" : classification,
		terminal,
		message: publicDiagnostic(
			state,
			exitFailureMessage(classification, exit, state.argv, state.diagnostics.snapshot()) + suffix,
		),
	});
}

/**
 * Handle an unexpected exit that is not terminal: reject an unready start,
 * drain the group, then schedule a restart unless stop intervened.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param exit - The exit code and signal.
 * @param classification - Crash or early exit.
 */
function recoverFromExit(
	state: ProcessOwnerState,
	record: ChildRecord,
	exit: ChildExit,
	classification: "early_exit" | "crash",
): void {
	if (!record.ready) rejectPendingStart(state, exitError(state, "early_exit", exit, false));
	setState(state, "group_cleanup");
	const cleanup = ensureGroupCleanup(state, record);
	void cleanup.then(
		() => {
			if (!state.stopping && state.state === "group_cleanup") {
				scheduleRestart(state, exit, classification);
			}
			return undefined;
		},
		(cause: unknown) => groupCleanupFailed(state, cause),
	);
}

/**
 * Record a child's close exactly once and route it to the matching recovery.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param exit - The exit code and signal.
 */
function handleClosed(state: ProcessOwnerState, record: ChildRecord, exit: ChildExit): void {
	if (record.closedHandled) return;
	record.closedHandled = true;
	clearReadiness(record);
	state.diagnostics.finalize();
	record.resolveClosed(exit);
	if (state.current === record) state.current = undefined;
	const classification = classifyExit(state, record);
	if (classification !== "requested") state.accountReady = false;
	state.lastExit = Object.freeze({ ...exit, classification });
	publish(state);
	routeClosedChild(state, record, exit, classification);
}

/**
 * Choose what a closed child means for the owner: a requested or already
 * terminal close only drains the group, a strict-config rejection is terminal,
 * anything else enters recovery.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param exit - The exit code and signal.
 * @param classification - The exit classification.
 */
function routeClosedChild(
	state: ProcessOwnerState,
	record: ChildRecord,
	exit: ChildExit,
	classification: CodexProcessExit["classification"],
): void {
	if (classification === "requested" || state.state === "terminal_failure") {
		observeGroupCleanup(state, record);
		return;
	}
	if (classification === "strict_config") {
		terminalFailure(
			state,
			exitError(
				state,
				"strict_config",
				exit,
				true,
				" Check config.toml and the exact strict argv.",
			),
		);
		observeGroupCleanup(state, record);
		return;
	}
	recoverFromExit(state, record, exit, classification);
}

/**
 * Fail the owner when the app-server never acknowledged readiness.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function readinessTimeout(state: ProcessOwnerState, record: ChildRecord): void {
	record.readinessTimer = undefined;
	if (state.current !== record || record.closedHandled || record.ready) return;
	if (state.stopping || state.state !== "running") return;
	terminalFailure(
		state,
		new CodexProcessError({
			code: "startup_timeout",
			terminal: true,
			message: `${new TimedOut("codex.readiness").message} Recovery: verify the app-server handshake and retry start.`,
		}),
	);
	void state.hooks.stop().catch(() => undefined);
}

/**
 * Hand the spawned child to every child listener, retiring the ones that throw.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function announceChild(state: ProcessOwnerState, record: ChildRecord): void {
	const childValue = publicChild(state, record);
	const failures: unknown[] = [];
	for (const listener of Array.from(state.childListeners)) {
		try {
			listener(childValue);
		} catch (cause) {
			state.childListeners.delete(listener);
			failures.push(cause);
		}
	}
	for (const cause of failures) retireListener(state, "child", cause);
}

/**
 * Decide, after publishing the running state, whether the child is still
 * the live one; a listener may have stopped the owner meanwhile.
 * @param state - The owner state.
 * @param record - The child generation.
 * @returns True when readiness tracking should begin.
 */
function stillRunning(state: ProcessOwnerState, record: ChildRecord): boolean {
	return state.state === "running" && !state.stopping && !record.closedHandled;
}

/**
 * React to the child's spawn event: enter running, arm the readiness timeout
 * and announce the child.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function handleSpawned(state: ProcessOwnerState, record: ChildRecord): void {
	if (record.closedHandled) return;
	record.spawned = true;
	if (state.stopping) return;
	setState(state, "running");
	if (!stillRunning(state, record)) return;
	record.readinessTimer = after("codex.readiness", () => readinessTimeout(state, record));
	announceChild(state, record);
}

/**
 * React to a child error; before spawn it is a terminal spawn failure.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param error - The child's error.
 */
function handleChildError(state: ProcessOwnerState, record: ChildRecord, error: Error): void {
	record.error = error;
	if (record.spawned) return;
	const processError = new CodexProcessError({
		code: "spawn_failed",
		terminal: true,
		message: `The Codex app-server child failed before spawn with argv ${JSON.stringify(state.argv)}: ${safeCauseMessage(state, error)}.`,
		cause: error,
	});
	terminalFailure(state, processError);
	rejectPendingStart(state, sanitizeProcessError(state, processError));
}

/**
 * Attach the owner's stderr, spawn, error and close handlers to a new child.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function attachChildHandlers(state: ProcessOwnerState, record: ChildRecord): void {
	record.child.stderr.on("data", (chunk: Buffer | string) => {
		if (!record.ready) updateStrictHint(record, chunk);
		state.diagnostics.append(chunk);
		publish(state);
	});
	record.child.stderr.resume();
	record.child.once("spawn", () => handleSpawned(state, record));
	record.child.once("error", (error) => handleChildError(state, record, error));
	record.child.once("close", (code, signal) => handleClosed(state, record, { code, signal }));
}

export { attachChildHandlers, ensureGroupCleanup, publicChild };
