import { releaseCapture } from "#server/services/explanations/capture.ts";
import type { Entry, Notification } from "#server/services/explanations/contract.ts";

type Turn = Extract<Notification, { method: "turn/completed" }>["params"]["turn"];
/**
 * Set the final action outcome from the provider's exact turn.
 * @param entry The captured action.
 * @param turn The correlated turn completion.
 */
function finish(entry: Entry, turn: Turn) {
	const text = turn.items
		.flatMap((item) =>
			item.type === "agentMessage" && item.phase !== "commentary" ? [item.text] : [],
		)
		.join("\n\n");
	if (text) entry.action.text = text;
	entry.action.status = finalStatus(entry, turn);
	entry.action.retryable = entry.action.status !== "completed";
	releaseCapture(entry);
	if (entry.action.status === "failed")
		entry.action.error =
			turn.error?.message ?? "The agent returned no answer. Retry the captured request.";
}
/**
 * Correlate a turn using the queue's stable client message identity.
 * @param entry The captured action.
 * @param turn The lifecycle notification.
 * @returns Whether this turn belongs to the action.
 */
function ownsTurn(entry: Entry, turn: Turn) {
	if (
		entry.turnId === undefined &&
		turn.items.some((item) => item.type === "userMessage" && item.clientId === entry.clientId)
	)
		entry.turnId = turn.id;
	return entry.turnId === turn.id;
}
/**
 * Project provider notifications into one temporary answer.
 * @param entry The captured action on the notification's thread.
 * @param notification The existing provider event.
 * @returns Whether the event changed the answer.
 */
function noteExplanation(entry: Entry, notification: Notification) {
	const before = entry.action;
	const status = before.status;
	const text = before.text;
	const error = before.error;
	switch (notification.method) {
		case "turn/started":
		case "turn/completed":
			noteTurn(entry, notification);
			break;
		case "item/completed":
			if (notification.params.turnId === entry.turnId) noteText(entry, notification.params.item);
			break;
		default:
			break;
	}
	return [
		status !== entry.action.status,
		text !== entry.action.text,
		error !== entry.action.error,
	].some(Boolean);
}
/**
 * Keep the provider's final textual item for a partial completion notification.
 * @param entry The captured action.
 * @param item The completed provider item.
 */
function noteText(entry: Entry, item: Turn["items"][number]) {
	if (item.type === "agentMessage" && item.phase !== "commentary") entry.action.text = item.text;
}
export { noteExplanation };

/**
 * Interpret the final provider outcome without changing its captured request.
 * @param entry The temporary text result.
 * @param turn The correlated provider turn.
 * @returns The visible action status.
 */
function finalStatus(entry: Entry, turn: Turn) {
	if (turn.status === "interrupted") return "cancelled";
	if (turn.status === "failed" || !entry.action.text) return "failed";
	return "completed";
}
/**
 * Apply a correlated turn lifecycle event.
 * @param entry The captured action.
 * @param notification The provider lifecycle event.
 */
function noteTurn(
	entry: Entry,
	notification: Extract<Notification, { method: "turn/started" | "turn/completed" }>,
) {
	if (!ownsTurn(entry, notification.params.turn)) return;
	delete entry.submission;
	if (notification.method === "turn/started") entry.action.status = "running";
	else finish(entry, notification.params.turn);
}
