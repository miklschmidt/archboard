import type { ChildEpoch, ChildId, OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import type { ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import { cloneAndFreeze } from "@/runtime/codex-workhorse-start/lib/immutability";
import type {
	WorkhorseCleanupFacts,
	WorkhorseSettlementOutcome,
	WorkhorseSnapshot,
	WorkhorseStartFacts,
} from "@/runtime/codex-workhorse-start/lib/contract";

/**
 * The snapshot of a pane with no workhorse: every fact absent, which is what every other snapshot is built from.
 * @returns The frozen unbound snapshot.
 */
function emptySnapshot(): WorkhorseSnapshot {
	return cloneAndFreeze({
		kind: "codex_workhorse" as const,
		state: "unbound" as const,
		paneId: null,
		childId: null,
		epoch: null,
		threadId: null,
		operationId: null,
		outcome: null,
		start: null,
		binding: null,
		cleanup: null,
		reason: null,
	});
}

/**
 * The snapshot while a workhorse is being started: the operation is issued and its outcome is still pending, so a reader can tell a start in flight from one that never began.
 * @param paneId - The pane the workhorse belongs to.
 * @param childId - The Codex child the start runs against.
 * @param epoch - That child's epoch.
 * @param operationId - The issued operation identity.
 * @returns The frozen starting snapshot.
 */
function startingSnapshot(
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
): WorkhorseSnapshot {
	return cloneAndFreeze({
		...emptySnapshot(),
		state: "starting" as const,
		paneId,
		childId,
		epoch,
		operationId,
		outcome: "pending" as const,
	});
}

/**
 * The snapshot for a start that provably never reached Codex, so the pane may start another.
 * @param paneId - The pane the workhorse belongs to.
 * @param operationId - The issued operation identity.
 * @param reason - Why the start failed.
 * @returns The frozen failed snapshot.
 */
function failedSnapshot(
	paneId: string,
	operationId: OperationId,
	reason: string,
): WorkhorseSnapshot {
	return cloneAndFreeze({
		...emptySnapshot(),
		state: "failed" as const,
		paneId,
		operationId,
		outcome: "not_delivered" as const,
		reason,
	});
}

interface InspectSnapshotInput {
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId | null;
	readonly operationId: OperationId;
	readonly outcome: Exclude<WorkhorseSettlementOutcome, "pending">;
	readonly start: WorkhorseStartFacts | null;
	readonly binding: ThreadLinkBindingSnapshot | null;
	readonly cleanup: WorkhorseCleanupFacts | null;
	readonly reason: string;
}

/**
 * The snapshot for a workhorse that exists but must not be driven: a thread whose start could not be settled, or one left by a prior child. It keeps every fact so a person can inspect what happened.
 * @param input - The pane, child, thread, operation, outcome, start facts, binding, cleanup facts and reason.
 * @returns The frozen inspect-only snapshot.
 */
function inspectSnapshot(input: InspectSnapshotInput): WorkhorseSnapshot {
	return cloneAndFreeze({
		kind: "codex_workhorse" as const,
		state: "inspect_only" as const,
		paneId: input.paneId,
		childId: input.childId,
		epoch: input.epoch,
		threadId: input.threadId,
		operationId: input.operationId,
		outcome: input.outcome,
		start: input.start,
		binding: input.binding,
		cleanup: input.cleanup,
		reason: input.reason,
	});
}

/**
 * The snapshot for a workhorse that started, settled as delivered and is bound to its pane.
 * @param paneId - The pane the workhorse belongs to.
 * @param childId - The Codex child it runs on.
 * @param epoch - That child's epoch.
 * @param operationId - The issued operation identity.
 * @param start - What the start proved about the thread.
 * @param binding - The thread-link binding the pane holds.
 * @returns The frozen ready snapshot.
 */
function readySnapshot(
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	start: WorkhorseStartFacts,
	binding: ThreadLinkBindingSnapshot,
): WorkhorseSnapshot {
	return cloneAndFreeze({
		kind: "codex_workhorse" as const,
		state: "ready" as const,
		paneId,
		childId,
		epoch,
		threadId: start.threadId,
		operationId,
		outcome: "delivered" as const,
		start,
		binding,
		cleanup: null,
		reason: null,
	});
}

/**
 * What one cleanup attempt proved, kept on the snapshot so a thread that could not be deleted is visible rather than forgotten.
 * @param operationId - The cleanup operation identity.
 * @param threadId - The thread the cleanup targeted.
 * @param outcome - What the cleanup settled as.
 * @param reason - Why it did not deliver, when it did not.
 * @returns The frozen cleanup facts.
 */
function cleanupFacts(
	operationId: OperationId,
	threadId: ThreadId,
	outcome: Exclude<WorkhorseSettlementOutcome, "pending">,
	reason: string | null,
): WorkhorseCleanupFacts {
	return cloneAndFreeze({ operationId, threadId, outcome, reason });
}

/**
 * A diagnostic from any thrown value.
 * @param error - Whatever was thrown.
 * @returns Its message, or a placeholder.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

/**
 * What a failed mutation proved about delivery. Only an error that asserts it was not delivered is trusted; anything else leaves the outcome unknown, because the thread may exist.
 * @param error - The thrown value.
 * @returns The settled delivery outcome.
 */
function mutationOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
	if (
		error !== null &&
		typeof error === "object" &&
		"outcome" in error &&
		error.outcome === "not_delivered"
	) {
		return "not_delivered";
	}
	return "outcome_unknown";
}

export {
	emptySnapshot,
	startingSnapshot,
	failedSnapshot,
	type InspectSnapshotInput,
	inspectSnapshot,
	readySnapshot,
	cleanupFacts,
	errorMessage,
	mutationOutcome,
};
