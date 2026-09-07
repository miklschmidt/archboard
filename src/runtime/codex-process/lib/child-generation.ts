import {
	CodexProcessError,
	type CodexProcessChild,
	type CodexProcessLifecycle,
} from "@/runtime/codex-process/lib/process-contract";
import {
	clearReadiness,
	publicDiagnostic,
	publish,
	safeCauseMessage,
	resolvePendingStart,
	terminalFailure,
	type ChildRecord,
	type ProcessOwnerState,
} from "@/runtime/codex-process/lib/process-owner-state";

/**
 * Decide whether a lifecycle signal still belongs to the live child: the same
 * record, the same generation, not yet closed, and still an owned group.
 * @param state - The owner state.
 * @param record - The child generation the capability was minted for.
 * @param generation - The generation number the capability carries.
 * @returns True when the signal may act.
 */
function isCurrentGeneration(
	state: ProcessOwnerState,
	record: ChildRecord,
	generation: number,
): boolean {
	return (
		state.current === record &&
		record.generation === generation &&
		!record.closedHandled &&
		state.groups.has(record)
	);
}

/**
 * Accept the app-server's typed readiness for the live child and settle the
 * pending start.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param generation - The generation number the capability carries.
 */
function markAppServerReady(
	state: ProcessOwnerState,
	record: ChildRecord,
	generation: number,
): void {
	if (!isCurrentGeneration(state, record, generation) || state.stopping) return;
	if (state.state !== "running" || record.ready) return;
	record.ready = true;
	record.strictHint = false;
	record.strictTail = "";
	clearReadiness(state, record);
	publish(state);
	resolvePendingStart(state);
}

/**
 * Accept account readiness for a ready live child, which resets the restart
 * budget.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param generation - The generation number the capability carries.
 */
function markAccountReady(state: ProcessOwnerState, record: ChildRecord, generation: number): void {
	if (!isCurrentGeneration(state, record, generation) || state.state !== "running") return;
	if (!record.ready) return;
	state.accountReady = true;
	state.restartAttempt = 0;
	state.lastFailure = null;
	publish(state);
}

/**
 * Accept a terminal failure reported by the transport for the live child and
 * stop the owner.
 * @param state - The owner state.
 * @param record - The child generation.
 * @param generation - The generation number the capability carries.
 * @param message - What failed.
 * @param cause - The underlying failure, when any.
 */
function markTerminalFailure(
	state: ProcessOwnerState,
	record: ChildRecord,
	generation: number,
	message: string,
	cause?: unknown,
): void {
	if (!isCurrentGeneration(state, record, generation) || state.stopping) return;
	if (state.state !== "running") return;
	const detail = cause === undefined ? message : `${message}: ${safeCauseMessage(state, cause)}`;
	terminalFailure(
		state,
		new CodexProcessError({
			code: "strict_config_rejected",
			terminal: true,
			message: publicDiagnostic(state, detail),
		}),
	);
	void state.hooks.stop().catch(() => undefined);
}

/**
 * Mint the lifecycle capability bound to exactly this child generation.
 * @param state - The owner state.
 * @param record - The child generation.
 * @returns The frozen lifecycle capability.
 */
function childLifecycle(state: ProcessOwnerState, record: ChildRecord): CodexProcessLifecycle {
	const { generation } = record;
	return Object.freeze({
		/** Record that this generation's app-server answered initialize. */
		markAppServerReady: (): void => {
			markAppServerReady(state, record, generation);
		},
		/** Record that this generation's account is usable. */
		markAccountReady: (): void => {
			markAccountReady(state, record, generation);
		},
		/**
		 * End the owner on a failure this generation cannot recover from.
		 * @param message - What failed, for the public snapshot.
		 * @param cause - The underlying failure, never retained publicly.
		 */
		markTerminalFailure: (message: string, cause?: unknown): void => {
			markTerminalFailure(state, record, generation, message, cause);
		},
	});
}

/**
 * Expose a child generation as the public handle with live exit fields.
 * @param state - The owner state.
 * @param record - The child generation.
 * @returns The frozen public child.
 */
function publicChild(state: ProcessOwnerState, record: ChildRecord): CodexProcessChild {
	const child: CodexProcessChild = {
		pid: record.child.pid!,
		/**
		 * The child's exit code, read live because it is filled in on exit.
		 * @returns The code, or null while the child runs or when a signal ended it.
		 */
		get exitCode() {
			return record.child.exitCode;
		},
		/**
		 * The signal that ended the child, read live for the same reason.
		 * @returns The signal, or null while the child runs or when it exited by code.
		 */
		get signalCode() {
			return record.child.signalCode;
		},
		stdin: record.child.stdin,
		stdout: record.child.stdout,
		stderr: record.child.stderr,
		lifecycle: childLifecycle(state, record),
		/**
		 * Subscribe to one of the child's events.
		 * @param event - The event name.
		 * @param listener - The listener.
		 * @returns This handle, so subscriptions chain.
		 */
		on(event, listener) {
			record.child.on(event, listener);
			return child;
		},
		/**
		 * Remove a listener previously subscribed through this handle.
		 * @param event - The event name.
		 * @param listener - The listener.
		 * @returns This handle, so removals chain.
		 */
		removeListener(event, listener) {
			record.child.removeListener(event, listener);
			return child;
		},
	};
	return Object.freeze(child);
}

export { childLifecycle, isCurrentGeneration, publicChild };
