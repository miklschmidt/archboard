import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import type { DeliveryTarget } from "@/runtime/codex-thread-context/lib/delivery-state";
import { canonicalSemanticCursorToken } from "@/runtime/codex-thread-context/lib/event-identity";
import { sameStringValues } from "@/runtime/codex-thread-context/lib/link-equality";

/**
 * Whether the context addresses this pane and the event's board at the
 * event's version and cursor.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change, already known to carry a cursor and version.
 * @param cursor - The canonical cursor token for the event.
 * @param paneId - The pane this delivery port serves.
 * @returns True when the pane and board fields agree.
 */
function boardMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
	cursor: string,
	paneId: string,
): boolean {
	return (
		context.paneId === paneId &&
		context.board.note === event.board.note &&
		context.board.version === event.version &&
		context.board.cursor === cursor
	);
}

/**
 * Whether the context carries the event's thread link and the target's child
 * generation, so the adapter minted no identity of its own.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @param target - The exact delivery target.
 * @returns True when link state, reason and child generation agree.
 */
function identityMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
	target: DeliveryTarget,
): boolean {
	return (
		context.threadLink.state === event.threadLink.state &&
		context.threadLink.reason === event.threadLink.reason &&
		context.child.id === event.child.id &&
		context.child.epoch === event.child.epoch &&
		context.child.id === target.childId &&
		context.child.epoch === target.epoch
	);
}

/**
 * Whether the context names the same workhorse thread and turn as the event
 * and the target, and the same coordinator as the event.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @param target - The exact delivery target.
 * @returns True when the thread identities agree.
 */
function threadsMatch(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
	target: DeliveryTarget,
): boolean {
	return (
		context.workhorse.threadId === event.workhorse.threadId &&
		context.workhorse.threadId === target.threadId &&
		context.workhorse.turnId === event.workhorse.turnId &&
		context.coordinator.threadId === event.coordinator.threadId &&
		context.coordinator.realtimeSessionId === event.coordinator.realtimeSessionId
	);
}

/**
 * Whether the context embeds the event's brief with the event's freshness.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when the semantic block agrees.
 */
function semanticMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.semantic.brief === event.brief &&
		context.semantic.capturedAtMs === event.freshness.capturedAtMs &&
		context.semantic.freshUntilMs === event.freshness.freshUntilMs &&
		context.semantic.truncated === event.truncated
	);
}

/**
 * Whether focus and selection were captured from the event itself.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when focus and selection agree with the event.
 */
function paneStateMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.focus.paneId === (event.pane.focused ? event.pane.paneId : null) &&
		context.focus.capturedAtMs === event.freshness.capturedAtMs &&
		sameStringValues(context.selection.elementIds, event.selection) &&
		context.selection.capturedAtMs === event.freshness.capturedAtMs
	);
}

/**
 * Whether claim and ambiguity come from the event and no operation is claimed.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when the claim block agrees and the operation is empty.
 */
function claimMatches(context: ArchboardContext, event: SettledSemanticChangeEvent): boolean {
	return (
		context.claim.holder === event.claim.holder &&
		context.claim.doing === event.claim.doing &&
		sameStringValues(context.ambiguity, event.ambiguity) &&
		context.operation.id === null
	);
}

/**
 * Proves that the adapter-built context is exactly the event, the pane and the
 * target, and nothing else: the delivery must never inject identity or proof
 * the adapter invented.
 * @param event - The settled semantic change.
 * @param context - The canonical context the adapter built for it.
 * @param target - The exact delivery target.
 * @param paneId - The pane this delivery port serves.
 * @returns True when every context field is accounted for by the event.
 */
function contextMatchesEvent(
	event: SettledSemanticChangeEvent,
	context: ArchboardContext,
	target: DeliveryTarget,
	paneId: string,
): boolean {
	if (event.cursor === null || event.version === null) {
		return false;
	}
	const cursor = canonicalSemanticCursorToken(event.cursor);
	const addressed =
		boardMatches(context, event, cursor, paneId) &&
		identityMatches(context, event, target) &&
		threadsMatch(context, event, target);
	return addressed && capturedStateMatches(context, event);
}

/**
 * Whether the captured pane state in the context is the event's own.
 * @param context - The canonical context the adapter built.
 * @param event - The settled semantic change.
 * @returns True when semantic, focus, selection and claim all agree.
 */
function capturedStateMatches(
	context: ArchboardContext,
	event: SettledSemanticChangeEvent,
): boolean {
	return (
		semanticMatches(context, event) &&
		paneStateMatches(context, event) &&
		claimMatches(context, event)
	);
}

export { contextMatchesEvent };
