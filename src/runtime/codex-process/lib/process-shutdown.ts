import { CODEX_COMPOSED_SHUTDOWN_MS } from "@/shared/timing/timing";
import { ensureGroupCleanup } from "@/runtime/codex-process/lib/process-child";
import type {
	CodexProcessError,
	CodexProcessSnapshot,
} from "@/runtime/codex-process/lib/process-contract";
import {
	clearRestart,
	ownsChildren,
	processErrorFrom,
	rejectPendingStart,
	releaseStorage,
	safeCauseMessage,
	setState,
	shutdownError,
	snapshot,
	terminalFailure,
	type ChildRecord,
	type ProcessOwnerState,
	type UnprovenChild,
} from "@/runtime/codex-process/lib/process-owner-state";

/**
 * Close the live child's stdin so the app-server can exit on its own.
 * @param state - The owner state.
 * @param record - The live child, when any.
 * @returns A shutdown issue to surface after the child settles, or undefined.
 */
function closeStdin(
	state: ProcessOwnerState,
	record: ChildRecord | undefined,
): CodexProcessError | undefined {
	if (!record) return undefined;
	try {
		if (!record.child.stdin.destroyed && !record.child.stdin.writableEnded)
			record.child.stdin.end();
		return undefined;
	} catch (cause) {
		return shutdownError(
			state,
			`Could not close Codex child stdin: ${safeCauseMessage(state, cause)}. Recovery: retry stop after the child has settled.`,
		);
	}
}

/**
 * Drain one owned group and wait for its child to close before the deadline.
 * @param state - The owner state.
 * @param owned - The child generation.
 * @param deadlineAtMs - The composed shutdown deadline.
 */
async function settleOwnedChild(
	state: ProcessOwnerState,
	owned: ChildRecord,
	deadlineAtMs: number,
): Promise<void> {
	await ensureGroupCleanup(state, owned, deadlineAtMs);
	if (owned.closedHandled) return;
	const result = await state.processGroupCleanup.waitForClosedOrAt(owned.closed, deadlineAtMs);
	if (result === "time")
		throw shutdownError(
			state,
			"The Codex child did not close before the composed shutdown deadline. Recovery: inspect the retained process group and retry stop.",
		);
}

/**
 * Kill a child whose group was never proved and wait for it to close.
 * @param state - The owner state.
 * @param unproven - The retained child.
 * @param deadlineAtMs - The composed shutdown deadline.
 */
async function settleUnprovenChild(
	state: ProcessOwnerState,
	unproven: UnprovenChild,
	deadlineAtMs: number,
): Promise<void> {
	try {
		unproven.child.kill("SIGKILL");
	} catch (cause) {
		throw shutdownError(
			state,
			`Could not kill the Codex child whose process group was unavailable: ${safeCauseMessage(state, cause)}. Recovery: inspect the retained child and retry stop.`,
		);
	}
	const result = await state.processGroupCleanup.waitForClosedOrAt(unproven.closed, deadlineAtMs);
	if (result === "time")
		throw shutdownError(
			state,
			"The Codex child whose process group was unavailable did not close before the composed shutdown deadline. Recovery: inspect the retained child and retry stop.",
		);
}

/**
 * Rethrow the first failed shutdown task as a sanitized process error.
 * @param state - The owner state.
 * @param results - The settled shutdown tasks.
 */
function assertAllSettled(
	state: ProcessOwnerState,
	results: readonly PromiseSettledResult<void>[],
): void {
	const failed = results.find(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	if (!failed) return;
	throw processErrorFrom(state, failed.reason, (message) =>
		shutdownError(state, `Could not complete Codex shutdown: ${message}.`),
	);
}

/**
 * Refuse to report a successful stop unless every child and group is gone
 * before the deadline.
 * @param state - The owner state.
 * @param deadlineAtMs - The composed shutdown deadline.
 */
function assertQuiescent(state: ProcessOwnerState, deadlineAtMs: number): void {
	// TASK-151: this read was `>=` before the module was split. settleBeforeDeadline is
	// what proves lateness: it rejects when the deadline expires before the work finishes,
	// so reaching this line at all means the composed shutdown did complete in time. This
	// second clock read only catches time passing afterwards, which is why it is strict.
	// Restoring `>=` refuses a stop that provably settled, because the split moved this
	// read one clock turn later; process-lifecycle.test.ts holds that line.
	if (state.dependencies.now() > deadlineAtMs || ownsChildren(state))
		throw shutdownError(
			state,
			"Codex shutdown did not prove that the child and its process group are quiescent. Recovery: inspect the retained ownership and retry stop.",
		);
}

/**
 * The whole stop operation: cancel restarts, close stdin, drain every owned
 * and unproven child before the composed deadline, then release storage.
 * @param state - The owner state.
 * @returns The stopped snapshot.
 */
async function runShutdown(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	state.stopping = true;
	clearRestart(state);
	if (state.state !== "stopped") setState(state, "stopping");
	const deadlineAtMs = state.dependencies.now() + CODEX_COMPOSED_SHUTDOWN_MS;
	rejectPendingStart(
		state,
		shutdownError(
			state,
			"Codex startup was canceled by stop before app-server readiness. Recovery: await stop, then retry start.",
		),
	);
	const shutdownIssue = closeStdin(state, state.current);
	const work: Promise<void>[] = [
		...[...state.groups].map((owned) => settleOwnedChild(state, owned, deadlineAtMs)),
		...[...state.unprovenChildren].map((unproven) =>
			settleUnprovenChild(state, unproven, deadlineAtMs),
		),
	];
	assertAllSettled(state, await state.processGroupCleanup.settleBeforeDeadline(work, deadlineAtMs));
	assertQuiescent(state, deadlineAtMs);
	if (shutdownIssue) throw shutdownIssue;
	const releaseError = releaseStorage(state);
	if (releaseError) throw releaseError;
	state.accountReady = false;
	state.stopping = false;
	setState(state, "stopped");
	return snapshot(state);
}

/**
 * Stop the owner, sharing one in-flight operation between concurrent callers
 * and making a failed stop the owner's terminal failure.
 * @param state - The owner state.
 * @returns The stopped snapshot.
 */
function stop(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	if (state.stopPromise) return state.stopPromise;
	const operation = runShutdown(state);
	state.stopPromise = operation;
	void operation.catch((cause: unknown) => {
		if (state.stopPromise !== operation) return;
		state.stopPromise = undefined;
		terminalFailure(
			state,
			processErrorFrom(state, cause, (message) =>
				shutdownError(state, `Could not complete Codex shutdown: ${message}.`),
			),
		);
	});
	return operation;
}

export { stop };
