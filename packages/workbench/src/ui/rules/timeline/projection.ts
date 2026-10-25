// The server's authoritative timeline as the conversation: one turn per Codex
// turn, identified by thread and turn, its items passed through with their
// evidence. A turn or item published twice is a failure the caller shows,
// never something silently merged. The voice coordinator's turns are projected
// the same way and stand among the workhorse's by when they started.

import type { BrowserTimeline } from "@archboard/codex-realtime-voice/contract";
import type {
	ConversationOutcome,
	ConversationOwner,
	ConversationTurn,
} from "#ui/state/timeline/contract.ts";

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
 * What makes one item of a turn itself. An approval shares the item id of
 * the call it gates, and one call can be asked about more than once, so an
 * approval is itself by its own id.
 * @param turnId The turn.
 * @param item The item.
 * @returns The identity.
 */
function itemIdentity(
	turnId: string,
	item: BrowserTimeline["turns"][number]["items"][number],
): string {
	const own = item.media === "approval" ? item.approvalId : item.itemId;
	return `${turnId}/${item.media}/${own}`;
}

/**
 * The conversation a timeline holds.
 * @param timeline The authoritative timeline.
 * @param owner Whose thread it is.
 * @returns One turn per Codex turn, in order.
 * @throws {Error} When a turn or an item is published twice.
 */
function projectTimelineTurns(
	timeline: BrowserTimeline,
	owner: ConversationOwner,
): readonly ConversationTurn[] {
	const turns = new Set<string>();
	const items = new Set<string>();
	return timeline.turns.map((turn) => {
		claimIdentity(turns, turn.turnId, "turn");
		for (const item of turn.items) claimIdentity(items, itemIdentity(turn.turnId, item), "item");
		return {
			id: conversationTurnId(timeline.threadId, turn.turnId),
			owner,
			threadId: timeline.threadId,
			turnId: turn.turnId,
			outcome: outcomeOf(turn.status),
			items: turn.items,
			startedAtMs: turn.startedAtMs,
			completedAtMs: turn.completedAtMs,
			durationMs: turn.durationMs,
			error: turn.error,
			plan: turn.plan,
			delegatedBy: turn.delegatedBy == null ? null : { turnId: turn.delegatedBy, shown: false },
		};
	});
}

/** A turn and where it sorts. */
interface Placed {
	readonly turn: ConversationTurn;
	readonly key: number;
}

/**
 * Each turn of one thread with the time it sorts by: when it started, and for
 * a turn that has no start, the time of the turn before it in its own thread.
 * A thread's own order never changes.
 * @param turns One thread's turns, in order.
 * @returns The turns with their keys, never decreasing.
 */
function placed(turns: readonly ConversationTurn[]): Placed[] {
	let latest = Number.NEGATIVE_INFINITY;
	return turns.map((turn) => {
		latest = Math.max(latest, turn.startedAtMs ?? latest);
		return { turn, key: latest };
	});
}

/**
 * Compare two places by time.
 * @param left The first.
 * @param right The second.
 * @returns Negative when the first sorts first.
 */
function byTime(left: Placed, right: Placed): number {
	if (left.key === right.key) return 0;
	return left.key < right.key ? -1 : 1;
}

/**
 * A workhorse turn that says whether the coordinator turn which delegated it is
 * in the conversation.
 * @param turn The turn.
 * @param shown The coordinator turns in the conversation.
 * @returns The turn, as it was when nothing changes.
 */
function withDelegationShown(turn: ConversationTurn, shown: ReadonlySet<string>): ConversationTurn {
	const { delegatedBy } = turn;
	if (delegatedBy === null) return turn;
	const isShown = shown.has(delegatedBy.turnId);
	if (isShown === delegatedBy.shown) return turn;
	return { ...turn, delegatedBy: { ...delegatedBy, shown: isShown } };
}

/**
 * The workhorse's turns and the voice coordinator's in one conversation, ordered
 * by when each started. Two turns that start together keep the coordinator's
 * first, since it is the one that hands work on.
 * @param workhorse The workhorse's turns, in order.
 * @param coordinator The voice coordinator's turns, in order.
 * @returns The turns, with each delegated one told whether its delegating turn is among them.
 */
function mergeConversation(
	workhorse: readonly ConversationTurn[],
	coordinator: readonly ConversationTurn[],
): readonly ConversationTurn[] {
	if (coordinator.length === 0) return workhorse;
	const shown = new Set(coordinator.map((turn) => turn.turnId));
	// `toSorted` keeps the order of equal keys, so the coordinator, listed first, wins a tie.
	return [...placed(coordinator), ...placed(workhorse)]
		.toSorted(byTime)
		.map(({ turn }) => withDelegationShown(turn, shown));
}

export { conversationTurnId, mergeConversation, projectTimelineTurns };
