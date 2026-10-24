import { describe, expect, test } from "bun:test";

import type { SettledSemanticChangeEvent } from "#runtime/schemas/semantic-context-types.ts";
import {
	close,
	harness,
	semanticInput,
	type Harness,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

// Outside news (TASK-293.06): what an agent that is neither this session's workhorse nor its
// coordinator does to what the user is looking at. Neither model asked for it, and what they hold
// about the board is no longer true. What these catch: the session's own writes coming back to it,
// a write to a board nobody looks at being told, the coordinator being run (rather than told) by
// news, two writes folded into one, and an agent's doing credited to the user.

/**
 * A settled write to a board, as the publisher hands it on, with who the writer said it was.
 * @param h - The harness.
 * @param sequence - Its place in the feed, which is what makes it a write of its own.
 * @param by - The session it stated, or null when it stated none.
 * @param board - The board it wrote.
 * @returns The event.
 */
function write(
	h: Harness,
	sequence: number,
	by: string | null,
	board = "architecture",
): SettledSemanticChangeEvent {
	const base = h.semantic.change;
	const cursor = { feedId: base.change.cursor.feedId, sequence };
	return { ...base, cursor, change: { ...base.change, cursor, by, board } };
}

/**
 * The focus a `browser show` by an agent publishes for the pane it moved.
 * @param h - The harness.
 * @param by - The session it stated, or null.
 * @returns The event.
 */
function shown(h: Harness, by: string | null) {
	const base = semanticInput(h.ids, true);
	return h.semantic.publisher.publishPaneFocus({
		...base,
		pane: { ...base.pane, agentSwitch: { from: "Payments", by } },
	});
}

/**
 * The texts appended to the live voice session so far, with the channel each went down.
 * @param h - The harness.
 * @returns Each channel and text.
 */
function told(h: Harness): readonly (readonly [string, string])[] {
	return h.realtimeRequests.map((request) => [request.channel, request.params.text] as const);
}

describe("outside news", () => {
	test("this session's own writes reach neither model; another agent's and an unattributed one each reach both as one quiet sentence, and start no coordinator turn", async () => {
		const h = harness(true);
		const workhorse = String(h.state.link?.target.threadId);
		const coordinator = String(h.state.coordinator?.threadId);
		const own = [
			await h.callbacks.enqueue(write(h, 11, workhorse)),
			await h.callbacks.enqueue(write(h, 12, coordinator)),
		];
		const other = await h.callbacks.enqueue(write(h, 13, "another-agent-thread"));
		const nobody = await h.callbacks.enqueue(write(h, 14, null));

		for (const delivery of own) expect(delivery.reason).toBe("own_change");
		for (const delivery of [other, nobody]) {
			expect(delivery).toMatchObject({
				outcome: "delivered",
				path: "realtime_appendText",
				// Recorded as an agent's doing even though it was told.
				reason: "agent",
			});
		}
		const sentences = told(h).map(([, text]) => text);
		expect(told(h).map(([channel]) => channel)).toEqual(["context", "context"]);
		// The coordinator gets the same sentence as quiet context, on its own thread.
		expect(h.injections.map((injection) => injection.text)).toEqual(sentences);
		expect(h.injections.every((injection) => String(injection.threadId) === coordinator)).toBe(
			true,
		);
		expect(h.reports).toHaveLength(0);
		const [sentence] = sentences;
		// The board by name and what the writer said it was doing; never an id, the envelope, or
		// the user as the one who did it.
		expect(sentence).toContain("Architecture");
		expect(sentence).toContain("mapping");
		expect(sentence).not.toContain("another-agent-thread");
		expect(sentence).not.toContain("{");
		expect(sentence).not.toMatch(/\buser\b/u);
		close(h);
	});

	test("a write to a board no pane of the canvas shows tells nobody", async () => {
		const h = harness(true);
		const delivery = await h.callbacks.enqueue(write(h, 21, null, "payments"));

		expect(delivery).toMatchObject({ outcome: "not_delivered", reason: "not_shown" });
		expect(h.realtimeRequests).toHaveLength(0);
		expect(h.injections).toHaveLength(0);
		close(h);
	});

	test("writes queued together are a sentence each: nothing an agent did is folded into the next", async () => {
		const h = harness(true);
		const both = await Promise.all([
			h.callbacks.enqueue(write(h, 31, null)),
			h.callbacks.enqueue(write(h, 32, null)),
		]);

		expect(both.map((delivery) => delivery.outcome)).toEqual(["delivered", "delivered"]);
		expect(h.realtimeRequests).toHaveLength(2);
		expect(h.injections).toHaveLength(2);
		close(h);
	});

	test("an agent's show is told to both in words that do not credit the user and is recorded as the agent's; this session's own show tells nobody", async () => {
		const h = harness(true);
		const other = await h.callbacks.enqueue(shown(h, null));
		const own = await h.callbacks.enqueue(shown(h, String(h.state.link?.target.threadId)));

		expect(other).toMatchObject({ outcome: "delivered", reason: "agent" });
		expect(own.reason).toBe("own_change");
		const [[channel, sentence] = ["", ""]] = told(h);
		expect(told(h)).toHaveLength(1);
		expect(channel).toBe("context");
		expect(sentence).toContain("Payments");
		expect(sentence).toContain("Architecture");
		expect(sentence).not.toMatch(/\buser\b/u);
		expect(h.injections.map((injection) => injection.text)).toEqual([sentence]);
		close(h);
	});

	test("during a narration an outside write to the narrated board and an agent's show are speech, and a write to another board on screen stays quiet", async () => {
		const h = harness(true);
		h.state.boards = ["architecture", "ledger"];
		h.state.narrated = "architecture";
		await h.callbacks.enqueue(write(h, 41, null));
		await h.callbacks.enqueue(write(h, 42, null, "ledger"));
		await h.callbacks.enqueue(shown(h, null));

		expect(told(h).map(([channel]) => channel)).toEqual(["speech", "context", "speech"]);
		// The coordinator is told quietly whatever the voice is told.
		expect(h.injections).toHaveLength(3);
		close(h);
	});
});
