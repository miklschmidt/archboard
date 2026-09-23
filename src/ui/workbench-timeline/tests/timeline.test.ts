import { expect, test } from "bun:test";

import type { BrowserTimeline } from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import { conversationTurnId, projectTimelineTurns } from "@/ui/workbench-timeline";

const { decoder } = createIdentityAuthorities().identity;
const threadId = decoder.adoptThreadId("thread-timeline");

type BrowserTurn = BrowserTimeline["turns"][number];

/**
 * One turn with a prompt and an answer.
 * @param id The turn's id.
 * @param status Its Codex status.
 * @returns The turn.
 */
function turn(id: string, status: BrowserTurn["status"]): BrowserTurn {
	return {
		turnId: decoder.adoptTurnId(id),
		status,
		items: [
			{ media: "prompt", itemId: decoder.adoptItemId(`${id}-prompt`), text: "Why?" },
			{ media: "text", itemId: decoder.adoptItemId(`${id}-answer`), text: "Because." },
		],
		summary: status,
		outputsIncluded: true,
		outputsTruncated: false,
		startedAtMs: 1000,
		completedAtMs: status === "inProgress" ? null : 4000,
		durationMs: status === "inProgress" ? null : 3000,
		error: status === "failed" ? { message: "Rate limit reached.", details: null } : null,
		plan: null,
	};
}

/**
 * A timeline of these turns.
 * @param turns The turns.
 * @returns The timeline.
 */
function timeline(turns: readonly BrowserTurn[]): BrowserTimeline {
	return { kind: "timeline", threadId, turns: [...turns], nextCursor: null, usage: null };
}

test("each Codex turn is one conversation turn, in order, with its items, timing and outcome", () => {
	const turns = projectTimelineTurns(
		timeline([turn("t1", "completed"), turn("t2", "failed"), turn("t3", "inProgress")]),
	);
	expect(turns.map((entry) => [entry.id, entry.outcome])).toEqual([
		[conversationTurnId(threadId, decoder.adoptTurnId("t1")), "completed"],
		[conversationTurnId(threadId, decoder.adoptTurnId("t2")), "failed"],
		[conversationTurnId(threadId, decoder.adoptTurnId("t3")), "running"],
	]);
	expect(turns[0]?.items.map((item) => item.media)).toEqual(["prompt", "text"]);
	expect(turns[0]?.durationMs).toBe(3000);
	expect(turns[1]?.error?.message).toBe("Rate limit reached.");
});

test("a turn or an item published twice is refused, never merged", () => {
	expect(() =>
		projectTimelineTurns(timeline([turn("t1", "completed"), turn("t1", "completed")])),
	).toThrow();
	const doubled = turn("t2", "completed");
	expect(() =>
		projectTimelineTurns(timeline([{ ...doubled, items: [...doubled.items, ...doubled.items] }])),
	).toThrow();
});
