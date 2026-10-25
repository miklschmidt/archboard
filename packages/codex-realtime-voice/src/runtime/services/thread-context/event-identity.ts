import type {
	CodexThreadContextDeliveryReason,
	CodexThreadContextEventId,
	WorkhorseContextEvent,
} from "#runtime/services/thread-context/contract.ts";

/**
 * Ledger key for one change identity so a change settles exactly once.
 * @param event - The feed and sequence of a change.
 * @returns A string that is equal for equal identities and safe as a map key.
 */
function eventKey(event: CodexThreadContextEventId): string {
	return JSON.stringify([event.feedId, event.sequence]);
}

/**
 * Identity of an announced change.
 * @param event - The announced change.
 * @returns The frozen feed and sequence.
 */
function eventId(event: WorkhorseContextEvent): CodexThreadContextEventId {
	return Object.freeze({ feedId: event.feedId, sequence: event.sequence });
}

/**
 * Detects a change whose identity no longer matches the identity it was
 * reserved under, which can only mean a stale cursor.
 * @param event - The change being delivered.
 * @param expected - The identity captured when the delivery started.
 * @returns `stale_cursor` when the identities differ, otherwise null.
 */
function eventIdentityReason(
	event: WorkhorseContextEvent,
	expected: CodexThreadContextEventId,
): CodexThreadContextDeliveryReason | null {
	const current = eventId(event);
	return current.feedId === expected.feedId && current.sequence === expected.sequence
		? null
		: "stale_cursor";
}

export { eventId, eventIdentityReason, eventKey };
