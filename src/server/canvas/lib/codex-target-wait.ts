import type { DynamicWaitEvent } from "@/runtime/codex-dynamic-tools";
import { CODEX_WAIT_TARGET_POLL_MS } from "@/shared/timing/timing";
import type { CodexWorkbenchComponents } from "@/server/canvas/codex-workbench-generation";
import type { CanvasCodexWorkbenchHost } from "@/server/canvas/lib/codex-workbench-production";

type WaitInput = Parameters<CanvasCodexWorkbenchHost["waitForTargets"]>[0];
type TargetThreadId = WaitInput["owner"]["sortedTargetThreadIds"][number];

/**
 * Pause for a bounded poll interval.
 * @param ms How long.
 * @returns Resolves after the pause.
 */
function sleepFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether one target thread has an approval waiting for a person.
 * @param workbench The active components.
 * @param threadId The thread.
 * @returns True when a pending approval targets it.
 */
function hasPendingApproval(
	workbench: CodexWorkbenchComponents,
	threadId: TargetThreadId,
): boolean {
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
	workbench: CodexWorkbenchComponents,
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
 * @returns The first event found, or null when every target is still working.
 */
async function observeTargetsOnce(
	workbench: CodexWorkbenchComponents,
	input: WaitInput,
): Promise<DynamicWaitEvent | null> {
	for (const threadId of input.owner.sortedTargetThreadIds) {
		// oxlint-disable-next-line no-await-in-loop -- targets are observed in their sorted order, one read at a time, and the first event wins
		const observed = await observeTarget(workbench, input, threadId);
		if (observed !== null) {
			return observed;
		}
	}
	return null;
}

/**
 * Wait for one of the owner's target threads to need attention or finish,
 * polling until the deadline.
 * @param workbench The active components.
 * @param input The wait.
 * @returns The event that ended the wait.
 */
async function waitForTargetsWith(
	workbench: CodexWorkbenchComponents,
	input: WaitInput,
): Promise<DynamicWaitEvent> {
	const deadline = Date.now() + input.timeoutMs;
	do {
		if (input.signal.aborted) {
			throw Object.assign(new Error("The dynamic wait was cancelled."), { code: "cancellation" });
		}
		// oxlint-disable-next-line no-await-in-loop -- each poll must see the previous one's answer before waiting again
		const observed = await observeTargetsOnce(workbench, input);
		if (observed !== null) {
			return observed;
		}
		const remaining = deadline - Date.now();
		if (remaining > 0) {
			// oxlint-disable-next-line no-await-in-loop -- the poll interval is the pause between sequential observations
			await sleepFor(Math.min(remaining, CODEX_WAIT_TARGET_POLL_MS));
		}
	} while (Date.now() < deadline);
	return {
		event: "timeout",
		threadId: null,
		sequence: input.previousSequence + 1,
		cursor: input.cursor,
	} satisfies DynamicWaitEvent;
}

export { waitForTargetsWith };
