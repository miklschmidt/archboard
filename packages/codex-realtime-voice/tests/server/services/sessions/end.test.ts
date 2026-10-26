import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import {
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSessionScope,
	type CodexWorkbenchWorkhorseScope,
} from "#server/protocol/generation/session-contract.ts";
import { type CodexWorkbenchWorkhorseComponents } from "#server/services/sessions/workhorses.ts";

const TAB = parseTabSessionId("tab-one") as TabSessionId;

/** Let every settled step and read run. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A tab session's owners that record what was asked of them. */
function recordingOwners(events: string[]): CodexWorkbenchSessionComponents {
	const note = (event: string) => () => void events.push(event);
	const hears = { onNotification: () => undefined };
	return {
		coordinator: hears,
		realtime: { ...hears, generation: () => null, dispose: note("realtime:dispose") },
		spokenApproval: { ...hears, dispose: note("spokenApproval:dispose") },
		callbacks: {
			...hears,
			dispose: note("callbacks:dispose"),
			onServerRequest: note("callbacks:request"),
		},
		coordinatorTools: {
			dispose: note("coordinatorTools:dispose"),
			onServerRequest: note("coordinatorTools:request"),
		},
	} as unknown as CodexWorkbenchSessionComponents;
}

/** A workhorse's owners that record what was asked of them. */
function recordingWorkhorse(events: string[]): CodexWorkbenchWorkhorseComponents {
	const note = (event: string) => () => void events.push(event);
	return {
		workhorse: { snapshot: () => ({ threadId: null }) },
		operations: { onNotification: () => undefined, subscribe: () => () => undefined },
		contextDelivery: { dispose: note("delivery:dispose") },
		queue: { shutdown: async () => void events.push("queue:shutdown") },
	} as unknown as CodexWorkbenchWorkhorseComponents;
}

/** A coordinator tool call from one thread. */
function toolCall(raw: string) {
	return {
		method: "item/tool/call",
		owner: "codex-coordinator-tools",
		params: { threadId: raw },
	} as never;
}

/** A store over fakes whose threads run what the test says, and what it did to them. */
function endingStore() {
	const { identity } = createIdentityAuthorities();
	const events: string[] = [];
	const responses: string[] = [];
	const unsubscribed: string[] = [];
	const running = new Set<string>();
	const scopes: CodexWorkbenchTabSessionScope[] = [];
	const workhorseScopes: CodexWorkbenchWorkhorseScope[] = [];
	const wire = (threadId: Parameters<typeof identity.decoder.serializeCodexIdentity>[0]) =>
		identity.decoder.serializeCodexIdentity(threadId);
	const sessions = createCodexWorkbenchSessions({
		resolveCheckout: (named) => named,
		identity,
		transport: { respond: async (_request, owner) => void responses.push(owner) },
		session: {
			threadRead: async ({ threadId }) =>
				({
					thread: { status: { type: running.has(wire(threadId)) ? "active" : "idle" } },
				}) as never,
			threadUnsubscribe: async ({ threadId }) => {
				unsubscribed.push(wire(threadId));
				return { status: "unsubscribed" };
			},
			turnInterrupt: async () => ({}) as never,
		},
		threadLink: {
			read: () => ({ link: { state: "executable" }, cas: { revision: 3 } }) as never,
			clear: () => {
				events.push("link:clear");
				return undefined as never;
			},
		},
		endApprovals: async (id) => void events.push(`approvals:end:${id}`),
		shownConversationOf: () => null,
		build: (scope) => {
			scopes.push(scope);
			return { components: recordingOwners(events), actions: {} as never };
		},
		buildWorkhorse: (scope) => {
			workhorseScopes.push(scope);
			return { components: recordingWorkhorse(events), actions: {} as never };
		},
	});
	/** Start a thread for the tab's coordinator, as its start does. */
	const claim = (raw: string) => {
		const threadId = identity.decoder.adoptThreadId(raw);
		sessions.open(TAB);
		scopes.at(-1)!.claimThread(threadId);
		return threadId;
	};
	/** Start a thread for the workhorse of one checkout of the tab, as its start does. */
	const claimWorkhorse = (raw: string, checkout = "/work/payments") => {
		const threadId = identity.decoder.adoptThreadId(raw);
		const { key } = sessions.open(TAB).workhorse(checkout);
		workhorseScopes.findLast((scope) => scope.key === key)!.claimThread(threadId);
		return threadId;
	};
	/** Say a thread's turn finished, as Codex does. */
	const idle = (raw: string) => {
		running.delete(raw);
		sessions.onNotification({
			correlation: { child: identity.validator.childId, epoch: identity.validator.epoch },
			notification: {
				method: "thread/status/changed",
				params: { threadId: raw, status: { type: "idle" } },
			},
		} as never);
	};
	return {
		sessions,
		events,
		responses,
		unsubscribed,
		running,
		workhorseScopes,
		claim,
		claimWorkhorse,
		idle,
	};
}

test("a tab session's end settles its approvals, stops its news and link, and unloads each thread once its turn completed", async () => {
	const store = endingStore();
	const first = store.sessions.open(TAB);
	const workhorse = store.claimWorkhorse("thread-workhorse");
	store.claim("thread-coordinator");
	store.running.add("thread-workhorse");

	let ended = false;
	const ending = store.sessions.end(TAB).then(() => {
		ended = true;
		return undefined;
	});
	await flush();

	expect(store.events).toEqual([
		"link:clear",
		`approvals:end:${TAB}`,
		"spokenApproval:dispose",
		"delivery:dispose",
		"callbacks:dispose",
		"queue:shutdown",
	]);
	// An approval its threads raise now is shown to nobody, so it is cancelled on receipt.
	expect(store.sessions.forThread(workhorse)).toBeNull();
	// The idle coordinator thread unloads at once; the workhorse waits for its running turn.
	expect(store.unsubscribed).toEqual(["thread-coordinator"]);
	// That turn's coordinator tool calls are still answered by the session's own tools.
	store.sessions.routeCoordinatorTool(toolCall("thread-workhorse"));
	expect(store.events.at(-1)).toBe("coordinatorTools:request");
	expect(ended).toBeFalse();

	// A tab that comes back under the same id meanwhile starts a fresh session.
	expect(store.sessions.open(TAB)).not.toBe(first);

	store.idle("thread-workhorse");
	await ending;
	expect(store.unsubscribed).toEqual(["thread-coordinator", "thread-workhorse"]);
	expect(store.events.slice(-2)).toEqual(["realtime:dispose", "coordinatorTools:dispose"]);

	// The ended session is dropped: a late call from its thread gets the owner's refusal.
	store.sessions.routeCoordinatorTool(toolCall("thread-workhorse"));
	await flush();
	expect(store.responses).toEqual(["codex-coordinator-tools"]);
});

test("a thread a new conversation left is unloaded once its turn completed, and only then stops being the session's", async () => {
	const store = endingStore();
	const session = store.sessions.open(TAB);
	const left = store.claimWorkhorse("thread-left");
	store.running.add("thread-left");

	const retired = store.workhorseScopes[0]!.retireThread(left);
	await flush();
	expect(store.unsubscribed).toEqual([]);
	expect(store.sessions.forThread(left)).toBe(session);

	store.idle("thread-left");
	expect(await retired).toEqual({ threadId: left, outcome: "unsubscribed" });
	expect(store.unsubscribed).toEqual(["thread-left"]);
	expect(store.sessions.forThread(left)).toBeNull();
	// The session itself goes on.
	expect(store.sessions.list()).toEqual([session]);
});
