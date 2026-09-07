import {
	createCodexDiagnosticsBuffer,
	type CodexDiagnosticsBuffer,
} from "@/runtime/codex-process/lib/diagnostics";
import type { CodexChildEnvironment } from "@/runtime/codex-process/lib/environment";
import {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	CodexProcessError,
	type Child,
	type ChildExit,
	type CodexProcessChild,
	type CodexProcessExit,
	type CodexProcessFailure,
	type CodexProcessSnapshot,
	type CodexProcessState,
	type CodexProcessTestOptions,
	type Timer,
} from "@/runtime/codex-process/lib/process-contract";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/lib/process-group";
import {
	createProcessGroupCleanup,
	type ProcessGroupCleanup,
} from "@/runtime/codex-process/lib/process-group-cleanup";
import {
	diagnosticSecrets,
	truncateUtf8,
} from "@/runtime/codex-process/lib/process-startup-checks";
import type { PreparedCodexStorage } from "@/runtime/codex-process/lib/storage";
import {
	resolveDependencies,
	type OwnerDependencies,
} from "@/runtime/codex-process/lib/owner-dependencies";

const PUBLIC_DIAGNOSTIC_MAX_BYTES = CODEX_PROCESS_STDERR_MAX_BYTES;

/** A child whose process group could not be proved; retained until it closes. */
interface UnprovenChild {
	readonly child: Child;
	readonly closed: Promise<void>;
}

/** One spawned generation of the owned child and everything the owner tracks about it. */
interface ChildRecord {
	readonly child: Child;
	readonly group: CodexProcessGroupIdentity;
	readonly generation: number;
	readonly closed: Promise<ChildExit>;
	readonly resolveClosed: (exit: ChildExit) => void;
	spawned: boolean;
	ready: boolean;
	closedHandled: boolean;
	strictHint: boolean;
	strictTail: string;
	groupQuiescent: boolean;
	readinessTimer: Timer | undefined;
	groupCleanup: Promise<void> | undefined;
	error?: Error;
}

/**
 * Operations the state module cannot own because they close the cycle back
 * to spawning and stopping; the process owner binds them before first use.
 */
interface OwnerHooks {
	stop: () => Promise<CodexProcessSnapshot>;
	spawnAttempt: () => void;
}

/**
 * The mutable state of one process owner. Every lifecycle module reads and
 * writes this record instead of closing over local variables, which is what
 * lets the owner be split across files without changing its behaviour.
 */
interface ProcessOwnerState {
	readonly options: CodexProcessTestOptions;
	readonly dependencies: OwnerDependencies;
	readonly diagnostics: CodexDiagnosticsBuffer;
	readonly listeners: Set<(snapshot: CodexProcessSnapshot) => void>;
	readonly childListeners: Set<(child: CodexProcessChild) => void>;
	readonly groups: Set<ChildRecord>;
	readonly unprovenChildren: Set<UnprovenChild>;
	readonly processGroupCleanup: ProcessGroupCleanup;
	readonly hooks: OwnerHooks;
	state: CodexProcessState;
	executablePath: string;
	argv: readonly string[];
	cwd: string | null;
	environment: CodexChildEnvironment | null;
	storage: PreparedCodexStorage | undefined;
	storageCleanup: (() => void) | undefined;
	current: ChildRecord | undefined;
	restartTimer: Timer | undefined;
	restartAttempt: number;
	nextRestartAtMs: number | null;
	restartDelayMs: number | null;
	accountReady: boolean;
	lastExit: CodexProcessExit | null;
	lastFailure: CodexProcessFailure | null;
	terminalError: CodexProcessError | undefined;
	stopPromise: Promise<CodexProcessSnapshot> | undefined;
	startPromise: Promise<CodexProcessSnapshot> | undefined;
	resolveStart: ((snapshot: CodexProcessSnapshot) => void) | undefined;
	rejectStart: ((error: Error) => void) | undefined;
	stopping: boolean;
	nextGeneration: number;
}

/**
 * Redact and bound text before it becomes part of any public message.
 * @param state - The owner state.
 * @param text - The raw text.
 * @returns The public-safe text.
 */
function publicDiagnostic(state: ProcessOwnerState, text: string): string {
	return truncateUtf8(state.diagnostics.redact(text), PUBLIC_DIAGNOSTIC_MAX_BYTES);
}

/**
 * Describe a caught value for a public message, never throwing.
 * @param state - The owner state.
 * @param cause - The caught value.
 * @returns The redacted description.
 */
function safeCauseMessage(state: ProcessOwnerState, cause: unknown): string {
	try {
		return publicDiagnostic(state, cause instanceof Error ? cause.message : String(cause));
	} catch {
		return "an unknown failure";
	}
}

/**
 * Rebuild a process error with its message redacted and bounded.
 * @param state - The owner state.
 * @param error - The internal error.
 * @returns The public error.
 */
function sanitizeProcessError(
	state: ProcessOwnerState,
	error: CodexProcessError,
): CodexProcessError {
	return new CodexProcessError({
		code: error.code,
		terminal: error.terminal,
		message: publicDiagnostic(state, error.message),
	});
}

/**
 * Build a terminal shutdown failure.
 * @param state - The owner state.
 * @param message - The reason.
 * @returns The terminal error.
 */
function shutdownError(state: ProcessOwnerState, message: string): CodexProcessError {
	return new CodexProcessError({
		code: "shutdown_failed",
		terminal: true,
		message: publicDiagnostic(state, message),
	});
}

/**
 * Convert a process error into the frozen public failure value.
 * @param state - The owner state.
 * @param error - The process error.
 * @returns The failure value shown in snapshots.
 */
function failureValue(state: ProcessOwnerState, error: CodexProcessError): CodexProcessFailure {
	return Object.freeze({
		code: error.code,
		message: publicDiagnostic(state, error.message),
		terminal: error.terminal,
	});
}

/**
 * Cancel a timer, ignoring a scheduler that no longer knows it.
 * @param state - The owner state.
 * @param timer - The timer, when one is set.
 */
function cancelTimer(state: ProcessOwnerState, timer: Timer | undefined): void {
	if (timer === undefined) return;
	try {
		state.dependencies.cancel(timer);
	} catch {
		/* A timer that already fired has no further ownership. */
	}
}

/**
 * Create the owner state with production defaults applied and the process
 * group cleanup bound to the owner's clock and diagnostics.
 * @param options - The process options.
 * @returns The mutable owner state; its hooks must be bound before use.
 */
function createOwnerState(options: CodexProcessTestOptions): ProcessOwnerState {
	const dependencies = resolveDependencies(options);
	const state: ProcessOwnerState = {
		options,
		dependencies,
		diagnostics: createCodexDiagnosticsBuffer(
			options.stderrLimitBytes ?? CODEX_PROCESS_STDERR_MAX_BYTES,
			diagnosticSecrets(options),
		),
		listeners: new Set(),
		childListeners: new Set(),
		groups: new Set(),
		unprovenChildren: new Set(),
		processGroupCleanup: createProcessGroupCleanup(
			dependencies.processGroup,
			{
				now: dependencies.now,
				schedule: dependencies.schedule,
				/**
				 * Cancel a timer through the owner, so a cancel failure is charged to it.
				 * @param timer - The timer to cancel.
				 */
				cancel: (timer): void => {
					cancelTimer(state, timer);
				},
			},
			{
				/**
				 * Build the terminal failure a cleanup breach becomes.
				 * @param message - The reason.
				 * @returns The terminal error.
				 */
				failure: (message) => shutdownError(state, message),
				/**
				 * Describe a caught value for a public message.
				 * @param cause - The caught value.
				 * @returns The redacted description.
				 */
				safeCauseMessage: (cause) => safeCauseMessage(state, cause),
			},
		),
		hooks: {
			/**
			 * Placeholder until the owner binds the real stop.
			 * @returns Never; throws.
			 */
			stop: () => Promise.reject(new Error("Codex process owner hooks are not bound.")),
			/**
			 * Placeholder until the owner binds the real spawn attempt.
			 */
			spawnAttempt: () => {
				throw new Error("Codex process owner hooks are not bound.");
			},
		},
		state: "stopped",
		executablePath: options.executablePath,
		argv: Object.freeze([options.executablePath, ...CODEX_APP_SERVER_ARGUMENTS]),
		cwd: null,
		environment: null,
		storage: undefined,
		storageCleanup: undefined,
		current: undefined,
		restartTimer: undefined,
		restartAttempt: 0,
		nextRestartAtMs: null,
		restartDelayMs: null,
		accountReady: false,
		lastExit: null,
		lastFailure: null,
		terminalError: undefined,
		stopPromise: undefined,
		startPromise: undefined,
		resolveStart: undefined,
		rejectStart: undefined,
		stopping: false,
		nextGeneration: 0,
	};
	return state;
}

/**
 * The pid the snapshot reports: the current child's, or an unproven child's while the owner
 * is still deciding whether that child is its own.
 * @param state - The owner state.
 * @returns The pid, or null when no child is spawned.
 */
function snapshotPid(state: ProcessOwnerState): number | null {
	const current = state.current?.child.pid;
	if (current !== undefined) {
		return current;
	}
	return state.unprovenChildren.values().next().value?.child.pid ?? null;
}

/**
 * Read the public snapshot of the owner.
 * @param state - The owner state.
 * @returns The frozen snapshot.
 */
function snapshot(state: ProcessOwnerState): CodexProcessSnapshot {
	return Object.freeze({
		state: state.state,
		pid: snapshotPid(state),
		executablePath: state.executablePath,
		argv: Object.freeze([...state.argv]),
		cwd: state.cwd,
		ready: state.current?.ready === true,
		accountReady: state.accountReady,
		restartAttempt: state.restartAttempt,
		nextRestartAtMs: state.nextRestartAtMs,
		restartDelayMs: state.restartDelayMs,
		stderr: state.diagnostics.snapshot(),
		lastExit: state.lastExit,
		failure: state.lastFailure,
	});
}

/**
 * Build the terminal failure that retires a throwing listener.
 * @param state - The owner state.
 * @param kind - Which listener set failed.
 * @param cause - What the listener threw.
 * @returns The terminal error.
 */
function listenerFailure(
	state: ProcessOwnerState,
	kind: "snapshot" | "child",
	cause: unknown,
): CodexProcessError {
	return new CodexProcessError({
		code: "listener_failed",
		terminal: true,
		message: publicDiagnostic(
			state,
			`Codex ${kind} listener failed: ${safeCauseMessage(state, cause)}. Recovery: the listener was retired; inspect the terminal owner and retry after fixing the listener.`,
		),
	});
}

/**
 * Decide whether anything spawned is still owned and must be stopped.
 * @param state - The owner state.
 * @returns True while a child, group or unproven child remains.
 */
function ownsChildren(state: ProcessOwnerState): boolean {
	return state.current !== undefined || state.groups.size > 0 || state.unprovenChildren.size > 0;
}

/**
 * Retire a throwing listener: the owner becomes terminal and, when a child is
 * still owned, stops it.
 * @param state - The owner state.
 * @param kind - Which listener set failed.
 * @param cause - What the listener threw.
 */
function retireListener(
	state: ProcessOwnerState,
	kind: "snapshot" | "child",
	cause: unknown,
): void {
	terminalFailure(state, listenerFailure(state, kind, cause));
	if (!state.stopping && ownsChildren(state)) void state.hooks.stop().catch(() => undefined);
}

/**
 * Deliver the current snapshot to every listener, retiring the ones that throw.
 * @param state - The owner state.
 */
function publish(state: ProcessOwnerState): void {
	const currentSnapshot = snapshot(state);
	const failures: unknown[] = [];
	for (const listener of Array.from(state.listeners)) {
		try {
			listener(currentSnapshot);
		} catch (cause) {
			state.listeners.delete(listener);
			failures.push(cause);
		}
	}
	for (const cause of failures) retireListener(state, "snapshot", cause);
}

/**
 * Move to a new lifecycle state and publish it.
 * @param state - The owner state.
 * @param next - The new lifecycle state.
 */
function setState(state: ProcessOwnerState, next: CodexProcessState): void {
	state.state = next;
	publish(state);
}

/**
 * Reject the pending start, if any, and forget it.
 * @param state - The owner state.
 * @param error - The rejection.
 */
function rejectPendingStart(state: ProcessOwnerState, error: Error): void {
	const reject = state.rejectStart;
	state.resolveStart = undefined;
	state.rejectStart = undefined;
	state.startPromise = undefined;
	if (reject) reject(error);
}

/**
 * Resolve the pending start, if any, with the current snapshot.
 * @param state - The owner state.
 */
function resolvePendingStart(state: ProcessOwnerState): void {
	const resolve = state.resolveStart;
	state.resolveStart = undefined;
	state.rejectStart = undefined;
	state.startPromise = undefined;
	if (resolve) resolve(snapshot(state));
}

/**
 * Cancel a child's readiness timeout.
 * @param state - The owner state.
 * @param record - The child generation.
 */
function clearReadiness(state: ProcessOwnerState, record: ChildRecord): void {
	cancelTimer(state, record.readinessTimer);
	record.readinessTimer = undefined;
}

/**
 * Cancel a scheduled restart and clear its public timing.
 * @param state - The owner state.
 */
function clearRestart(state: ProcessOwnerState): void {
	cancelTimer(state, state.restartTimer);
	state.restartTimer = undefined;
	state.nextRestartAtMs = null;
	state.restartDelayMs = null;
}

/**
 * Run one storage cleanup step, recording and returning its failure so the
 * capability is retained for a later retry.
 * @param state - The owner state.
 * @param step - The release to attempt.
 * @returns The shutdown failure, or undefined when the step succeeded.
 */
function releaseStorageStep(
	state: ProcessOwnerState,
	step: () => void,
): CodexProcessError | undefined {
	try {
		step();
		return undefined;
	} catch (cause) {
		const error = shutdownError(
			state,
			`Codex child ownership ended, but dedicated storage cleanup failed: ${safeCauseMessage(state, cause)}. Recovery: retry stop so the lock release can be attempted again.`,
		);
		state.lastFailure = failureValue(state, error);
		publish(state);
		return error;
	}
}

/**
 * Release the dedicated storage lock and any retained retry cleanup.
 * @param state - The owner state.
 * @returns The shutdown failure, or undefined when everything was released.
 */
function releaseStorage(state: ProcessOwnerState): CodexProcessError | undefined {
	const prepared = state.storage;
	const retryCleanup = state.storageCleanup;
	if (!prepared && !retryCleanup) return undefined;
	if (prepared) {
		const error = releaseStorageStep(state, () => {
			prepared.release();
			state.storage = undefined;
		});
		if (error) return error;
	}
	if (retryCleanup) {
		return releaseStorageStep(state, () => {
			retryCleanup();
			state.storageCleanup = undefined;
		});
	}
	return undefined;
}

/**
 * Release storage once nothing spawned remains, and make a release failure
 * the owner's terminal error.
 * @param state - The owner state.
 */
function releaseStorageWhenIdle(state: ProcessOwnerState): void {
	if (ownsChildren(state)) return;
	const cleanupError = releaseStorage(state);
	if (cleanupError) {
		state.terminalError = cleanupError;
		state.lastFailure = failureValue(state, cleanupError);
		publish(state);
	}
}

/**
 * Make the owner terminal: cancel any restart, record the failure, reject a
 * pending start, and release storage when no child remains.
 * @param state - The owner state.
 * @param error - The terminal failure.
 */
function terminalFailure(state: ProcessOwnerState, error: CodexProcessError): void {
	const sanitized = sanitizeProcessError(state, error);
	clearRestart(state);
	state.terminalError = sanitized;
	state.lastFailure = failureValue(state, sanitized);
	state.accountReady = false;
	if (state.current) {
		state.current.ready = false;
		clearReadiness(state, state.current);
	}
	setState(state, "terminal_failure");
	rejectPendingStart(state, sanitized);
	releaseStorageWhenIdle(state);
}

/**
 * Convert any caught value into a sanitized process error.
 * @param state - The owner state.
 * @param cause - The caught value.
 * @param fallback - Builds the error for a value that is not already a process error.
 * @returns The public process error.
 */
function processErrorFrom(
	state: ProcessOwnerState,
	cause: unknown,
	fallback: (message: string) => CodexProcessError,
): CodexProcessError {
	return cause instanceof CodexProcessError
		? sanitizeProcessError(state, cause)
		: fallback(safeCauseMessage(state, cause));
}

export {
	cancelTimer,
	clearReadiness,
	clearRestart,
	createOwnerState,
	failureValue,
	ownsChildren,
	processErrorFrom,
	publicDiagnostic,
	publish,
	rejectPendingStart,
	releaseStorage,
	releaseStorageWhenIdle,
	resolvePendingStart,
	retireListener,
	safeCauseMessage,
	sanitizeProcessError,
	setState,
	shutdownError,
	snapshot,
	terminalFailure,
	type ChildRecord,
	type ProcessOwnerState,
	type UnprovenChild,
};
