import { releaseCapture } from "#server/services/explanations/capture.ts";
import type { Entry, Notification } from "#server/services/explanations/contract.ts";

type Turn = Extract<Notification, { method: "turn/completed" }>["params"]["turn"];
type Item = Turn["items"][number];
type CommandAction = Extract<Item, { type: "commandExecution" }>["commandActions"][number];

/** How much of a sentence the activity line of the panel holds. */
const ACTIVITY_MOST = 140;

/**
 * The first sentence of a note, cut to the line that shows it.
 * @param text What Codex said on the way.
 * @returns The line.
 */
function noteLine(text: string): string {
	const [line = ""] = text.trim().split("\n");
	return line.length > ACTIVITY_MOST ? `${line.slice(0, ACTIVITY_MOST - 1)}…` : line;
}

/**
 * What a command does, in the words of the first thing it does.
 * @param action Its first action, when Codex could read one.
 * @returns What Codex is doing.
 */
function commandWords(action: CommandAction | undefined): string {
	switch (action?.type) {
		case "read":
			return `Reading ${action.name}`;
		case "search":
			return "Searching the code";
		case "listFiles":
			return "Listing files";
		default:
			return "Running a command";
	}
}

/**
 * What a started or finished item says that Codex is doing.
 * @param item The item.
 * @returns The words, or nothing for an item that says nothing new.
 */
function activityOf(item: Item): string | undefined {
	switch (item.type) {
		case "reasoning":
			return "Thinking";
		case "webSearch":
			return "Searching the web";
		case "commandExecution":
			return noteLine(commandWords(item.commandActions[0]));
		case "agentMessage":
			return item.phase === "commentary" ? noteLine(item.text) : "Writing the answer";
		default:
			return undefined;
	}
}

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
	delete entry.action.activity;
	delete entry.action.error;
	releaseCapture(entry);
	if (entry.action.status === "failed")
		entry.action.error =
			turn.error?.message ?? "The agent returned no answer. Retry the captured request.";
}
/**
 * Correlate a turn using the queue's stable client message identity.
 * @param entry The captured action.
 * @param turnId The provider turn identity.
 * @param items The lifecycle or item notification's items.
 * @returns Whether this turn belongs to the action.
 */
function ownsTurn(entry: Entry, turnId: string, items: Turn["items"]) {
	if (
		entry.turnId === undefined &&
		entry.clientId !== undefined &&
		items.some((item) => item.type === "userMessage" && item.clientId === entry.clientId)
	) {
		entry.turnId = turnId;
		delete entry.submission;
		entry.action.status = "running";
		entry.turnNamed?.();
	}
	return entry.turnId === turnId;
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
	const activity = before.activity;
	switch (notification.method) {
		case "turn/started":
		case "turn/completed":
			noteTurn(entry, notification);
			break;
		case "item/started":
		case "item/completed":
			noteItem(entry, notification);
			break;
		case "item/agentMessage/delta":
			noteDelta(entry, notification);
			break;
		default:
			break;
	}
	return [
		status !== entry.action.status,
		text !== entry.action.text,
		error !== entry.action.error,
		activity !== entry.action.activity,
	].some(Boolean);
}
/**
 * Keep the answer as Codex writes it.
 * @param entry The captured action.
 * @param notification The provider text event.
 */
function noteDelta(
	entry: Entry,
	notification: Extract<Notification, { method: "item/agentMessage/delta" }>,
) {
	const { turnId, itemId, delta } = notification.params;
	if (entry.turnId === turnId && entry.answerItem === itemId) entry.action.text += delta;
}
/**
 * Correlate user items, say what Codex is doing and keep final text from that exact turn.
 * @param entry The captured action.
 * @param notification The provider item lifecycle event.
 */
function noteItem(
	entry: Entry,
	notification: Extract<Notification, { method: "item/started" | "item/completed" }>,
) {
	const { turnId, item } = notification.params;
	if (!ownsTurn(entry, turnId, [item])) return;
	entry.action.activity = activityOf(item) || entry.action.activity;
	if (item.type !== "agentMessage" || item.phase === "commentary") return;
	entry.answerItem = item.id;
	if (notification.method === "item/completed") entry.action.text = item.text;
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
	const turn = notification.params.turn;
	if (!ownsTurn(entry, turn.id, turn.items)) return;
	delete entry.submission;
	delete entry.action.error;
	if (notification.method === "turn/started") entry.action.status = "running";
	else finish(entry, notification.params.turn);
}
