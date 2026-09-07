import { buildCodexChildEnvironment } from "@/runtime/codex-process/lib/environment";
import { CodexExecutableError } from "@/runtime/codex-process/lib/executable";
import { attachChildHandlers } from "@/runtime/codex-process/lib/process-child";
import {
	CODEX_APP_SERVER_ARGUMENTS,
	CodexProcessError,
	type Child,
	type ChildExit,
} from "@/runtime/codex-process/lib/process-contract";
import {
	failureValue,
	processErrorFrom,
	publicDiagnostic,
	rejectPendingStart,
	safeCauseMessage,
	sanitizeProcessError,
	setState,
	shutdownError,
	terminalFailure,
	type ChildRecord,
	type ProcessOwnerState,
	type UnprovenChild,
} from "@/runtime/codex-process/lib/process-owner-state";
import {
	canonicalCheckout,
	exactArguments,
	executableFailureCode,
} from "@/runtime/codex-process/lib/process-startup-checks";
import { CodexStorageError, type PreparedCodexStorage } from "@/runtime/codex-process/lib/storage";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/lib/process-group";

/**
 * Make a startup failure terminal and rethrow it so the caller unwinds. The function never
 * returns.
 * @param state - The owner state.
 * @param error - The startup failure.
 */
function failStartup(state: ProcessOwnerState, error: CodexProcessError): never {
	terminalFailure(state, error);
	throw error;
}

/**
 * Verify the configured executable and record its resolved path.
 * @param state - The owner state.
 */
function verifyExecutableStage(state: ProcessOwnerState): void {
	try {
		state.executablePath = state.dependencies.verifyExecutable(
			state.options.executablePath,
		).executablePath;
	} catch (cause) {
		failStartup(
			state,
			cause instanceof CodexExecutableError
				? new CodexProcessError({
						code: executableFailureCode(cause),
						terminal: true,
						message: publicDiagnostic(state, cause.message),
					})
				: new CodexProcessError({
						code: "binary_invalid",
						terminal: true,
						message: `Could not verify the configured Codex executable: ${safeCauseMessage(state, cause)}.`,
						cause,
					}),
		);
	}
}

/**
 * Fix the exact argv for this spawn.
 * @param state - The owner state.
 */
function exactArgumentsStage(state: ProcessOwnerState): void {
	try {
		state.argv = exactArguments(state.options.argv, state.executablePath);
	} catch (cause) {
		failStartup(
			state,
			processErrorFrom(
				state,
				cause,
				(message) =>
					new CodexProcessError({
						code: "binary_invalid",
						terminal: true,
						message: `The configured Codex child argv is invalid: ${message}.`,
						cause,
					}),
			),
		);
	}
}

/**
 * Resolve the checkout cwd once per owner.
 * @param state - The owner state.
 * @returns The canonical checkout directory.
 */
function checkoutStage(state: ProcessOwnerState): string {
	if (state.cwd) return state.cwd;
	try {
		state.cwd = canonicalCheckout(state.options.checkoutRoot);
		return state.cwd;
	} catch (cause) {
		return failStartup(
			state,
			processErrorFrom(
				state,
				cause,
				(message) =>
					new CodexProcessError({
						code: "storage_refused",
						terminal: true,
						message: `Could not establish the canonical Codex checkout cwd: ${message}.`,
						cause,
					}),
			),
		);
	}
}

/**
 * Classify a storage preparation failure for the owner.
 * @param state - The owner state.
 * @param cause - What preparation threw.
 * @returns The terminal process error.
 */
function storageFailure(state: ProcessOwnerState, cause: unknown): CodexProcessError {
	return cause instanceof CodexStorageError
		? new CodexProcessError({
				code: "storage_refused",
				terminal: true,
				message: `${publicDiagnostic(state, cause.message)} Recovery: use fresh owner-controlled 0700 CODEX_HOME and CODEX_SQLITE_HOME roots, then retry.`,
			})
		: new CodexProcessError({
				code: "storage_refused",
				terminal: true,
				message: `Could not prepare the dedicated Codex storage: ${safeCauseMessage(state, cause)}.`,
				cause,
			});
}

/**
 * Best-effort release of storage after preparation failed, retaining any
 * capability that could not be exercised for the terminal cleanup to retry.
 * @param state - The owner state.
 * @param cause - What preparation threw.
 */
function unwindStorage(state: ProcessOwnerState, cause: unknown): void {
	if (cause instanceof CodexStorageError) state.storageCleanup = cause.retryCleanup;
	if (state.storage) {
		try {
			state.storage.release();
			state.storage = undefined;
		} catch {
			/* Retain storage ownership so terminal cleanup can retry the lock release. */
		}
	}
	if (state.storageCleanup) {
		try {
			state.storageCleanup();
			state.storageCleanup = undefined;
		} catch {
			/* Retain the recovery capability for the next stop attempt. */
		}
	}
}

/**
 * Prepare dedicated storage and the child environment once per owner.
 * @param state - The owner state.
 * @returns The prepared storage.
 */
function storageStage(state: ProcessOwnerState): PreparedCodexStorage {
	if (state.storage) return state.storage;
	try {
		const storage = state.dependencies.prepareStorage(
			state.options.storage,
			state.dependencies.fileSystem === undefined
				? {}
				: { fileSystem: state.dependencies.fileSystem },
		);
		state.storage = storage;
		state.environment = buildCodexChildEnvironment({
			...(state.options.ambientEnvironment === undefined
				? {}
				: { ambient: state.options.ambientEnvironment }),
			codexHome: storage.codexHome,
			sqliteHome: storage.sqliteHome,
		});
		return storage;
	} catch (cause) {
		const error = storageFailure(state, cause);
		unwindStorage(state, cause);
		return failStartup(state, error);
	}
}

/**
 * Spawn the exact app-server child, refusing one without a pid.
 * @param state - The owner state.
 * @param cwd - The canonical checkout directory.
 * @returns The spawned child, which has a pid.
 */
function spawnStage(state: ProcessOwnerState, cwd: string): Child {
	if (!state.environment) throw new Error("Codex process lost prepared startup state.");
	let child: Child;
	try {
		child = state.dependencies.spawnChild(state.executablePath, [...CODEX_APP_SERVER_ARGUMENTS], {
			cwd,
			env: state.environment,
			shell: false,
			detached: true,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
	} catch (cause) {
		return failStartup(
			state,
			new CodexProcessError({
				code: "spawn_failed",
				terminal: true,
				message: `Could not spawn the exact Codex app-server child with argv ${JSON.stringify(state.argv)}: ${safeCauseMessage(state, cause)}.`,
				cause,
			}),
		);
	}
	if (child.pid !== undefined) return child;
	const error = new CodexProcessError({
		code: "spawn_failed",
		terminal: true,
		message: `The Codex app-server child did not expose a PID after spawn.`,
	});
	terminalFailure(state, error);
	try {
		child.kill("SIGKILL");
	} catch {
		/* No PID means there is no known child to reap. */
	}
	throw error;
}

/**
 * Retain a child whose process group could not be proved: the owner is
 * terminal, the child is killed, and stop keeps retrying until it closes.
 * @param state - The owner state.
 * @param child - The spawned child.
 * @param cause - Why the group could not be captured.
 */
function retainUnprovenChild(state: ProcessOwnerState, child: Child, cause: unknown): void {
	const error = new CodexProcessError({
		code: "spawn_failed",
		terminal: true,
		message: `Could not prove ownership of the Codex process group after spawn. Recovery: refuse restart until the child-group boundary is available.`,
		cause,
	});
	let resolveClosed!: () => void;
	const unproven: UnprovenChild = {
		child,
		closed: new Promise<void>((resolve) => void (resolveClosed = resolve)),
	};
	state.unprovenChildren.add(unproven);
	child.once("close", () => {
		state.unprovenChildren.delete(unproven);
		resolveClosed();
		if (!state.stopping) terminalFailure(state, error);
	});
	state.terminalError = sanitizeProcessError(state, error);
	state.lastFailure = failureValue(state, state.terminalError);
	state.accountReady = false;
	setState(state, "terminal_failure");
	try {
		child.kill("SIGKILL");
	} catch {
		/* stop() retains this exact child handle and retries before it can report success. */
	}
}

/**
 * Create the owned record for a child whose group was captured.
 * @param state - The owner state.
 * @param child - The spawned child.
 * @param group - The proved process group.
 * @returns The new current child record.
 */
function createChildRecord(
	state: ProcessOwnerState,
	child: Child,
	group: CodexProcessGroupIdentity,
): ChildRecord {
	let resolveClosed!: ChildRecord["resolveClosed"];
	const closed = new Promise<ChildExit>((resolve) => {
		resolveClosed = resolve;
	});
	state.nextGeneration += 1;
	const record: ChildRecord = {
		child,
		group,
		generation: state.nextGeneration,
		closed,
		resolveClosed,
		spawned: false,
		ready: false,
		closedHandled: false,
		strictHint: false,
		strictTail: "",
		groupQuiescent: false,
		readinessTimer: undefined,
		groupCleanup: undefined,
	};
	state.current = record;
	state.groups.add(record);
	return record;
}

/**
 * Publish the owned group to the outer cleanup boundary; a throwing boundary
 * is terminal and stops the owner.
 * @param state - The owner state.
 * @param group - The proved process group.
 */
function publishGroup(state: ProcessOwnerState, group: CodexProcessGroupIdentity): void {
	try {
		state.options.onGroupOwned?.(group);
	} catch (cause) {
		const error = shutdownError(
			state,
			`Could not publish the owned Codex process group to the application cleanup boundary: ${safeCauseMessage(state, cause)}.`,
		);
		terminalFailure(state, error);
		rejectPendingStart(state, sanitizeProcessError(state, error));
		void state.hooks.stop().catch(() => undefined);
	}
}

/**
 * Decide, after publishing the starting state, whether the attempt should
 * continue; a listener may have stopped the owner meanwhile.
 * @param state - The owner state.
 * @returns True when the spawn should proceed.
 */
function stillStarting(state: ProcessOwnerState): boolean {
	return state.state === "starting" && !state.stopping;
}

/**
 * Run one spawn attempt through every startup stage, each of which makes the
 * owner terminal and throws when it fails.
 * @param state - The owner state.
 */
function spawnAttempt(state: ProcessOwnerState): void {
	if (state.stopping) return;
	setState(state, "starting");
	if (!stillStarting(state)) return;
	verifyExecutableStage(state);
	exactArgumentsStage(state);
	const cwd = checkoutStage(state);
	storageStage(state);
	const child = spawnStage(state, cwd);
	let group: CodexProcessGroupIdentity;
	try {
		group = state.dependencies.processGroup.capture(child.pid!);
	} catch (cause) {
		retainUnprovenChild(state, child, cause);
		return;
	}
	const record = createChildRecord(state, child, group);
	attachChildHandlers(state, record);
	publishGroup(state, group);
}

export { spawnAttempt };
