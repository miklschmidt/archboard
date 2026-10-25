// The messages the person sent that the conversation does not show yet, and
// how the timeline and a delivery's answer move them on. Pure.

import type { WorkbenchComposerSubmissionResult } from "@archboard/codex-realtime-voice/controllers";
import type { BrowserWorkbenchState } from "@archboard/codex-realtime-voice/controllers";

/** Where one held message stands. */
type HeldState = "waiting" | "sending" | "delivered" | "failed" | "unknown";

/** A message the person sent that the conversation does not show yet. */
interface HeldMessage {
	readonly id: string;
	readonly text: string;
	/** The person asked for it to run after the current turn. */
	readonly queue: boolean;
	readonly state: HeldState;
	/** Why it was not delivered, or why its outcome is unknown. */
	readonly reason: string | null;
	/** The turn it went into, once delivered. */
	readonly turnId: string | null;
}

/**
 * The prompts the timeline shows.
 * @param state The transport state.
 * @returns Each prompt item's id and words.
 */
function promptsIn(
	state: BrowserWorkbenchState,
): { readonly itemId: string; readonly text: string }[] {
	return (state.snapshot?.timeline?.turns ?? []).flatMap((turn) =>
		turn.items.flatMap((item) => (item.media === "prompt" ? [item] : [])),
	);
}

/**
 * Whether the timeline shows a delivered message: its turn is there and holds
 * a prompt with its words, or the turn has already ended.
 * @param state The transport state.
 * @param message The held message.
 * @returns True once the conversation shows it.
 */
function shownInTimeline(state: BrowserWorkbenchState, message: HeldMessage): boolean {
	const turn = state.snapshot?.timeline?.turns.find((entry) => entry.turnId === message.turnId);
	if (turn === undefined) return false;
	const said = message.text.trim();
	return (
		turn.status !== "inProgress" ||
		turn.items.some((item) => item.media === "prompt" && item.text.trim() === said)
	);
}

/**
 * Whether a message whose delivery went unanswered arrived after all: the
 * timeline shows a prompt with its words that was not there when it was sent.
 * @param state The transport state.
 * @param message The held message.
 * @param before The prompt item ids the timeline showed when it was sent.
 * @returns True once the conversation shows it.
 */
function arrivedAfterAll(
	state: BrowserWorkbenchState,
	message: HeldMessage,
	before: ReadonlySet<string> | undefined,
): boolean {
	const said = message.text.trim();
	return promptsIn(state).some(
		(prompt) => before?.has(prompt.itemId) !== true && prompt.text.trim() === said,
	);
}

/**
 * The held messages once one settled delivery is recorded.
 * @param held The held messages.
 * @param id The message.
 * @param result What the composer said.
 * @returns The held messages.
 */
function settleDelivery(
	held: readonly HeldMessage[],
	id: string,
	result: WorkbenchComposerSubmissionResult,
): HeldMessage[] {
	if (result.outcome === "queued") return held.filter((message) => message.id !== id);
	const change: Partial<HeldMessage> =
		result.outcome === "delivered"
			? { state: "delivered", turnId: result.turnId }
			: { state: result.outcome === "not_delivered" ? "failed" : "unknown", reason: result.reason };
	return held.map((message) => (message.id === id ? { ...message, ...change } : message));
}

export {
	arrivedAfterAll,
	promptsIn,
	settleDelivery,
	shownInTimeline,
	type HeldMessage,
	type HeldState,
};
