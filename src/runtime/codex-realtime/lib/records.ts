import type { RealtimeTranscriptRecord } from "../../../shared/codex-realtime-host/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type { ActiveRealtimeSession } from "./state.js";

export function orderedRecords(
	session: ActiveRealtimeSession,
): readonly RealtimeTranscriptRecord[] {
	return [...session.entries.values()]
		.toSorted((left, right) => left.order - right.order || left.itemId.localeCompare(right.itemId))
		.map((entry, sequence) => ({
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			itemId: entry.itemId,
			sequence,
			role: entry.role,
			status: entry.status,
			text: entry.text,
		}));
}

export function exactNotification(
	session: ActiveRealtimeSession,
	event: TransportServerNotification,
): boolean {
	return (
		event.correlation.child === session.binding.child &&
		event.correlation.epoch === session.binding.epoch &&
		"threadId" in event.notification.params &&
		event.notification.params.threadId === session.binding.coordinatorThreadId
	);
}
