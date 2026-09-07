import { parseRealtimeItemId, type RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";
import type { TrustedIdentityDecoder } from "@/shared/codex-workbench-identity";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * The session's transcript as browser records in stable order: recovered timeline position
 * first, live arrival order after, item id as the tie-break.
 * @param session - The session whose entries to project.
 * @returns The ordered transcript records.
 */
function orderedRecords(session: ActiveRealtimeSession): readonly RealtimeTranscriptRecord[] {
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

/**
 * Whether a server notification belongs exactly to this session's child epoch and coordinator
 * thread; anything else, including an undecodable thread id, is ignored rather than guessed.
 * @param session - The session receiving notifications.
 * @param event - The correlated notification.
 * @param identity - Decodes wire thread ids.
 * @returns True when the notification is this session's.
 */
function exactNotification(
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

export { orderedRecords, exactNotification };
