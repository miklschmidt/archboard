import { expect, test } from "bun:test";

import type { BrowserTimeline } from "@archboard/codex-realtime-voice/contract";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import {
	conversationTurnId,
	mergeConversation,
	projectTimelineTurns,
} from "#ui/rules/timeline/projection.ts";

const { decoder } = createIdentityAuthorities().identity;
const threadId = decoder.adoptThreadId("thread-timeline");
const coordinatorThreadId = decoder.adoptThreadId("thread-coordinator");

type BrowserTurn = BrowserTimeline["turns"][number];

/** What differs between the turns these tests use. */
interface TurnOptions {
	/** When it started; null when Codex did not say. */
	readonly startedAtMs?: number | null;
	/** The coordinator turn that delegated it. */
	readonly delegatedBy?: string;
}

/**
 * When a turn started, and which coordinator turn delegated it.
 * @param options What the test said.
 * @returns The fields, a start at 1000 and no delegation unless said.
 */
function placement(options: TurnOptions): Pick<BrowserTurn, "startedAtMs" | "delegatedBy"> {
	const { startedAtMs = 1000, delegatedBy } = options;
	return {
		startedAtMs,
		delegatedBy: delegatedBy === undefined ? null : decoder.adoptTurnId(delegatedBy),
	};
}

/**
 * One turn with a prompt and an answer.
 * @param id The turn's id.
 * @param status Its Codex status.
 * @param options What differs from a turn that started at 1000.
 * @returns The turn.
 */
function turn(id: string, status: BrowserTurn["status"], options: TurnOptions = {}): BrowserTurn {
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
		...placement(options),
		completedAtMs: status === "inProgress" ? null : 4000,
		durationMs: status === "inProgress" ? null : 3000,
		error: status === "failed" ? { message: "Rate limit reached.", details: null } : null,
		plan: null,
	};
}

/**
 * A timeline of these turns.
 * @param turns The turns.
 * @param thread The thread they belong to.
 * @returns The timeline.
 */
function timeline(turns: readonly BrowserTurn[], thread = threadId): BrowserTimeline {
	return { kind: "timeline", threadId: thread, turns: [...turns], nextCursor: null, usage: null };
}

/**
 * A turn that started at this time.
 * @param startedAtMs When.
 * @returns The options.
 */
function at(startedAtMs: number): TurnOptions {
	return { startedAtMs };
}

/**
 * The turn ids of these names.
 * @param names The names the tests gave the turns.
 * @returns The ids.
 */
function ids(...names: readonly string[]): BrowserTurn["turnId"][] {
	return names.map((name) => decoder.adoptTurnId(name));
}

/**
 * The turns of the workhorse's thread and of the coordinator's, as one conversation.
 * @param workhorse The workhorse's turns.
 * @param coordinator The coordinator's turns.
 * @returns The turn ids in the order the conversation shows them.
 */
function mergedIds(
	workhorse: readonly BrowserTurn[],
	coordinator: readonly BrowserTurn[],
): BrowserTurn["turnId"][] {
	return mergeConversation(
		projectTimelineTurns(timeline(workhorse), "workhorse"),
		projectTimelineTurns(timeline(coordinator, coordinatorThreadId), "coordinator"),
	).map((entry) => entry.turnId);
}

test("each Codex turn is one conversation turn, in order, with its items, timing and outcome", () => {
	const turns = projectTimelineTurns(
		timeline([turn("t1", "completed"), turn("t2", "failed"), turn("t3", "inProgress")]),
		"workhorse",
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
		projectTimelineTurns(timeline([turn("t1", "completed"), turn("t1", "completed")]), "workhorse"),
	).toThrow();
	const doubled = turn("t2", "completed");
	expect(() =>
		projectTimelineTurns(
			timeline([{ ...doubled, items: [...doubled.items, ...doubled.items] }]),
			"workhorse",
		),
	).toThrow();
});

test("one call asked about twice is two approvals in its turn, not a duplicate", () => {
	const asked = turn("t3", "inProgress");
	const call = decoder.adoptItemId("t3-call");
	/**
	 * One approval of that call.
	 * @param id The approval's id.
	 * @returns The item.
	 */
	const approval = (id: string): BrowserTurn["items"][number] => ({
		media: "approval",
		itemId: call,
		approvalId: decoder.adoptApprovalId(id),
		status: "pending",
	});
	const [projected] = projectTimelineTurns(
		timeline([{ ...asked, items: [...asked.items, approval("first"), approval("second")] }]),
		"workhorse",
	);
	expect(projected?.items.filter((item) => item.media === "approval")).toHaveLength(2);
});

test("a turn says whose thread it is from, and the turn that delegated it", () => {
	const [mine] = projectTimelineTurns(
		timeline([turn("w1", "completed", { delegatedBy: "c1" })]),
		"workhorse",
	);
	const [theirs] = projectTimelineTurns(
		timeline([turn("c1", "completed")], coordinatorThreadId),
		"coordinator",
	);
	expect(mine).toMatchObject({
		owner: "workhorse",
		delegatedBy: { turnId: decoder.adoptTurnId("c1"), shown: false },
	});
	expect(theirs).toMatchObject({ owner: "coordinator", delegatedBy: null });
	expect(theirs?.id).toBe(conversationTurnId(coordinatorThreadId, decoder.adoptTurnId("c1")));
});

test("the two threads' turns stand in one order by when they started, each thread keeping its own", () => {
	expect(
		mergedIds(
			[turn("w1", "completed", at(1000)), turn("w2", "completed", at(5000))],
			[turn("c1", "completed", at(500)), turn("c2", "completed", at(3000))],
		),
	).toEqual(ids("c1", "w1", "c2", "w2"));
	// A thread's own order is Codex's, whatever its clocks say: w2 stays behind w1.
	expect(
		mergedIds(
			[turn("w1", "completed", at(4000)), turn("w2", "completed", at(2000))],
			[turn("c1", "completed", at(3000))],
		),
	).toEqual(ids("c1", "w1", "w2"));
});

test("turns that start together put the coordinator's first: it is the one that hands work on", () => {
	expect(
		mergedIds(
			[turn("w1", "completed", { startedAtMs: 7000 })],
			[turn("c1", "completed", { startedAtMs: 7000 })],
		),
	).toEqual(ids("c1", "w1"));
});

test("a turn without a start keeps its place in its own thread", () => {
	const none = { startedAtMs: null };
	// After the turn before it, though the other thread started something since.
	expect(
		mergedIds(
			[turn("w1", "completed", { startedAtMs: 1000 }), turn("w2", "inProgress", none)],
			[turn("c1", "completed", { startedAtMs: 2000 })],
		),
	).toEqual(ids("w1", "w2", "c1"));
	// First of its thread, it comes before the other thread's turns.
	expect(
		mergedIds([turn("w1", "inProgress", none)], [turn("c1", "completed", { startedAtMs: 2000 })]),
	).toEqual(ids("w1", "c1"));
});

test("a delegated turn knows whether the turn that delegated it is in the conversation", () => {
	const workhorse = projectTimelineTurns(
		timeline([
			turn("w1", "completed", { delegatedBy: "c1" }),
			turn("w2", "completed", { delegatedBy: "gone" }),
		]),
		"workhorse",
	);
	const coordinator = projectTimelineTurns(
		timeline([turn("c1", "completed", { startedAtMs: 500 })], coordinatorThreadId),
		"coordinator",
	);
	const merged = mergeConversation(workhorse, coordinator);
	expect(merged.map((entry) => entry.delegatedBy)).toEqual([
		null,
		{ turnId: decoder.adoptTurnId("c1"), shown: true },
		{ turnId: decoder.adoptTurnId("gone"), shown: false },
	]);
	// Without the coordinator's turns the conversation is the workhorse's own.
	expect(mergeConversation(workhorse, [])).toBe(workhorse);
});
