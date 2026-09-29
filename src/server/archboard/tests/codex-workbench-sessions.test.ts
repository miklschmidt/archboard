import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { parseTabSessionId, type TabSessionId } from "../../codex-workbench/index.js";
import {
	createCodexWorkbenchSessions,
	type CodexWorkbenchSessionComponents,
} from "../codex-workbench-generation.js";

/** Owners that record which session heard what, in the order they heard it. */
function recordingOwners(label: string, events: string[]): CodexWorkbenchSessionComponents {
	const hear = (owner: string) => ({
		onNotification: () => void events.push(`${label}:${owner}`),
	});
	return {
		coordinator: hear("coordinator"),
		operations: hear("operations"),
		realtime: hear("realtime"),
		spokenApproval: hear("spokenApproval"),
		callbacks: {
			...hear("callbacks"),
			onServerRequest: () => void events.push(`${label}:tell_coordinator`),
		},
		coordinatorTools: {
			onServerRequest: () => void events.push(`${label}:coordinator_tool`),
		},
	} as unknown as CodexWorkbenchSessionComponents;
}

function never(): never {
	throw new Error("Routing never reads, unsubscribes or clears anything.");
}

function tabSession(value: string): TabSessionId {
	const id = parseTabSessionId(value);
	if (id === null) throw new Error(`${value} is not a tab session id.`);
	return id;
}

function twoSessions() {
	const identity = createIdentityAuthorities();
	const events: string[] = [];
	const responses: { readonly owner: string; readonly response: unknown }[] = [];
	const labels = new Map([
		[tabSession("tab-a"), "a"],
		[tabSession("tab-b"), "b"],
	]);
	const sessions = createCodexWorkbenchSessions({
		identity: identity.identity,
		transport: {
			respond: async (_request, owner, response) => void responses.push({ owner, response }),
		},
		session: { threadRead: async () => never(), threadUnsubscribe: async () => never() },
		threadLink: { read: () => never(), clear: () => never() },
		endApprovals: async () => undefined,
		build: ({ id }) => ({
			components: recordingOwners(labels.get(id) ?? "?", events),
			actions: {} as never,
		}),
	});
	const a = sessions.open(tabSession("tab-a"));
	sessions.open(tabSession("tab-b"));
	sessions.claimThread(a, identity.identity.decoder.adoptThreadId("thread-a"));
	return { sessions, events, responses };
}

function notification(threadId: string | null) {
	return {
		correlation: {},
		notification: {
			method: "turn/started",
			params: threadId === null ? {} : { threadId, turn: {} },
		},
	} as never;
}

function toolCall(owner: string, threadId: string) {
	return { method: "item/tool/call", owner, params: { threadId } } as never;
}

test("a notification reaches only the session that started its thread, and every session when none did", () => {
	const { sessions, events } = twoSessions();
	const heard = ["coordinator", "operations", "realtime", "spokenApproval", "callbacks"];

	sessions.onNotification(notification("thread-a"));
	expect(events.splice(0)).toEqual(heard.map((owner) => `a:${owner}`));

	// A coordinator start waits for its own thread's settings before anybody claimed the thread.
	sessions.onNotification(notification("thread-nobody-started"));
	expect(events.splice(0)).toEqual([
		...heard.map((owner) => `a:${owner}`),
		...heard.map((owner) => `b:${owner}`),
	]);

	sessions.onNotification(notification(null));
	expect(events.splice(0)).toHaveLength(heard.length * 2);
});

test("a coordinator's request reaches its thread's session, and one nobody holds is answered", async () => {
	const { sessions, events, responses } = twoSessions();

	sessions.routeCoordinatorTool(toolCall("codex-coordinator-tools", "thread-a"));
	sessions.routeCallback(toolCall("codex-coordinator-callbacks", "thread-a"));
	expect(events).toEqual(["a:coordinator_tool", "a:tell_coordinator"]);
	expect(responses).toEqual([]);

	sessions.routeCoordinatorTool(toolCall("codex-coordinator-tools", "thread-nobody-started"));
	sessions.routeCallback(toolCall("codex-coordinator-callbacks", "thread-nobody-started"));
	await Promise.resolve();
	// A running turn is never left waiting on nobody: its owner's refusal answers it.
	expect(events).toEqual(["a:coordinator_tool", "a:tell_coordinator"]);
	expect(responses.map(({ owner }) => owner)).toEqual([
		"codex-coordinator-tools",
		"codex-coordinator-callbacks",
	]);
	expect(
		responses.every(
			({ response }) => typeof response === "object" && response !== null && "result" in response,
		),
	).toBe(true);
});
