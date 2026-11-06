// What a reader of an explanation sees while Codex works: its steps, the answer as it is written,
// and no stale failure once the turn turns up.

import { expect, test } from "bun:test";
import { noteExplanation } from "#server/explanations/services/notifications.ts";
import type { Entry, Notification } from "#server/explanations/services/contract.ts";

/**
 * An action whose message has left the queue, and which waits for its turn.
 * @returns The action.
 */
function waiting(): Entry {
	return {
		clientId: "client",
		action: { status: "failed", text: "", error: "Codex has not started", retryable: false },
	} as unknown as Entry;
}

/**
 * A provider event.
 * @param method What it reports.
 * @param params What it carries.
 * @returns The event.
 */
function event(method: string, params: Record<string, unknown>): Notification {
	return {
		method,
		params: { threadId: "thread", turnId: "turn", ...params },
	} as unknown as Notification;
}

const USER = { type: "userMessage", id: "user", clientId: "client", content: [] };

test("a turn that turns up late clears the failure and wakes its delivery", () => {
	const entry = waiting();
	let woken = false;
	entry.turnNamed = () => {
		woken = true;
	};
	noteExplanation(entry, event("item/started", { item: USER }));
	noteExplanation(entry, event("turn/started", { turn: { id: "turn", items: [] } }));
	expect(entry.action).toMatchObject({ status: "running" });
	expect(entry.action.error).toBeUndefined();
	expect(woken).toBe(true);
});

test("the panel follows each step, and the answer grows as Codex writes it", () => {
	const entry = waiting();
	noteExplanation(entry, event("item/started", { item: USER }));
	const read = {
		type: "commandExecution",
		id: "c",
		commandActions: [{ type: "read", name: "a.ts" }],
	};
	noteExplanation(entry, event("item/started", { item: read }));
	expect(entry.action.activity).toBe("Reading a.ts");
	const note = {
		type: "agentMessage",
		id: "n",
		phase: "commentary",
		text: "Looking at the seam.\nMore.",
	};
	noteExplanation(entry, event("item/completed", { item: note }));
	expect(entry.action.activity).toBe("Looking at the seam.");
	const answer = { type: "agentMessage", id: "a", phase: "final_answer", text: "" };
	noteExplanation(entry, event("item/started", { item: answer }));
	expect(
		noteExplanation(entry, event("item/agentMessage/delta", { itemId: "n", delta: "no" })),
	).toBe(false);
	noteExplanation(entry, event("item/agentMessage/delta", { itemId: "a", delta: "**Deep" }));
	noteExplanation(entry, event("item/agentMessage/delta", { itemId: "a", delta: " module**" }));
	expect(entry.action.text).toBe("**Deep module**");
});

test("a finished turn keeps its answer and leaves no step or failure behind", () => {
	const entry = waiting();
	noteExplanation(entry, event("item/started", { item: USER }));
	const items = [{ type: "agentMessage", id: "a", phase: "final_answer", text: "Done." }];
	noteExplanation(
		entry,
		event("turn/completed", { turn: { id: "turn", status: "completed", items } }),
	);
	expect(entry.action).toMatchObject({ status: "completed", text: "Done.", retryable: false });
	expect(entry.action.activity).toBeUndefined();
	expect(entry.action.error).toBeUndefined();
});
