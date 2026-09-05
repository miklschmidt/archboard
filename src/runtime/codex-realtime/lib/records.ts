import {
	parseRealtimeItemId,
	type RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import type { TrustedIdentityDecoder } from "../../../shared/codex-workbench-identity/index.js";
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
			itemId: parseRealtimeItemId(entry.itemId),
			sequence,
			role: entry.role,
			status: entry.status,
			text: entry.text,
		}));
}

export function exactNotification(
	session: ActiveRealtimeSession,
	event: TransportServerNotification,
	identity: TrustedIdentityDecoder,
): boolean {
	if (
		event.correlation.child !== session.binding.child ||
		event.correlation.epoch !== session.binding.epoch ||
		!("threadId" in event.notification.params)
	) {
		return false;
	}
	try {
		return (
			identity.resolveThreadId(event.notification.params.threadId) ===
			session.binding.coordinatorThreadId
		);
	} catch {
		return false;
	}
}
