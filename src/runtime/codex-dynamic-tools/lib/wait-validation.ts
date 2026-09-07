import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "@/runtime/codex-thread-tools";
import {
	CodexDynamicToolsError,
	type DynamicTargetAuthority,
	type DynamicWaitEvent,
} from "@/runtime/codex-dynamic-tools/lib/contract";

/** The fields every wait event carries. */
const BASE_EVENT_KEYS = ["event", "threadId", "sequence", "cursor"] as const;

/** The fields an attention event carries when it must prove the target is owned. */
const OWNED_EVENT_KEYS = [...BASE_EVENT_KEYS, "targetOwned"] as const;

/** The longest cursor the wait boundary accepts back from the authority. */
const MAX_EVENT_CURSOR_LENGTH = 1_024;

/** The most threads one wait call may name. */
const MAX_WAIT_THREADS = 8;

/** The longest wire ThreadId the wait boundary accepts. */
const MAX_WAIT_THREAD_ID_LENGTH = 128;

/** The longest wait the boundary accepts, past which a call must come back and ask again. */
const MAX_WAIT_TIMEOUT_MS = 120_000;

/**
 * Build a refusal for the wait boundary.
 * @param code Refusal reason.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function dynamicError(
	code: "invalid_call" | "cycle" | "stale_child",
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

/**
 * Whether a value is a plain object, which is the only shape the wait boundary reads.
 * @param value Untrusted value.
 * @returns Whether the value is a plain object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether a record carries exactly the named keys and nothing else, which is how the boundary
 * refuses an authority that smuggles extra fields past the reviewed shape.
 * @param value The record to check.
 * @param keys The keys it must carry.
 * @returns Whether the keys match exactly.
 */
function exactEventKeys(
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

/**
 * The code a thrown value carries, when it carries one.
 * @param error Thrown value.
 * @returns The code as a string, or undefined.
 */
function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return undefined;
	}
	const code: unknown = Reflect.get(error, "code");
	return String(code);
}

/**
 * Whether an event names a target the authority reported as having failed at the system level.
 * Such a target's attention needs no ownership proof, because nothing owns it any more.
 * @param event The event.
 * @param targets The wait's targets by wire ThreadId.
 * @returns Whether the named target is in system error.
 */
function systemErrorTarget(
	event: Readonly<Record<string, unknown>>,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): boolean {
	const threadId = typeof event["threadId"] === "string" ? event["threadId"] : "";
	return targets.get(threadId)?.status === "systemError";
}

/**
 * The key sets an event of this kind may carry. An attention event must prove the target is
 * owned unless the target failed at the system level, in which case either shape is accepted.
 * @param event The event.
 * @param targets The wait's targets by wire ThreadId.
 * @returns The acceptable key sets, or null for an event kind the boundary does not know.
 */
function acceptedEventKeys(
	event: Readonly<Record<string, unknown>>,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): readonly (readonly string[])[] | null {
	if (event["event"] === "timeout" || event["event"] === "completed") {
		return [BASE_EVENT_KEYS];
	}
	if (event["event"] !== "attention") {
		return null;
	}
	return systemErrorTarget(event, targets)
		? [BASE_EVENT_KEYS, OWNED_EVENT_KEYS]
		: [OWNED_EVENT_KEYS];
}

/**
 * Refuse an event whose shape is not one the boundary reviewed.
 * @param event The event.
 * @param targets The wait's targets by wire ThreadId.
 */
function assertEventShape(
	event: Readonly<Record<string, unknown>>,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): void {
	const accepted = acceptedEventKeys(event, targets);
	if (accepted === null || !accepted.some((keys) => exactEventKeys(event, keys))) {
		throw dynamicError("invalid_call", "The wait authority returned an invalid event shape.");
	}
}

/**
 * Refuse an event whose sequence or cursor is not a value the boundary can carry forward.
 * @param event The event.
 */
function assertEventScalars(event: DynamicWaitEvent): void {
	if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
		throw dynamicError("invalid_call", "The wait authority returned an invalid event sequence.");
	}
	if (event.cursor === null) {
		return;
	}
	if (typeof event.cursor !== "string" || !usableCursor(event.cursor)) {
		throw dynamicError("invalid_call", "The wait authority returned an invalid event cursor.");
	}
}

/**
 * Whether a cursor is one the boundary will encode back into an opaque cursor.
 * @param cursor The cursor.
 * @returns Whether it is within the reviewed bounds.
 */
function usableCursor(cursor: string): boolean {
	return cursor.length > 0 && cursor.length <= MAX_EVENT_CURSOR_LENGTH;
}

/** An attention event, which is the only kind that carries an ownership proof. */
type AttentionEvent = Extract<DynamicWaitEvent, { event: "completed" | "attention" }>;

/**
 * Refuse an attention event that was not proven to belong to one of the wait's own targets.
 * @param event The event.
 * @param targets The wait's targets by wire ThreadId.
 */
function assertAttentionOwnership(
	event: AttentionEvent,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): void {
	const target = targets.get(event.threadId);
	if (Object.prototype.hasOwnProperty.call(event, "targetOwned") && event.targetOwned !== true) {
		throw dynamicError("invalid_call", "Attention ownership must be explicitly true.");
	}
	if (target === undefined) {
		throw dynamicError("invalid_call", "Attention was not proven to belong to a wait target.");
	}
	if (target.status !== "systemError" && event.targetOwned !== true) {
		throw dynamicError("invalid_call", "Attention was not proven to belong to a wait target.");
	}
}

/**
 * Refuse anything the wait authority returns that is not an event this call asked for: a shape
 * the boundary did not review, a sequence that does not advance, a timeout carrying a target,
 * an event for a thread the call did not name, or attention nothing proved it owns.
 * @param event The event the authority returned.
 * @param previousSequence The sequence the call resumed from.
 * @param targetIds The wire ThreadIds the call named.
 * @param targets The wait's targets by wire ThreadId.
 */
function validateEvent(
	event: DynamicWaitEvent,
	previousSequence: number,
	targetIds: ReadonlySet<string>,
	targets: ReadonlyMap<string, DynamicTargetAuthority>,
): void {
	if (!isRecord(event) || typeof event.event !== "string") {
		throw dynamicError("invalid_call", "The wait authority returned an invalid event.");
	}
	// The event is untrusted: it is read through its own fields, not through the shape the
	// contract type claims, so a value that does not match the type is refused rather than
	// believed on the strength of the type alone.
	const fields: Readonly<Record<string, unknown>> = event;
	assertEventShape(fields, targets);
	assertEventScalars(event);
	if (event.event === "timeout") {
		assertTimeoutEvent(fields, event, previousSequence);
		return;
	}
	assertDeliveredEvent(fields, event, previousSequence, targetIds);
	if (event.event === "attention") {
		assertAttentionOwnership(event, targets);
	}
}

/**
 * Refuse a timeout that carries a target or moves the sequence on: a timeout says only that
 * nothing happened, so a caller must resume from exactly where it was.
 * @param fields The event's own fields.
 * @param event The event.
 * @param previousSequence The sequence the call resumed from.
 */
function assertTimeoutEvent(
	fields: Readonly<Record<string, unknown>>,
	event: DynamicWaitEvent,
	previousSequence: number,
): void {
	if (fields["threadId"] !== null || event.sequence !== previousSequence) {
		throw dynamicError("invalid_call", "A timeout must not deliver a target event.");
	}
}

/**
 * Refuse a delivered event that names a thread this call did not ask about, or that repeats
 * something the caller has already been told.
 * @param fields The event's own fields.
 * @param event The event.
 * @param previousSequence The sequence the call resumed from.
 * @param targetIds The wire ThreadIds the call named.
 */
function assertDeliveredEvent(
	fields: Readonly<Record<string, unknown>>,
	event: DynamicWaitEvent,
	previousSequence: number,
	targetIds: ReadonlySet<string>,
): void {
	const threadId = fields["threadId"];
	if (typeof threadId !== "string" || !targetIds.has(threadId)) {
		throw dynamicError("invalid_call", "The wait authority returned an event for another thread.");
	}
	if (event.sequence <= previousSequence) {
		throw dynamicError("invalid_call", "The wait authority returned an already-delivered event.");
	}
}

/**
 * Whether one requested wire ThreadId is within the reviewed bounds.
 * @param threadId The requested id.
 * @returns Whether the id is usable.
 */
function usableThreadId(threadId: unknown): boolean {
	if (typeof threadId !== "string") {
		return false;
	}
	return threadId.length > 0 && threadId.length <= MAX_WAIT_THREAD_ID_LENGTH;
}

/**
 * Refuse wait arguments outside the bounds the boundary was reviewed for: the number of threads
 * it may watch at once, the shape of each id, and how long one call may block.
 * @param threadIds The requested wire ThreadIds.
 * @param timeoutMs How long the call may wait.
 */
function assertWaitArguments(threadIds: readonly string[], timeoutMs: number): void {
	if (!usableThreadIds(threadIds) || !usableTimeout(timeoutMs)) {
		throw dynamicError("invalid_call", "The wait arguments are outside the reviewed bounds.");
	}
}

/**
 * Whether the requested threads are a set the boundary will watch: at least one, no more than
 * the reviewed ceiling, and every id usable.
 * @param threadIds The requested wire ThreadIds.
 * @returns Whether the set is usable.
 */
function usableThreadIds(threadIds: readonly string[]): boolean {
	if (!Array.isArray(threadIds) || threadIds.length === 0) {
		return false;
	}
	if (threadIds.length > MAX_WAIT_THREADS) {
		return false;
	}
	return threadIds.every((threadId) => usableThreadId(threadId));
}

/**
 * Whether a requested timeout is one the boundary will block for.
 * @param timeoutMs How long the call may wait.
 * @returns Whether the timeout is within the reviewed bounds.
 */
function usableTimeout(timeoutMs: number): boolean {
	if (!Number.isSafeInteger(timeoutMs)) {
		return false;
	}
	return timeoutMs >= 0 && timeoutMs <= MAX_WAIT_TIMEOUT_MS;
}

/**
 * Refuse a wait owner identity that is not the reviewed manifest's own call: the namespace, the
 * tool and the manifest hash all have to be the ones the app was published under.
 * @param call The call identity the wait would take ownership under.
 */
function assertWaitCall(call: unknown): void {
	if (!isRecord(call) || !exactEventKeys(call, ["callId", "namespace", "tool", "manifestHash"])) {
		throw dynamicError(
			"invalid_call",
			"The wait owner identity is not the reviewed manifest call.",
		);
	}
	const callId = call["callId"];
	if (typeof callId !== "string" || callId.length === 0 || !reviewedManifestCall(call)) {
		throw dynamicError(
			"invalid_call",
			"The wait owner identity is not the reviewed manifest call.",
		);
	}
}

/**
 * Whether a call names the reviewed manifest's own wait tool.
 * @param call The call identity.
 * @returns Whether the namespace, tool and manifest hash all match.
 */
function reviewedManifestCall(call: Readonly<Record<string, unknown>>): boolean {
	if (call["namespace"] !== ARCHBOARD_APP_NAMESPACE.name || call["tool"] !== "wait_threads") {
		return false;
	}
	return call["manifestHash"] === ARCHBOARD_APP_MANIFEST_SHA256;
}

export {
	assertWaitArguments,
	assertWaitCall,
	dynamicError,
	errorCode,
	exactEventKeys,
	isRecord,
	validateEvent,
};
