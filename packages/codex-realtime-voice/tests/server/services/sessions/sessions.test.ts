import { expect, test } from "bun:test";

import { createIdentityAuthorities, type ThreadId } from "@archboard/codex-app-server/identity";
import {
	parseTabSessionId,
	workhorseLinkKey,
	type TabSessionId,
} from "#server/rules/tab-session/tab-session.ts";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import {
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSessionScope,
	type CodexWorkbenchWorkhorseScope,
} from "#server/protocol/generation/session-contract.ts";
import { type CodexWorkbenchWorkhorseComponents } from "#server/services/sessions/workhorses.ts";

/** Owners of a tab session that record which session heard what, in the order they heard it. */
function recordingOwners(label: string, events: string[]): CodexWorkbenchSessionComponents {
	const hear = (owner: string) => ({
		onNotification: () => void events.push(`${label}:${owner}`),
	});
	return {
		coordinator: hear("coordinator"),
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

/**
 * Owners of one workhorse whose thread is what the test says.
 * @param label Which session and checkout it is, as events name it.
 * @param events Where it records what it heard.
 * @param thread Its thread, as it reports it now.
 * @returns The owners.
 */
function recordingWorkhorse(
	label: string,
	events: string[],
	thread: { current: ThreadId | null },
	operationListeners: Set<(event: unknown) => void>,
): CodexWorkbenchWorkhorseComponents {
	return {
		workhorse: { snapshot: () => ({ threadId: thread.current }) },
		operations: {
			onNotification: () => void events.push(`${label}:operations`),
			subscribe: (listener: (event: unknown) => void) => {
				operationListeners.add(listener);
				return () => void operationListeners.delete(listener);
			},
		},
	} as unknown as CodexWorkbenchWorkhorseComponents;
}

function never(): never {
	throw new Error("Routing never reads, unsubscribes or clears anything.");
}

function tabSession(value: string): TabSessionId {
	const id = parseTabSessionId(value);
	if (id === null) throw new Error(`${value} is not a tab session id.`);
	return id;
}

const PAYMENTS = "/work/payments";
const SHOP = "/work/shop";

/** A store of two tab sessions, whose scopes and workhorse threads the test can reach. */
function twoSessions() {
	const identity = createIdentityAuthorities();
	const { decoder } = identity.identity;
	const events: string[] = [];
	const responses: { readonly owner: string; readonly response: unknown }[] = [];
	const interrupts: unknown[] = [];
	const cleared: string[] = [];
	const labels = new Map([
		[tabSession("tab-a"), "a"],
		[tabSession("tab-b"), "b"],
	]);
	const tabScopes = new Map<string, CodexWorkbenchTabSessionScope>();
	const workhorseScopes = new Map<string, CodexWorkbenchWorkhorseScope>();
	const threads = new Map<string, { current: ThreadId | null }>();
	const operationListeners = new Map<string, Set<(event: unknown) => void>>();
	const shown = { current: null as string | null };
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity: identity.identity,
		transport: {
			respond: async (_request, owner, response) => void responses.push({ owner, response }),
		},
		session: {
			threadRead: async () => never(),
			threadUnsubscribe: async () => never(),
			turnInterrupt: async (params) => {
				interrupts.push(params);
				return {} as never;
			},
		},
		threadLink: {
			read: () => never(),
			clear: (key) => {
				cleared.push(key);
				return never();
			},
		},
		endApprovals: async () => undefined,
		shownConversationOf: () => shown.current,
		build: (scope) => {
			tabScopes.set(scope.id, scope);
			return {
				components: recordingOwners(labels.get(scope.id) ?? "?", events),
				actions: {} as never,
			};
		},
		buildWorkhorse: (scope) => {
			workhorseScopes.set(scope.key, scope);
			const thread = { current: null };
			threads.set(scope.key, thread);
			const label = `${labels.get(scope.session.id) ?? "?"}${scope.checkout}`;
			const listeners = new Set<(event: unknown) => void>();
			operationListeners.set(scope.key, listeners);
			const components = recordingWorkhorse(label, events, thread, listeners);
			return { components, actions: {} as never };
		},
	});
	/**
	 * Start a thread for a workhorse, as its start does.
	 * @param key The workhorse's link key.
	 * @param raw The thread as Codex names it.
	 * @returns The thread.
	 */
	const startWorkhorseThread = (key: string, raw: string): ThreadId => {
		const threadId = decoder.adoptThreadId(raw);
		workhorseScopes.get(key)!.claimThread(threadId);
		threads.get(key)!.current = threadId;
		return threadId;
	};
	const a = sessions.open(tabSession("tab-a"));
	const b = sessions.open(tabSession("tab-b"));
	tabScopes.get(a.id)!.claimThread(decoder.adoptThreadId("thread-a"));
	return {
		sessions,
		a,
		b,
		events,
		responses,
		interrupts,
		cleared,
		decoder,
		startWorkhorseThread,
		shown,
		/**
		 * Tell a workhorse's listeners what one of its operations reported.
		 * @param key The workhorse's link key.
		 * @param event The report.
		 */
		reportOperation: (key: string, event: unknown) => {
			for (const listener of operationListeners.get(key) ?? []) listener(event);
		},
	};
}

function notification(threadId: string | null, method = "turn/started", turn = "turn-1") {
	return {
		correlation: {},
		notification: {
			method,
			params: threadId === null ? {} : { threadId, turn: { id: turn } },
		},
	} as never;
}

function toolCall(owner: string, threadId: string) {
	return { method: "item/tool/call", owner, params: { threadId } } as never;
}

test("a notification reaches only the session that started its thread, and every session when none did", () => {
	const { sessions, a, b, events } = twoSessions();
	a.workhorse(PAYMENTS);
	b.workhorse(PAYMENTS);
	const heard = (label: string) => [
		`${label}:coordinator`,
		`${label}${PAYMENTS}:operations`,
		`${label}:realtime`,
		`${label}:spokenApproval`,
		`${label}:callbacks`,
	];

	sessions.onNotification(notification("thread-a"));
	expect(events.splice(0)).toEqual(heard("a"));

	// A coordinator start waits for its own thread's settings before anybody claimed the thread.
	sessions.onNotification(notification("thread-nobody-started"));
	expect(events.splice(0)).toEqual([...heard("a"), ...heard("b")]);

	sessions.onNotification(notification(null));
	expect(events.splice(0)).toHaveLength(heard("a").length * 2);
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

test("a tab session holds one workhorse per checkout, each under its own link and with its own state", () => {
	const { sessions, a, b, decoder, startWorkhorseThread } = twoSessions();

	const payments = a.workhorse(PAYMENTS);
	const shop = a.workhorse(SHOP);
	expect(a.workhorse(PAYMENTS)).toBe(payments);
	expect([...a.workhorses.keys()]).toEqual([PAYMENTS, SHOP]);
	expect(payments.key).toBe(workhorseLinkKey(a.id, PAYMENTS));
	expect(shop.key).toBe(workhorseLinkKey(a.id, SHOP));
	// The same checkout in another tab is another workhorse, under another link.
	expect(b.workhorse(PAYMENTS).key).not.toBe(payments.key);
	expect(shop.state).not.toBe(payments.state);

	// What Codex says about a workhorse's thread finds that workhorse, and a coordinator's none.
	const thread = startWorkhorseThread(payments.key, "thread-payments");
	expect(sessions.workhorseForThread(thread)).toBe(payments);
	expect(sessions.forThread(thread)).toBe(a);
	const coordinatorThread = decoder.adoptThreadId("thread-a");
	expect(sessions.forThread(coordinatorThread)).toBe(a);
	expect(sessions.workhorseForThread(coordinatorThread)).toBeNull();
});

test("a stop for one checkout interrupts only its workhorse's turn, and a stop for the tab every running one", async () => {
	const { sessions, a, interrupts, decoder, startWorkhorseThread } = twoSessions();
	const payments = a.workhorse(PAYMENTS);
	const shop = a.workhorse(SHOP);
	a.workhorse("/work/idle");
	const paymentsThread = startWorkhorseThread(payments.key, "thread-payments");
	const shopThread = startWorkhorseThread(shop.key, "thread-shop");
	sessions.onNotification(notification("thread-payments", "turn/started", "turn-p"));
	sessions.onNotification(notification("thread-shop", "turn/started", "turn-s"));

	expect(await a.stopWork(PAYMENTS)).toEqual([{ checkout: PAYMENTS, outcome: "interrupted" }]);
	expect(interrupts).toEqual([{ threadId: paymentsThread, turnId: decoder.adoptTurnId("turn-p") }]);

	// Codex says the interrupted turn ended, so only the other checkout's turn is still running.
	sessions.onNotification(notification("thread-payments", "turn/completed", "turn-p"));
	interrupts.length = 0;
	expect(await a.stopWork(null)).toEqual([
		{ checkout: PAYMENTS, outcome: "idle" },
		{ checkout: SHOP, outcome: "interrupted" },
		{ checkout: "/work/idle", outcome: "idle" },
	]);
	expect(interrupts).toEqual([{ threadId: shopThread, turnId: decoder.adoptTurnId("turn-s") }]);
});

test("a turn that ends after New conversation left its thread leaves its workhorse with nothing to stop", async () => {
	const { sessions, a, interrupts, startWorkhorseThread } = twoSessions();
	const payments = a.workhorse(PAYMENTS);
	startWorkhorseThread(payments.key, "thread-old");
	sessions.onNotification(notification("thread-old", "turn/started", "turn-old"));

	// New conversation moves the workhorse to a fresh thread while the old turn still runs.
	startWorkhorseThread(payments.key, "thread-new");
	sessions.onNotification(notification("thread-old", "turn/completed", "turn-old"));

	expect(await a.stopWork(PAYMENTS)).toEqual([{ checkout: PAYMENTS, outcome: "idle" }]);
	expect(interrupts).toEqual([]);
});

test("a workhorse stays linked when its tab's chats move to another checkout of its repository", () => {
	const { sessions, a, cleared, startWorkhorseThread } = twoSessions();
	const before = a.workhorse(PAYMENTS);
	const thread = startWorkhorseThread(before.key, "thread-payments");

	// A new chosen checkout moves the chats; they show that checkout's workhorse from then on.
	const after = a.workhorse("/work/payments-feature");
	expect(after).not.toBe(before);
	expect(a.workhorse(PAYMENTS)).toBe(before);
	expect(sessions.workhorseForThread(thread)).toBe(before);
	expect(cleared).toEqual([]);
});

test("a coordinator turn is remembered with the conversation shown as it started, and each workhorse it gave work to", () => {
	const { sessions, a, decoder, shown, startWorkhorseThread, reportOperation } = twoSessions();
	const payments = a.workhorse(PAYMENTS);
	startWorkhorseThread(payments.key, "thread-payments");
	const voiceTurn = decoder.adoptTurnId("voice-turn");

	shown.current = SHOP;
	sessions.onNotification(notification("thread-a", "turn/started", "voice-turn"));
	// A workhorse's own turn is no coordinator turn.
	sessions.onNotification(notification("thread-payments", "turn/started", "work-turn"));
	reportOperation(payments.key, {
		operation: "delegate_to_workhorse",
		queueOperation: null,
		outcome: "delivered",
		correlation: { coordinatorTurnId: voiceTurn },
	});

	expect([...a.state.coordinatorTurnHomes]).toEqual([
		[voiceTurn, { shownAtStart: SHOP, gaveWorkTo: new Set([PAYMENTS]) }],
	]);
});
