import { TimedOut, within } from "@archboard/timing";
import { ensureGroupCleanup } from "#runtime/processes/process-child.ts";
import type {
	CodexProcessError,
	CodexProcessSnapshot,
} from "#runtime/processes/process-contract.ts";
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
} from "#runtime/processes/process-owner-state.ts";

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
 * Let the current child consume stdin EOF before signalling its remaining group.
 * @param record The current child, when any.
 * @param signal The composed shutdown.
 */
async function awaitStdinEof(record: ChildRecord | undefined, signal: AbortSignal): Promise<void> {
	if (record === undefined || record.closedHandled) return;
	await within("codex.stdinEofGrace", () => record.closed, { signal }).catch(() => undefined);
}

/**
 * Wait for a child to close within the composed shutdown.
 * @param closed Settles when the child closes.
 * @param signal The composed shutdown.
 * @returns False when the composed shutdown ended first.
 */
async function closesInTime(closed: Promise<unknown>, signal: AbortSignal): Promise<boolean> {
	try {
		await within("codex.composedShutdown", () => closed, { signal });
		return true;
	} catch (error) {
		if (error instanceof TimedOut) return false;
		throw error;
	}
}

/**
 * Drain one owned group and wait for its child to close within the composed shutdown.
 * @param state - The owner state.
 * @param owned - The child generation.
 * @param signal - The composed shutdown.
 */
async function settleOwnedChild(
	state: ProcessOwnerState,
	owned: ChildRecord,
	signal: AbortSignal,
): Promise<void> {
	await ensureGroupCleanup(state, owned, signal);
	if (owned.closedHandled) return;
	if (!(await closesInTime(owned.closed, signal)))
		throw shutdownError(
			state,
			"The Codex child did not close before the composed shutdown deadline. Recovery: inspect the retained process group and retry stop.",
		);
}

/**
 * Kill a child whose group was never proved and wait for it to close.
 * @param state - The owner state.
 * @param unproven - The retained child.
 * @param signal - The composed shutdown.
 */
async function settleUnprovenChild(
	state: ProcessOwnerState,
	unproven: UnprovenChild,
	signal: AbortSignal,
): Promise<void> {
	try {
		unproven.child.kill("SIGKILL");
	} catch (cause) {
		throw shutdownError(
			state,
			`Could not kill the Codex child whose process group was unavailable: ${safeCauseMessage(state, cause)}. Recovery: inspect the retained child and retry stop.`,
		);
	}
	if (!(await closesInTime(unproven.closed, signal)))
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
 * Refuse to report a successful stop unless every child and group is gone.
 * @param state - The owner state.
 */
function assertQuiescent(state: ProcessOwnerState): void {
	if (ownsChildren(state))
		throw shutdownError(
			state,
			"Codex shutdown did not prove that the child and its process group are quiescent. Recovery: inspect the retained ownership and retry stop.",
		);
}

/**
 * Close stdin, then drain every owned and unproven child, all within the composed shutdown.
 * @param state - The owner state.
 * @returns A shutdown issue to surface once everything settled, or undefined.
 */
async function drainChildren(state: ProcessOwnerState): Promise<CodexProcessError | undefined> {
	const shutdownIssue = closeStdin(state, state.current);
	try {
		await within("codex.composedShutdown", async (signal) => {
			if (shutdownIssue === undefined) await awaitStdinEof(state.current, signal);
			const work: Promise<void>[] = [
				...[...state.groups].map((owned) => settleOwnedChild(state, owned, signal)),
				...[...state.unprovenChildren].map((unproven) =>
					settleUnprovenChild(state, unproven, signal),
				),
			];
			assertAllSettled(state, await Promise.allSettled(work));
		});
	} catch (error) {
		if (!(error instanceof TimedOut)) throw error;
		throw shutdownError(
			state,
			"The composed Codex shutdown deadline expired. Recovery: inspect retained process ownership and retry stop.",
		);
	}
	return shutdownIssue;
}

/**
 * The whole stop operation: cancel restarts, close stdin, drain every owned
 * and unproven child within the composed shutdown, then release storage.
 * @param state - The owner state.
 * @returns The stopped snapshot.
 */
async function runShutdown(state: ProcessOwnerState): Promise<CodexProcessSnapshot> {
	state.stopping = true;
	clearRestart(state);
	if (state.state !== "stopped") setState(state, "stopping");
	rejectPendingStart(
		state,
		shutdownError(
			state,
			"Codex startup was canceled by stop before app-server readiness. Recovery: await stop, then retry start.",
		),
	);
	const shutdownIssue = await drainChildren(state);
	assertQuiescent(state);
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
