import type {
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { ThreadLinkBindingSnapshot } from "../../codex-thread-link/index.js";
import type {
	WorkhorseCleanupFacts,
	WorkhorseSettlementOutcome,
	WorkhorseSnapshot,
	WorkhorseStartFacts,
} from "./contract.js";

export function emptySnapshot(): WorkhorseSnapshot {
	return Object.freeze({
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

export function startingSnapshot(
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
): WorkhorseSnapshot {
	return Object.freeze({
		...emptySnapshot(),
		state: "starting" as const,
		paneId,
		childId,
		epoch,
		operationId,
		outcome: "pending" as const,
	});
}

export function failedSnapshot(
	paneId: string,
	operationId: OperationId,
	reason: string,
): WorkhorseSnapshot {
	return Object.freeze({
		...emptySnapshot(),
		state: "failed" as const,
		paneId,
		operationId,
		outcome: "not_delivered" as const,
		reason,
	});
}

export interface InspectSnapshotInput {
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

export function inspectSnapshot(input: InspectSnapshotInput): WorkhorseSnapshot {
	return Object.freeze({
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

export function readySnapshot(
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	start: WorkhorseStartFacts,
	binding: ThreadLinkBindingSnapshot,
): WorkhorseSnapshot {
	return Object.freeze({
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

export function cleanupFacts(
	operationId: OperationId,
	threadId: ThreadId,
	outcome: Exclude<WorkhorseSettlementOutcome, "pending">,
	reason: string | null,
): WorkhorseCleanupFacts {
	return Object.freeze({ operationId, threadId, outcome, reason });
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

export function mutationOutcome(error: unknown): "not_delivered" | "outcome_unknown" {
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
