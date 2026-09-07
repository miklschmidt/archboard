import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import { liveItemId, upsertLiveItem } from "@/runtime/codex-realtime/lib/live-items";
import * as phase from "@/runtime/codex-realtime/lib/phase";
import type { RealtimeSessionOps } from "@/runtime/codex-realtime/lib/session-ops";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

type ServerNotification = TransportServerNotification["notification"];
type NotificationParams<Method extends ServerNotification["method"]> = Extract<
	ServerNotification,
	{ readonly method: Method }
>["params"];

/**
 * Realtime notifications Codex can send but the WebRTC item-scoped contract never uses; each is
 * reported as a protocol diagnostic rather than acted on.
 */
const OUT_OF_CONTRACT_METHODS: ReadonlySet<ServerNotification["method"]> = new Set<
	ServerNotification["method"]
>([
	"thread/realtime/itemAdded",
	"thread/realtime/transcript/delta",
	"thread/realtime/transcript/done",
	"thread/realtime/outputAudio/delta",
]);

/**
 * Whether the session is still negotiating and may accept start evidence.
 * @param session - The live session.
 * @returns True while the answer is unsettled and the phase is negotiating.
 */
function negotiating(session: ActiveRealtimeSession): boolean {
	return !session.answerSettled && session.state.phase === "negotiating";
}

/**
 * Record the answer SDP Codex produced and settle the browser's answer if everything else is in.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param sdp - The answer SDP.
 */
function applySdp(ops: RealtimeSessionOps, session: ActiveRealtimeSession, sdp: string): void {
	if (!negotiating(session)) {
		return;
	}
	session.answerSdp = sdp;
	ops.settleAnswer(session);
}

/**
 * Record that Codex started the realtime session, refusing a start that names another session
 * or protocol version.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param params - The started notification.
 */
function applyStarted(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	params: NotificationParams<"thread/realtime/started">,
): void {
	if (!negotiating(session)) {
		return;
	}
	if (params.realtimeSessionId !== session.wireSessionId || params.version !== "v3") {
		ops.emitDiagnostic(session, "protocol", "Codex reported a mismatched realtime start identity.");
		return;
	}
	session.started = true;
	ops.settleAnswer(session);
}

/**
 * Append transcript text to a known item and mark it provisional again.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param params - The delta notification.
 */
function applyTranscriptDelta(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	params: NotificationParams<"thread/realtime/item/transcript/delta">,
): void {
	const itemId = liveItemId(ops.options.identity.decoder, params.itemId, "reference");
	if (itemId === null) {
		return;
	}
	const entry = session.entries.get(itemId);
	if (entry === undefined) {
		return;
	}
	entry.text += params.delta;
	entry.status = "provisional";
	ops.publishTranscript(session);
}

/**
 * Finalise a completed item; a completed session-closed item for this session ends the session.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param item - The completed item.
 */
function applyItemCompleted(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	item: NotificationParams<"thread/realtime/item/completed">["item"],
): void {
	upsertLiveItem(ops, session, item, "final", "reference");
	if (item.type !== "realtimeSessionClosed" || item.realtimeSessionId !== session.wireSessionId) {
		return;
	}
	if (item.outcome === "failed") {
		ops.emitDiagnostic(session, "realtime", "Codex closed the realtime session as failed.");
	}
	ops.finalize(session);
}

/**
 * Surface a realtime error and, when the phase allows, move to a recoverable error; a session
 * still negotiating has its pending answer rejected with the same message.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param message - The error text Codex reported.
 */
function applyRealtimeError(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	message: string,
): void {
	ops.emitDiagnostic(session, "app_server", message);
	const failure = phase.realtimeFailureState(session.state, message);
	if (failure === null) {
		return;
	}
	const ownsPendingStart = !session.answerSettled;
	if (ownsPendingStart) {
		session.answerSettled = true;
	}
	ops.state(session, failure);
	if (ownsPendingStart) {
		session.rejectAnswer(new Error(message));
	}
}

/**
 * Reduce the negotiation and lifecycle notifications: SDP, started, error and closed.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param notification - The notification to reduce.
 * @returns True when the notification was one of these.
 */
function reduceLifecycle(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	notification: ServerNotification,
): boolean {
	switch (notification.method) {
		case "thread/realtime/sdp":
			applySdp(ops, session, notification.params.sdp);
			return true;
		case "thread/realtime/started":
			applyStarted(ops, session, notification.params);
			return true;
		case "thread/realtime/error":
			applyRealtimeError(ops, session, notification.params.message);
			return true;
		case "thread/realtime/closed":
			ops.emitDiagnostic(
				session,
				"realtime",
				notification.params.reason ?? "Codex closed the realtime session.",
			);
			ops.finalize(session);
			return true;
		default:
			return false;
	}
}

/**
 * Reduce the item-scoped notifications: item started, transcript delta and item completed.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param notification - The notification to reduce.
 * @returns True when the notification was one of these.
 */
function reduceItem(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	notification: ServerNotification,
): boolean {
	switch (notification.method) {
		case "thread/realtime/item/started":
			upsertLiveItem(ops, session, notification.params.item, "provisional", "introduce");
			return true;
		case "thread/realtime/item/transcript/delta":
			applyTranscriptDelta(ops, session, notification.params);
			return true;
		case "thread/realtime/item/completed":
			applyItemCompleted(ops, session, notification.params.item);
			return true;
		default:
			return false;
	}
}

/**
 * Reduce one server notification already proven to belong to the live session. Methods outside
 * the realtime contract are ignored; realtime methods outside the WebRTC item-scoped subset are
 * reported as protocol diagnostics.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param notification - The notification to reduce.
 */
function reduceRealtimeNotification(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	notification: ServerNotification,
): void {
	if (reduceLifecycle(ops, session, notification) || reduceItem(ops, session, notification)) {
		return;
	}
	if (OUT_OF_CONTRACT_METHODS.has(notification.method)) {
		ops.emitDiagnostic(
			session,
			"protocol",
			`${notification.method} is outside the WebRTC item-scoped contract.`,
		);
	}
}

export { reduceRealtimeNotification };
