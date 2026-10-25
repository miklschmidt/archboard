import type { LogicalToolCallCorrelation } from "@archboard/codex-app-server/identity";
import type { WorkhorseOperationEvent } from "#runtime/protocol/workhorse-operations/contract.ts";
import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";
import type {
	ContextAnnouncementSource,
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackSource,
	CoordinatorOperationCallback,
	CoordinatorContextCallback,
	CoordinatorWorkhorseNewsCallback,
	WorkhorseNewsSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

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
 * The discriminant for announced-change callbacks, as a function for the same reason as the operation kind.
 * @returns The context kind.
 */
function contextKind(): "context" {
	return "context";
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
		workhorseLink: cloneAndFreeze(workhorseLink),
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

/**
 * Build the correlation an announced-change callback carries. A change belongs to no operation and no coordinator turn, so those fields are null by construction.
 * @param event - The announced change.
 * @param workhorseLink - The link correlation at the time of the change.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen correlation.
 */
function contextCorrelation(
	event: ContextAnnouncementSource,
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
		workhorseLink: cloneAndFreeze(workhorseLink),
		realtimeGeneration: realtimeGeneration === null ? null : freeze({ ...realtimeGeneration }),
	});
}

/**
 * Normalize one announced change into the callback the coordinator or the voice is given.
 * @param event - The announced change.
 * @param workhorseLink - The link correlation at the time of the change.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen callback.
 */
function normalizeContextCallback(
	event: ContextAnnouncementSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorContextCallback {
	return freeze({
		kind: contextKind(),
		audience: event.audience,
		correlation: contextCorrelation(event, workhorseLink, realtimeGeneration),
		threadLinkState: event.threadLink.state,
		threadLinkReason: event.threadLink.reason,
		context: cloneAndFreeze(event.context),
	});
}

/**
 * Normalize one piece of workhorse news into the callback the coordinator is given (TASK-321).
 * @param event - The workhorse thread's own event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen callback.
 */
function normalizeWorkhorseNewsCallback(
	event: WorkhorseNewsSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorWorkhorseNewsCallback {
	return freeze({
		kind: "workhorse_news",
		type: event.type,
		sequence: event.sequence,
		detail: event.detail,
		correlation: freeze({
			operationId: null,
			childId: event.childId,
			epoch: event.epoch,
			coordinatorThreadId: event.coordinatorThreadId,
			coordinatorTurnId: null,
			workhorseThreadId: event.workhorseThreadId,
			turnId: event.turnId,
			queuedSubmissionId: null,
			clientUserMessageId: null,
			realtimeSessionId: null,
			coordinatorCall: null,
			workhorseLink: cloneAndFreeze(workhorseLink),
			realtimeGeneration: realtimeGeneration === null ? null : freeze({ ...realtimeGeneration }),
		}),
	});
}

/**
 * Normalize whichever source event arrived.
 * @param event - The workhorse or announced-change source event.
 * @param workhorseLink - The link correlation at the time of the event.
 * @param realtimeGeneration - The voice generation in force, or null.
 * @returns The frozen callback.
 */
function normalizeCoordinatorCallback(
	event: CoordinatorCallbackSource,
	workhorseLink: CoordinatorCallbackLinkCorrelation,
	realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null,
): CoordinatorCallback {
	if ("kind" in event && event.kind === "workhorse_news") {
		return normalizeWorkhorseNewsCallback(event, workhorseLink, realtimeGeneration);
	}
	if ("kind" in event) {
		return normalizeContextCallback(event, workhorseLink, realtimeGeneration);
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
 * The scope an announced-change callback belongs to: who it is for, its child, epoch, threads, turn, voice session and feed. Two callbacks from different scopes never coalesce.
 * @param callback - The announced-change callback.
 * @returns The scope as stable text.
 */
function contextScope(callback: CoordinatorContextCallback): string {
	const correlation = callback.correlation;
	return JSON.stringify([
		callback.audience,
		correlation.childId,
		correlation.epoch,
		correlation.coordinatorThreadId,
		correlation.workhorseThreadId,
		correlation.turnId,
		correlation.realtimeSessionId,
		callback.context.feedId,
	]);
}

/**
 * The identity of one piece of workhorse news: its thread, turn, type and place in the observer's
 * count. News never coalesces, since each one is a separate thing the coordinator may say.
 * @param callback - The workhorse news.
 * @returns The key.
 */
function workhorseNewsKey(callback: CoordinatorWorkhorseNewsCallback): string {
	const { correlation } = callback;
	return `workhorse_news:${JSON.stringify([
		correlation.childId,
		correlation.epoch,
		correlation.workhorseThreadId,
		correlation.turnId,
		callback.type,
		callback.sequence,
	])}`;
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
	if (callback.kind === "workhorse_news") {
		return workhorseNewsKey(callback);
	}
	return contextKey(callback);
}

/**
 * The identity of one announced-change callback: its scope and its sequence.
 * @param callback - The announced-change callback.
 * @returns The key.
 */
function contextKey(callback: CoordinatorContextCallback): string {
	return `context:${contextScope(callback)}:${callback.context.sequence}`;
}

/**
 * The key two callbacks must share to coalesce: only same-operation lifecycle updates and
 * announced changes of one topic in the same scope replace one another.
 * @param callback - The normalized callback.
 * @returns The coalescing key.
 */
function coordinatorCallbackCoalescingKey(callback: CoordinatorCallback): string {
	if (callback.kind === "operation") {
		return `operation:${valueOrNull(callback.correlation.operationId)}:${callback.type}`;
	}
	if (callback.kind === "workhorse_news") {
		return workhorseNewsKey(callback);
	}
	// A change without a topic is told on its own and never folded into the next.
	const { topic } = callback.context;
	return topic === null
		? contextKey(callback)
		: `context:${contextScope(callback)}:topic:${JSON.stringify(topic)}`;
}

export {
	normalizeOperationCallback,
	normalizeContextCallback,
	normalizeCoordinatorCallback,
	coordinatorCallbackKey,
	coordinatorCallbackCoalescingKey,
};
