import { publicChild } from "@/runtime/codex-process/lib/process-child";
import {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	CodexProcessError,
	type CodexProcess,
	type CodexProcessChild,
	type CodexProcessDependencies,
	type CodexProcessExit,
	type CodexProcessFailure,
	type CodexProcessFailureCode,
	type CodexProcessLifecycle,
	type CodexProcessOptions,
	type CodexProcessSnapshot,
	type CodexProcessState,
	type CodexProcessStorageInput,
	type CodexProcessTestOptions,
} from "@/runtime/codex-process/lib/process-contract";
import {
	createOwnerState,
	processErrorFrom,
	rejectPendingStart,
	retireListener,
	snapshot,
	terminalFailure,
	type ProcessOwnerState,
} from "@/runtime/codex-process/lib/process-owner-state";
import { stop } from "@/runtime/codex-process/lib/process-shutdown";
import { spawnAttempt } from "@/runtime/codex-process/lib/process-spawn";

/**
 * Register the pending-start settlement and return the promise it settles.
 * @param state - The owner state.
 * @returns The promise the next readiness or failure settles.
 */
function pendingStart(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	const pending = new Promise<CodexProcessSnapshot>((resolve, reject) => {
		state.resolveStart = resolve;
		state.rejectStart = reject;
	});
	state.startPromise = pending;
	return pending;
}

/**
 * Begin a fresh start: register the pending settlement, then spawn, turning
 * a synchronous spawn failure into the start's rejection.
 * @param state - The owner state.
 * @returns The promise settled by readiness or failure.
 */
function beginStart(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	const pending = pendingStart(state);
	try {
		spawnAttempt(state);
	} catch (cause) {
		const error = processErrorFrom(
			state,
			cause,
			(message) =>
				new CodexProcessError({
					code: "spawn_failed",
					terminal: true,
					message: `Could not start the Codex app-server child: ${message}.`,
					cause,
				}),
		);
		if (state.state !== "terminal_failure") terminalFailure(state, error);
		rejectPendingStart(state, error);
	}
	return pending;
}

/**
 * Await readiness of a child that is already starting or running.
 * @param state - The owner state.
 * @returns The ready snapshot, or the existing pending start.
 */
function waitForReadiness(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	if (state.current?.ready) return Promise.resolve(snapshot(state));
	if (state.startPromise) return state.startPromise;
	if (!state.current)
		return Promise.reject(
			new CodexProcessError({
				code: "spawn_failed",
				terminal: true,
				message: "The Codex process is running without an owned child readiness record.",
			}),
		);
	return pendingStart(state);
}

/**
 * Reset the owner's failure bookkeeping before a fresh start.
 * @param state - The owner state.
 */
function resetForStart(state: ProcessOwnerState): void {
	state.stopping = false;
	state.terminalError = undefined;
	state.lastFailure = null;
	state.accountReady = false;
	state.stopPromise = undefined;
}

/**
 * Start the owner, or join whatever it is already doing: an in-flight start,
 * a backoff, a stop that must finish first, or a terminal failure.
 * @param state - The owner state.
 * @returns The snapshot once the app-server is ready, or the state's own answer.
 */
async function start(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	if (state.state === "running" || state.state === "starting") return waitForReadiness(state);
	if (state.state === "backoff" || state.state === "group_cleanup")
		return Promise.resolve(snapshot(state));
	if (state.state === "stopping" && state.stopPromise) {
		await state.stopPromise;
		return start(state);
	}
	if (state.state === "terminal_failure" && state.terminalError)
		return Promise.reject(state.terminalError);
	resetForStart(state);
	return beginStart(state);
}

/**
 * Read the live spawned child, if there is one.
 * @param state - The owner state.
 * @returns The public child handle, or null.
 */
function currentChild(state: ProcessOwnerState): CodexProcessChild | null {
	if (!state.current || state.current.closedHandled || !state.current.spawned) return null;
	return publicChild(state, state.current);
}

/**
 * Subscribe to spawned children, delivering the live one immediately.
 * @param state - The owner state.
 * @param listener - Receives each spawned child.
 * @returns The unsubscribe.
 */
function onChild(
	state: ProcessOwnerState,
	listener: (child: CodexProcessChild) => void,
): () => void {
	state.childListeners.add(listener);
	const active = currentChild(state);
	if (active) {
		try {
			listener(active);
		} catch (cause) {
			state.childListeners.delete(listener);
			retireListener(state, "child", cause);
		}
	}
	return () => state.childListeners.delete(listener);
}

/**
 * Own one dedicated, exact-argv Codex app-server child and its restart/stop policy.
 * @param options - The process options, with test seams when supplied.
 * @returns The process owner.
 */
function createCodexProcessInternal(options: CodexProcessTestOptions): CodexProcess {
	const state = createOwnerState(options);
	state.hooks.stop = () => stop(state);
	state.hooks.spawnAttempt = () => spawnAttempt(state);
	/**
	 * Subscribe to snapshot changes.
	 * @param listener - Receives each published snapshot.
	 * @returns The unsubscribe.
	 */
	const subscribe = (listener: (currentSnapshot: CodexProcessSnapshot) => void): (() => void) => {
		state.listeners.add(listener);
		return () => state.listeners.delete(listener);
	};
	return Object.freeze({
		start: () => start(state),
		stop: () => stop(state),
		snapshot: () => snapshot(state),
		currentChild: () => currentChild(state),
		onChild: (listener: (child: CodexProcessChild) => void) => onChild(state, listener),
		subscribe,
	});
}

/**
 * Production lifecycle entrypoint. Test seams are available from testing.ts.
 * @param options - The executable, checkout and storage to own.
 * @returns The process owner.
 */
function createCodexProcess(options: CodexProcessOptions): CodexProcess {
	return createCodexProcessInternal(options);
}

/**
 * Deterministic test entrypoint for injected process, storage, and clock seams.
 * @param options - The process options plus test seams.
 * @returns The process owner.
 */
function createCodexProcessForTesting(options: CodexProcessTestOptions): CodexProcess {
	return createCodexProcessInternal(options);
}

export {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	CodexProcessError,
	createCodexProcess,
	createCodexProcessForTesting,
	type CodexProcess,
	type CodexProcessChild,
	type CodexProcessDependencies,
	type CodexProcessExit,
	type CodexProcessFailure,
	type CodexProcessFailureCode,
	type CodexProcessLifecycle,
	type CodexProcessOptions,
	type CodexProcessSnapshot,
	type CodexProcessState,
	type CodexProcessStorageInput,
	type CodexProcessTestOptions,
};
