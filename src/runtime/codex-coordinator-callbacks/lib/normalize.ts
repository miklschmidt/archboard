import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import type { WorkhorseOperationEvent } from "@/runtime/codex-workhorse-operations";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackSource,
	CoordinatorOperationCallback,
	CoordinatorSemanticCallback,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

/**
 * Freeze one value in place, as every normalized callback is immutable once built.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freeze<T>(value: T): T {
	return Object.freeze(value);
}

/**
 * Copy a list and freeze the copy, so a caller's array cannot change under a delivered callback.
 * @param values - The list to copy.
 * @returns The frozen copy.
 */
function freezeArray<T>(values: readonly T[]): readonly T[] {
	return freeze([...values]);
}

/**
 * Freeze a value and everything reachable from it, depth first.
 * @param value - The root of the tree to freeze.
 */
function freezeTree(value: object): void {
	for (const child of Object.values(value)) {
		if (child !== null && typeof child === "object") {
			freezeTree(child);
		}
	}
	Object.freeze(value);
}

/**
 * Take an independent, deeply frozen copy of the thread link so the callback keeps the link as it was when the event happened.
 * @param value - The current link correlation.
 * @returns The frozen copy.
 */
function copyLink(value: CoordinatorCallbackLinkCorrelation): CoordinatorCallbackLinkCorrelation {
	const copy = structuredClone(value);
	freezeTree(copy);
	return copy;
}

/**
 * Copy the coordinator's logical tool call, which is flat and needs no deep clone.
 * @param value - The logical call correlation.
 * @returns The frozen copy.
 */
function copyCall(value: LogicalToolCallCorrelation): LogicalToolCallCorrelation {
	return freeze({ ...value });
}

/**
 * Carry the queue operation through unchanged; it is a string literal or null, so there is nothing to copy.
 * @param value - The queue operation the event named.
 * @returns The same value.
 */
function copyQueueOperation(
	value: WorkhorseOperationEvent["queueOperation"],
): WorkhorseOperationEvent["queueOperation"] {
	return value === null ? null : value;
}

/**
 * The discriminant for workhorse-operation callbacks, as a function so the literal type survives the spread that builds the callback.
 * @returns The operation kind.
 */
function operationKind(): "operation" {
	return "operation";
}

/**
 * The discriminant for semantic callbacks, as a function for the same reason as the operation kind.
 * @returns The semantic kind.
 */
function semanticKind(): "semantic" {
	return "semantic";
}

/**
 * Build the correlation an operation callback carries: everything the coordinator needs to tie the callback to its operation, call, workhorse link and voice generation.
 * @param event - The workhorse operation event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null when voice is off.
 * @returns The frozen correlation.
 */
function operationCorrelation(
	event: WorkhorseOperationEvent,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorCallbackCorrelation {
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
		workhorseLink: copyLink(workhorseLink),
		realtimeGeneration: realtimeGeneration === null ? null : freeze({ ...realtimeGeneration }),
	});
}

/**
 * The fields every operation callback shares, before its type and outcome are set.
 * @param event - The workhorse operation event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The shared fields.
 */
function operationBase(
	event: WorkhorseOperationEvent,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
) {
	return {
		kind: operationKind(),
		operation: event.operation,
		queueOperation: copyQueueOperation(event.queueOperation),
		rpc: event.rpc,
		correlation: operationCorrelation(event, workhorseLink, realtimeGeneration),
		queuedSubmissionIds: freezeArray(event.queuedSubmissionIds),
		detail: event.detail,
	};
}

/** The shared fields of an operation callback, before its type and outcome are set. */
type OperationCallbackBase = ReturnType<typeof operationBase>;

/** The event types that report a delivered operation and nothing more. */
type DeliveredOperationType = Extract<
	WorkhorseOperationEvent["type"],
	"queued" | "started" | "progress" | "attention" | "completed"
>;

/**
 * Build the callback for an event that only reports progress on an operation already known to
 * have been delivered; each type is spelled out so its literal pairing with `delivered` is the
 * one the callback union declares.
 * @param base - The shared operation callback fields.
 * @param type - The delivered event type.
 * @returns The frozen operation callback.
 */
function deliveredOperationCallback(
	base: OperationCallbackBase,
	type: DeliveredOperationType,
): CoordinatorOperationCallback {
	if (type === "queued") {
		return freeze({ ...base, type: "queued", outcome: "delivered" });
	}
	if (type === "started") {
		return freeze({ ...base, type: "started", outcome: "delivered" });
	}
	if (type === "progress") {
		return freeze({ ...base, type: "progress", outcome: "delivered" });
	}
	if (type === "attention") {
		return freeze({ ...base, type: "attention", outcome: "delivered" });
	}
	return freeze({ ...base, type: "completed", outcome: "delivered" });
}

/**
 * Normalize one workhorse operation event into the callback the coordinator sees, pairing each event type with the delivery outcome it asserts.
 * @param event - The workhorse operation event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen operation callback.
 */
function normalizeOperationCallback(
	event: WorkhorseOperationEvent,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorOperationCallback {
	const base = operationBase(event, workhorseLink, realtimeGeneration);
	if (event.type === "failed") {
		return freeze({ ...base, type: "failed", outcome: event.outcome });
	}
	if (event.type === "accepted") {
		return freeze({ ...base, type: "accepted", outcome: "pending" });
	}
	if (event.type === "outcome_unknown") {
		return freeze({ ...base, type: "outcome_unknown", outcome: "outcome_unknown" });
	}
	return deliveredOperationCallback(base, event.type);
}

type SemanticSource = SettledSemanticChangeEvent | PaneFocusEvent | PaneSelectionEvent;

/**
 * Build the correlation a semantic callback carries. A semantic event belongs to no operation and no coordinator turn, so those fields are null by construction.
 * @param event - The settled change, focus or selection event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen correlation.
 */
function semanticCorrelation(
	event: SemanticSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorCallbackCorrelation {
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
		workhorseLink: copyLink(workhorseLink),
		realtimeGeneration: realtimeGeneration === null ? null : freeze({ ...realtimeGeneration }),
	});
}

/**
 * When the person's gesture behind a semantic event happened, taken from whichever field that event kind records it in.
 * @param event - The semantic event.
 * @returns The capture time in milliseconds.
 */
function semanticCapturedAt(event: SemanticSource): number {
	if (event.kind === "pane_focus") {
		return event.focus.capturedAtMs;
	}
	if (event.kind === "pane_selection") {
		return event.selectionCapturedAtMs;
	}
	return event.freshness.capturedAtMs;
}

/**
 * The fields every semantic callback shares, before its type is set.
 * @param event - The semantic event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The shared fields.
 */
function semanticBase(
	event: SemanticSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
) {
	return {
		kind: semanticKind(),
		correlation: semanticCorrelation(event, workhorseLink, realtimeGeneration),
		threadLinkState: event.threadLink.state,
		threadLinkReason: event.threadLink.reason,
		semantic: freeze({
			feedId: event.feedId,
			sequence: event.cursor?.sequence ?? null,
			origin: event.origin,
			significance: event.kind === "settled_change" ? event.change.significance : null,
			brief: event.brief,
			capturedAtMs: semanticCapturedAt(event),
			freshUntilMs: event.freshness.freshUntilMs,
			paneId: event.pane.paneId,
			focused: event.pane.focused,
			selection: freezeArray(event.selection),
			detail: event.kind === "settled_change" ? event.change.text : null,
		}),
	};
}

/**
 * Normalize one semantic event into the callback the coordinator sees.
 * @param event - The settled change, focus or selection event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen semantic callback.
 */
function normalizeSemanticCallback(
	event: SemanticSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorSemanticCallback {
	const base = semanticBase(event, workhorseLink, realtimeGeneration);
	if (event.kind === "settled_change") {
		return freeze({ ...base, type: "change" });
	}
	if (event.kind === "pane_focus") {
		return freeze({ ...base, type: "focus" });
	}
	return freeze({ ...base, type: "selection" });
}

/**
 * Normalize whichever source event arrived. A fresh semantic brief is refused here on purpose: only a settled change reaches the coordinator, so an unsettled gesture can never be delivered.
 * @param event - The workhorse or semantic source event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen callback.
 */
function normalizeCoordinatorCallback(
	event: CoordinatorCallbackSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorCallback {
	if ("kind" in event) {
		return normalizeSemanticCallback(event, workhorseLink, realtimeGeneration);
	}
	return normalizeOperationCallback(event, workhorseLink, realtimeGeneration);
}

/**
 * An absent identity as empty text, so a key never contains the word null by accident.
 * @param value - The identity, or null.
 * @returns The identity, or the empty string.
 */
function valueOrNull(value: string | null): string {
	return value ?? "";
}

/**
 * The scope a semantic callback belongs to: its child, epoch, threads, turn, voice session and feed. Two callbacks from different scopes never coalesce.
 * @param callback - The semantic callback.
 * @returns The scope as stable text.
 */
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

/**
 * The identity of one callback, which is what makes delivery exactly-once: the same event normalized twice produces the same key.
 * @param callback - The normalized callback.
 * @returns The key.
 */
function coordinatorCallbackKey(callback: CoordinatorCallback): string {
	if (callback.kind === "operation") {
		return `operation:${valueOrNull(callback.correlation.operationId)}:${callback.type}`;
	}
	const scope = semanticScope(callback);
	if (callback.type === "change") {
		return `semantic:change:${scope}:${callback.semantic.sequence ?? "null"}`;
	}
	if (callback.type === "focus") {
		return `semantic:focus:${scope}:${callback.semantic.capturedAtMs}:${callback.semantic.focused ? "1" : "0"}`;
	}
	return `semantic:selection:${scope}:${callback.semantic.capturedAtMs}:${JSON.stringify(callback.semantic.selection)}`;
}

/**
 * The key two callbacks must share to coalesce: only same-operation lifecycle updates and
 * same-kind semantic telemetry in the same scope replace one another.
 * @param callback - The normalized callback.
 * @returns The coalescing key.
 */
function coordinatorCallbackCoalescingKey(callback: CoordinatorCallback): string {
	if (callback.kind === "operation") {
		return `operation:${valueOrNull(callback.correlation.operationId)}:${callback.type}`;
	}
	return `semantic:${callback.type}:${semanticScope(callback)}`;
}

export {
	normalizeOperationCallback,
	normalizeSemanticCallback,
	normalizeCoordinatorCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
};
