import type { WorkbenchExecutionContext } from "#runtime/protocol/host/context.ts";
import type { WorkbenchContextEvent } from "#runtime/protocol/host/context-source.ts";
import type { DeliveryTarget } from "#runtime/services/thread-context/delivery-state.ts";

// Opaque host context cannot mint an identity, replace a turn, or extend a freshness window.
/**
 * Compare execution and freshness evidence without interpreting opaque host data.
 * @param event The source event with its identity and freshness.
 * @param context The captured execution facts and host payload.
 * @param target The exact core-owned delivery target.
 * @returns Whether the stated condition holds.
 */
function contextMatchesEvent(
	event: WorkbenchContextEvent,
	context: WorkbenchExecutionContext,
	target: DeliveryTarget,
): boolean {
	const checks = [
		context.threadLink.state === event.threadLink.state,
		context.threadLink.reason === event.threadLink.reason,
		context.child.id === event.child.id,
		context.child.epoch === event.child.epoch,
		context.child.id === target.childId,
		context.child.epoch === target.epoch,
		context.workhorse.threadId === target.threadId,
		context.workhorse.threadId === event.workhorse.threadId,
		context.workhorse.turnId === event.workhorse.turnId,
		context.coordinator.threadId === event.coordinator.threadId,
		context.coordinator.realtimeSessionId === event.coordinator.realtimeSessionId,
		context.semantic.brief === event.brief,
		context.semantic.truncated === event.truncated,
		context.semantic.capturedAtMs === event.freshness.capturedAtMs,
		context.semantic.freshUntilMs === event.freshness.freshUntilMs,
		context.operation.id === null,
	];
	return checks.every((matched) => matched);
}
export { contextMatchesEvent };
