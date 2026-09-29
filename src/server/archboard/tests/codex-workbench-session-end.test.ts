import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { parseTabSessionId, type TabSessionId } from "../../codex-workbench/index.js";
import {
	createCodexWorkbenchSessions,
	type CodexWorkbenchSessionComponents,
	type CodexWorkbenchTabSessionScope,
} from "../codex-workbench-generation.js";

const TAB = parseTabSessionId("tab-one") as TabSessionId;

/** Let every settled step and read run. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Owners that record what was asked of them. */
function recordingOwners(events: string[]): CodexWorkbenchSessionComponents {
	const note = (event: string) => () => void events.push(event);
	const hears = { onNotification: () => undefined };
	return {
		coordinator: hears,
		operations: hears,
		realtime: { ...hears, generation: () => null, dispose: note("realtime:dispose") },
		spokenApproval: { ...hears, dispose: note("spokenApproval:dispose") },
		semanticDelivery: { dispose: note("delivery:dispose") },
		callbacks: {
			...hears,
			dispose: note("callbacks:dispose"),
			onServerRequest: note("callbacks:request"),
		},
		semanticPublisher: { dispose: note("publisher:dispose") },
		queue: { shutdown: async () => void events.push("queue:shutdown") },
		coordinatorTools: {
			dispose: note("coordinatorTools:dispose"),
			onServerRequest: note("coordinatorTools:request"),
		},
	} as unknown as CodexWorkbenchSessionComponents;
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
	const wire = (threadId: Parameters<typeof identity.decoder.serializeCodexIdentity>[0]) =>
		identity.decoder.serializeCodexIdentity(threadId);
	const sessions = createCodexWorkbenchSessions({
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
		},
		threadLink: {
			read: () => ({ link: { state: "executable" }, cas: { revision: 3 } }) as never,
			clear: () => {
				events.push("link:clear");
				return undefined as never;
			},
		},
		endApprovals: async (id) => void events.push(`approvals:end:${id}`),
		build: (scope) => {
			scopes.push(scope);
			return { components: recordingOwners(events), actions: {} as never };
		},
	});
	const claim = (raw: string) => {
		const threadId = identity.decoder.adoptThreadId(raw);
		sessions.claimThread(sessions.open(TAB), threadId);
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
	return { sessions, events, responses, unsubscribed, running, scopes, claim, idle };
}

test("a tab session's end settles its approvals, stops its news and link, and unloads each thread once its turn completed", async () => {
	const store = endingStore();
	const first = store.sessions.open(TAB);
	const workhorse = store.claim("thread-workhorse");
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
		"publisher:dispose",
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
	const left = store.claim("thread-left");
	store.running.add("thread-left");

	const retired = store.scopes[0]!.retireThread(left);
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
