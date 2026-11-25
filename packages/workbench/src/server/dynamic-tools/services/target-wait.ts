import type { CodexWorkbenchDomainScope } from "#runtime/voice/protocol/extension.ts";
import type { DynamicWaitEvent } from "#runtime/dynamic-tools/protocol/lifecycle-contract.ts";
import { pollUntil, TimedOut, within } from "@archboard/timing";
import type { ArchboardWorkbenchServer } from "#server/workbench-host/services/production.ts";

type WaitInput = Parameters<ArchboardWorkbenchServer["waitForTargets"]>[0];
type TargetThreadId = WaitInput["owner"]["sortedTargetThreadIds"][number];
type TargetWorkbench = {
	readonly identity: CodexWorkbenchDomainScope["identity"];
	readonly approvals: Pick<CodexWorkbenchDomainScope["approvals"], "inspect">;
	readonly session: Pick<CodexWorkbenchDomainScope["session"], "threadRead">;
};

/**
 * Whether one target thread has an approval waiting for a person.
 * @param workbench The active components.
 * @param threadId The thread.
 * @returns True when a pending approval targets it.
 */
function hasPendingApproval(workbench: TargetWorkbench, threadId: TargetThreadId): boolean {
	return workbench.approvals.inspect().some((snapshot) => {
		const identity = snapshot.identity;
		const targetThreadId = identity.kind === "legacy" ? identity.conversationId : identity.threadId;
		return snapshot.state === "pending" && targetThreadId === threadId;
	});
}

/**
 * Look once at one target thread for something worth waking the waiter for:
 * an approval needing attention, a failed thread, or a finished one.
 * @param workbench The active components.
 * @param input The wait.
 * @param threadId The thread.
 * @returns The event, or null while the thread is still working.
 */
async function observeTarget(
	workbench: TargetWorkbench,
	input: WaitInput,
	threadId: TargetThreadId,
): Promise<DynamicWaitEvent | null> {
	const wireThreadId = workbench.identity.identity.decoder.serializeCodexIdentity(threadId);
	const sequence = input.previousSequence + 1;
	if (hasPendingApproval(workbench, threadId)) {
		return {
			event: "attention",
			threadId: wireThreadId,
			sequence,
			cursor: input.cursor,
			targetOwned: true,
		};
	}
	const result = await workbench.session.threadRead({ threadId, includeTurns: false });
	if (result.thread.status.type === "systemError") {
		return { event: "attention", threadId: wireThreadId, sequence, cursor: input.cursor };
	}
	if (result.thread.status.type === "idle") {
		return { event: "completed", threadId: wireThreadId, sequence, cursor: input.cursor };
	}
	return null;
}

/**
 * Look once at every target thread, in their sorted order.
 * @param workbench The active components.
 * @param input The wait.
 * @param signal Stops the observation before another read can start.
 * @returns The first event found, or undefined when every target is still working.
 */
async function observeTargetsOnce(
	workbench: TargetWorkbench,
	input: WaitInput,
	signal: AbortSignal,
): Promise<DynamicWaitEvent | undefined> {
	signal.throwIfAborted();
	for (const threadId of input.owner.sortedTargetThreadIds) {
		// oxlint-disable-next-line no-await-in-loop -- targets are observed in their sorted order, one read at a time, and the first event wins
		const observed = await observeTarget(workbench, input, threadId);
		signal.throwIfAborted();
		if (observed !== null) {
			return observed;
		}
	}
	return undefined;
}

/**
 * Wait for one of the owner's target threads to need attention or finish,
 * polling until the deadline.
 * @param workbench The active components.
 * @param input The wait.
 * @returns The event that ended the wait.
 */
async function waitForTargetsWith(
	workbench: TargetWorkbench,
	input: WaitInput,
): Promise<DynamicWaitEvent> {
	try {
		// A wait of no length is a single observation.
		const event =
			input.timeoutMs === 0
				? await observeTargetsOnce(workbench, input, input.signal)
				: await within(
						"codex.dynamicWait",
						(signal) =>
							pollUntil(
								"codex.dynamicWaitLook",
								() => observeTargetsOnce(workbench, input, signal),
								{
									signal,
								},
							),
						{ ms: input.timeoutMs, signal: input.signal },
					);
		if (event !== undefined) return event;
	} catch (error) {
		if (input.signal.aborted) {
			throw Object.assign(new Error("The dynamic wait was cancelled."), { code: "cancellation" });
		}
		if (!(error instanceof TimedOut)) throw error;
	}
	return {
		event: "timeout",
		threadId: null,
		sequence: input.previousSequence + 1,
		cursor: input.cursor,
	} satisfies DynamicWaitEvent;
}

export { waitForTargetsWith };
