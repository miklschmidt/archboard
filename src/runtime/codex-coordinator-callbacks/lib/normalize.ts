import type {
	LogicalToolCallCorrelation,
	QueuedSubmissionId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type { WorkhorseOperationEvent } from "../../codex-workhorse-operations/index.js";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackSource,
	CoordinatorOperationCallback,
	CoordinatorSemanticCallback,
} from "./contract.js";

function freeze<T>(value: T): T {
	return Object.freeze(value);
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
	return freeze([...values]);
}

function copyCall(value: LogicalToolCallCorrelation): LogicalToolCallCorrelation {
	return freeze({ ...value });
}

function copyQueueOperation(
	value: WorkhorseOperationEvent["queueOperation"],
): WorkhorseOperationEvent["queueOperation"] {
	return value === null ? null : value;
}

function operationCorrelation(event: WorkhorseOperationEvent): CoordinatorCallbackCorrelation {
	const value = event.correlation;
	return freeze({
		operationId: value.operationId,
		childId: value.childId,
		epoch: value.epoch,
		coordinatorThreadId: value.coordinatorThreadId,
		coordinatorTurnId: value.coordinatorTurnId,
		workhorseThreadId: value.workhorseThreadId,
		turnId: value.turnId,
		queuedSubmissionId: value.queuedSubmissionId,
		clientUserMessageId: value.clientUserMessageId,
		realtimeSessionId: null,
		coordinatorCall: copyCall(value.coordinatorCall),
	});
}

function operationBase(event: WorkhorseOperationEvent) {
	return {
		kind: "operation" as const,
		operation: event.operation,
		queueOperation: copyQueueOperation(event.queueOperation),
		rpc: event.rpc,
		correlation: operationCorrelation(event),
		queuedSubmissionIds: freezeArray(event.queuedSubmissionIds) as readonly QueuedSubmissionId[],
		detail: event.detail,
	};
}

export function normalizeOperationCallback(
	event: WorkhorseOperationEvent,
): CoordinatorOperationCallback {
	const base = operationBase(event);
	switch (event.type) {
		case "accepted":
			return freeze({ ...base, type: "accepted", outcome: "pending" });
		case "queued":
			return freeze({ ...base, type: "queued", outcome: "delivered" });
		case "started":
			return freeze({ ...base, type: "started", outcome: "delivered" });
		case "progress":
			return freeze({ ...base, type: "progress", outcome: "delivered" });
		case "attention":
			return freeze({ ...base, type: "attention", outcome: "delivered" });
		case "completed":
			return freeze({ ...base, type: "completed", outcome: "delivered" });
		case "failed":
			return freeze({ ...base, type: "failed", outcome: event.outcome });
		case "outcome_unknown":
			return freeze({ ...base, type: "outcome_unknown", outcome: "outcome_unknown" });
		default:
			throw new TypeError("Unsupported workhorse operation callback source.");
	}
}

type SemanticSource = SettledSemanticChangeEvent | PaneFocusEvent | PaneSelectionEvent;

function semanticCorrelation(event: SemanticSource): CoordinatorCallbackCorrelation {
	return freeze({
		operationId: null,
		childId: event.child.id,
		epoch: event.child.epoch,
		coordinatorThreadId: event.coordinator.threadId,
		coordinatorTurnId: null,
		workhorseThreadId: event.workhorse.threadId,
		turnId: event.workhorse.turnId,
		queuedSubmissionId: null,
		clientUserMessageId: null,
		realtimeSessionId: event.coordinator.realtimeSessionId,
		coordinatorCall: null,
	});
}

function semanticCapturedAt(event: SemanticSource): number {
	if (event.kind === "pane_focus") return event.focus.capturedAtMs;
	if (event.kind === "pane_selection") return event.selectionCapturedAtMs;
	return event.freshness.capturedAtMs;
}

function semanticBase(event: SemanticSource) {
	return {
		kind: "semantic" as const,
		correlation: semanticCorrelation(event),
		threadLinkState: event.threadLink.state,
		threadLinkReason: event.threadLink.reason,
		semantic: freeze({
			feedId: event.feedId,
			sequence: event.cursor?.sequence ?? null,
			origin: event.origin,
			significance: event.kind === "settled_change" ? event.change.significance : null,
			brief: event.brief,
			capturedAtMs: semanticCapturedAt(event),
			paneId: event.pane.paneId,
			focused: event.pane.focused,
			selection: freezeArray(event.selection),
			detail: event.kind === "settled_change" ? event.change.text : null,
		}),
	};
}

export function normalizeSemanticCallback(event: SemanticSource): CoordinatorSemanticCallback {
	const base = semanticBase(event);
	if (event.kind === "settled_change") return freeze({ ...base, type: "change" });
	if (event.kind === "pane_focus") return freeze({ ...base, type: "focus" });
	if (event.kind === "pane_selection") return freeze({ ...base, type: "selection" });
	throw new TypeError("Unsupported semantic callback source.");
}

export function normalizeCoordinatorCallback(
	event: CoordinatorCallbackSource,
): CoordinatorCallback {
	if ("kind" in event) {
		if (
			event.kind === "settled_change" ||
			event.kind === "pane_focus" ||
			event.kind === "pane_selection"
		)
			return normalizeSemanticCallback(event);
		throw new TypeError("Fresh semantic briefs are not callback sources.");
	}
	return normalizeOperationCallback(event);
}

function valueOrNull(value: string | null): string {
	return value ?? "";
}

function semanticScope(callback: CoordinatorSemanticCallback): string {
	const correlation = callback.correlation;
	return JSON.stringify([
		correlation.childId,
		correlation.epoch,
		correlation.coordinatorThreadId,
		correlation.workhorseThreadId,
		correlation.turnId,
		correlation.realtimeSessionId,
		callback.semantic.feedId,
	]);
}

export function coordinatorCallbackKey(callback: CoordinatorCallback): string {
	if (callback.kind === "operation")
		return `operation:${valueOrNull(callback.correlation.operationId)}:${callback.type}`;
	const scope = semanticScope(callback);
	if (callback.type === "change")
		return `semantic:change:${scope}:${callback.semantic.sequence ?? "null"}`;
	if (callback.type === "focus")
		return `semantic:focus:${scope}:${callback.semantic.capturedAtMs}:${callback.semantic.focused ? "1" : "0"}`;
	return `semantic:selection:${scope}:${callback.semantic.capturedAtMs}:${JSON.stringify(callback.semantic.selection)}`;
}

/** Only same-operation lifecycle updates and same-kind semantic telemetry coalesce. */
export function coordinatorCallbackCoalescingKey(callback: CoordinatorCallback): string {
	if (callback.kind === "operation")
		return `operation:${valueOrNull(callback.correlation.operationId)}:${callback.type}`;
	return `semantic:${callback.type}:${semanticScope(callback)}`;
}
