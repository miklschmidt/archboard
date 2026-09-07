import type { SemanticCursor, SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import type {
	CodexThreadContextDeliveryReason,
	CodexThreadContextEventId,
} from "@/runtime/codex-thread-context/lib/contract";

/**
 * The opaque board cursor carried by the canonical context for one feed event.
 * @param cursor - The feed cursor a settled event was published under.
 * @returns The `feedId:sequence` token the context adapter must reproduce.
 */
function canonicalSemanticCursorToken(cursor: SemanticCursor): string {
	return `${cursor.feedId}:${cursor.sequence}`;
}

/**
 * Ledger key for one event identity so a feed event settles exactly once.
 * @param event - The feed identity and sequence of a settled event.
 * @returns A string that is equal for equal identities and safe as a map key.
 */
function eventKey(event: CodexThreadContextEventId): string {
	return JSON.stringify([event.feedId, event.sequence]);
}

/**
 * Identity of a settled event; an event without a cursor gets sequence -1 so
 * it still settles once, always as a refusal.
 * @param event - The settled semantic change.
 * @returns The frozen feed identity and sequence.
 */
function eventId(event: SettledSemanticChangeEvent): CodexThreadContextEventId {
	return Object.freeze({ feedId: event.feedId, sequence: event.cursor?.sequence ?? -1 });
}

/**
 * Detects an event whose identity no longer matches the identity it was
 * reserved under, which can only mean a stale cursor.
 * @param event - The settled semantic change being delivered.
 * @param expected - The identity captured when the delivery started.
 * @returns `stale_cursor` when the identities differ, otherwise null.
 */
function eventIdentityReason(
	event: SettledSemanticChangeEvent,
	expected: CodexThreadContextEventId,
): CodexThreadContextDeliveryReason | null {
	const current = eventId(event);
	return current.feedId === expected.feedId && current.sequence === expected.sequence
		? null
		: "stale_cursor";
}

export { canonicalSemanticCursorToken, eventId, eventIdentityReason, eventKey };
