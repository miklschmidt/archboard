// The host's authoritative timeline as the conversation: one turn per Codex
// turn, identified by thread and turn, its items passed through with their
// evidence. A turn or item published twice is a failure the caller shows,
// never something silently merged.

import type { BrowserTimeline } from "@/shared/codex-browser-model";
import type {
	ConversationOutcome,
	ConversationTurn,
} from "@/ui/workbench-timeline/types/contract";

type BrowserTurn = BrowserTimeline["turns"][number];

/**
 * The stable id of one turn.
 * @param threadId The thread.
 * @param turnId The turn.
 * @returns The id.
 */
function conversationTurnId(threadId: string, turnId: string): string {
	return JSON.stringify(["turn", threadId, turnId]);
}

/**
 * How a turn ended.
 * @param status The Codex status.
 * @returns The outcome.
 */
function outcomeOf(status: BrowserTurn["status"]): ConversationOutcome {
	return status === "inProgress" ? "running" : status;
}

/**
 * Refuse an identity already seen.
 * @param seen The identities so far.
 * @param identity This one.
 * @param what What it identifies, for the refusal.
 */
function claimIdentity(seen: Set<string>, identity: string, what: string): void {
	if (seen.has(identity)) throw new Error(`Codex published the same ${what} twice: ${identity}`);
	seen.add(identity);
}

/**
 * The conversation a timeline holds.
 * @param timeline The authoritative timeline.
 * @returns One turn per Codex turn, in order.
 * @throws {Error} When a turn or an item is published twice.
 */
function projectTimelineTurns(timeline: BrowserTimeline): readonly ConversationTurn[] {
	const turns = new Set<string>();
	const items = new Set<string>();
	return timeline.turns.map((turn) => {
		claimIdentity(turns, turn.turnId, "turn");
		for (const item of turn.items) claimIdentity(items, `${turn.turnId}/${item.itemId}/${item.media}`, "item");
		return {
			id: conversationTurnId(timeline.threadId, turn.turnId),
			threadId: timeline.threadId,
			turnId: turn.turnId,
			outcome: outcomeOf(turn.status),
			items: turn.items,
			startedAtMs: turn.startedAtMs,
			completedAtMs: turn.completedAtMs,
			durationMs: turn.durationMs,
			error: turn.error,
			plan: turn.plan,
		};
	});
}

export { conversationTurnId, projectTimelineTurns };
