// The tab sessions of one Codex child generation (TASK-373).
//
// A tab session owns the workhorse, the coordinator, voice, board-change delivery, the queue and
// the coordinator's tools and callbacks of one conversation. The generation owns what describes
// the child and what every conversation shares: the transport, the protocol session, the thread
// link port, the approval broker, the app's dynamic tools, the account and the gateway.
//
// Codex speaks to the generation, so this store is where a notification or a server request finds
// its conversation: by the thread it names. A thread belongs to the session that started it. A
// notification for a thread nobody claimed yet goes to every session, because a coordinator start
// waits for its own thread's settings before it knows the thread. A request from a thread nobody
// holds is refused by its owner's own answer, so a running turn never waits on nobody.

import type { CoordinatorCallbacks } from "@/runtime/codex-coordinator-callbacks";
import { answerUnownedTellCoordinator } from "@/runtime/codex-coordinator-callbacks";
import {
	COORDINATOR_TOOLS_OWNER,
	refusedResponse,
	type CoordinatorToolDispatcher,
} from "@/runtime/codex-coordinator-tools";
import type { CodexCoordinator } from "@/runtime/codex-coordinator";
import type { CodexRealtimeAdapter } from "@/runtime/codex-realtime";
import type { SemanticContextPublisher } from "@/runtime/codex-semantic-context";
import type { CodexSpokenApprovalGate } from "@/runtime/codex-spoken-approval";
import type { CodexThreadContextController } from "@/runtime/codex-thread-context";
import type { CodexTransport, TransportServerNotification } from "@/runtime/codex-transport";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { CodexWorkhorseOperations } from "@/runtime/codex-workhorse-operations";
import type { CodexWorkhorseQueue } from "@/runtime/codex-workhorse-queue";
import type { CodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	LogicalToolCallCorrelation,
	OperationId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import {
	parseTabSessionId,
	type BrowserRealtimeActions,
	type BrowserThreadLinkActions,
	type CodexQueueProjectionInput,
	type TabSessionId,
} from "@/server/codex-workbench";
import { appendFailure } from "@/server/archboard/lib/codex-workbench-failures";

/** The runtime owners one conversation runs on. */
interface CodexWorkbenchSessionComponents {
	readonly workhorse: CodexWorkhorseStart;
	readonly semanticPublisher: SemanticContextPublisher;
	readonly realtime: CodexRealtimeAdapter;
	readonly semanticDelivery: CodexThreadContextController;
	readonly coordinator: CodexCoordinator;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly operations: CodexWorkhorseOperations;
	readonly spokenApproval: CodexSpokenApprovalGate;
	readonly coordinatorTools: CoordinatorToolDispatcher;
	readonly callbacks: CoordinatorCallbacks;
}

/** What a browser asks of one conversation: to start it, and to talk to it. */
interface CodexWorkbenchTabSessionActions {
	readonly threadLinks: BrowserThreadLinkActions;
	readonly realtime: BrowserRealtimeActions;
}

/** What the server remembers about one conversation between the reads that fill it in. */
interface CodexWorkbenchTabSessionState {
	/** The last authoritative queue listing. */
	queue: CodexQueueProjectionInput;
	/** The workhorse thread that listing was read for. */
	queueThreadId: ThreadId | null;
	/** The coordinator tool call running now, which every owner that asks sees the same. */
	currentCoordinatorCall: LogicalToolCallCorrelation | null;
	/** Every thread this conversation started, current and replaced. */
	readonly threads: Set<ThreadId>;
}

/** One conversation of the generation. */
interface CodexWorkbenchTabSession {
	readonly id: TabSessionId;
	readonly components: CodexWorkbenchSessionComponents;
	readonly actions: CodexWorkbenchTabSessionActions;
	readonly state: CodexWorkbenchTabSessionState;
}

/** What building one tab session is handed. */
interface CodexWorkbenchTabSessionScope {
	readonly id: TabSessionId;
	readonly state: CodexWorkbenchTabSessionState;
	/** Record that this conversation started a thread, so what Codex says about it finds it. */
	readonly claimThread: (threadId: ThreadId) => void;
}

/** A tab session's owners and actions, as its builder made them. */
interface BuiltTabSession {
	readonly components: CodexWorkbenchSessionComponents;
	readonly actions: CodexWorkbenchTabSessionActions;
}

interface CreateCodexWorkbenchSessionsOptions {
	/** Writes a thread identity as Codex spells it, which is what Codex names threads by. */
	readonly identity: Pick<IdentityAuthority, "decoder">;
	/** Where a refused request is answered. */
	readonly transport: Pick<CodexTransport, "respond">;
	/** Build one session's owners and actions. */
	readonly build: (scope: CodexWorkbenchTabSessionScope) => BuiltTabSession;
}

interface CodexWorkbenchSessions {
	/** The live session with this id, built the first time it is asked for. */
	readonly open: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** The live session with this id, refused when there is none. */
	readonly require: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** Every live session, in the order they opened. */
	readonly list: () => readonly CodexWorkbenchTabSession[];
	/** The session that started this thread, or null when none did. */
	readonly forThread: (threadId: ThreadId) => CodexWorkbenchTabSession | null;
	readonly claimThread: (session: CodexWorkbenchTabSession, threadId: ThreadId) => void;
	/** Hand one notification to the session its thread belongs to, or to every session. */
	readonly onNotification: (event: TransportServerNotification) => void;
	/** Hand a coordinator tool call to the calling thread's session, or refuse it. */
	readonly routeCoordinatorTool: (request: DynamicServerRequest) => void;
	/** Hand a workhorse's tell_coordinator call to the calling thread's session, or refuse it. */
	readonly routeCallback: (request: DynamicServerRequest) => void;
	/** Settle what every session carried for a child that exited. */
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	/** Stop what every session runs: voice, board news, the queue. */
	readonly stop: () => Promise<void>;
	/** Dispose every session's remaining owners and forget every session. */
	readonly dispose: () => Promise<void>;
	/** Hear when a session opens. */
	readonly onChange: (listener: () => void) => () => void;
}

/**
 * The id of the one session every tab shares until each tab holds its own conversation (TASK-373
 * S5b keys the sessions by the tab's own id).
 */
const SHARED_TAB_SESSION_ID: TabSessionId = sharedTabSessionId();

/**
 * The shared session's id, which the server's own spelling must pass as a tab session id.
 * @returns The id.
 */
function sharedTabSessionId(): TabSessionId {
	const id = parseTabSessionId("server");
	if (id === null) {
		throw new TypeError("The shared tab session id is not a tab session id.");
	}
	return id;
}

/**
 * A session's state before anything was read into it.
 * @returns The state.
 */
function freshState(): CodexWorkbenchTabSessionState {
	return {
		queue: { kind: "codex_queue", submissions: null },
		queueThreadId: null,
		currentCoordinatorCall: null,
		threads: new Set(),
	};
}

/**
 * The thread a notification names, as Codex spells it.
 * @param event The notification.
 * @returns The thread, or null when it names none.
 */
function notificationThread(event: TransportServerNotification): string | null {
	const params: unknown = event.notification.params;
	if (typeof params !== "object" || params === null || !("threadId" in params)) {
		return null;
	}
	return typeof params.threadId === "string" ? params.threadId : null;
}

/**
 * Run every step, each whatever the others did, and report every failure together.
 * @param steps The steps, in order.
 * @param message What a failure was part of.
 */
async function settleEach(steps: readonly (() => unknown)[], message: string): Promise<void> {
	let failure: Error | null = null;
	for (const step of steps) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- each step settles fully before the next, in the order the owners depend on
			await step();
		} catch (error) {
			failure = appendFailure(failure, error, message);
		}
	}
	if (failure !== null) {
		throw failure;
	}
}

/**
 * Stop a session's voice, if it is carrying any.
 * @param realtime The session's realtime adapter.
 */
async function stopVoice(realtime: CodexRealtimeAdapter): Promise<void> {
	const generation = realtime.generation();
	if (generation === null) {
		return;
	}
	await realtime.stop({
		sessionId: generation.browserSessionId,
		correlationId: generation.browserCorrelationId,
	});
}

/**
 * Hand one notification to one session's owners, in the order they depend on each other.
 * @param session The session.
 * @param event The notification.
 */
function deliver(session: CodexWorkbenchTabSession, event: TransportServerNotification): void {
	const { coordinator, operations, realtime, spokenApproval, callbacks } = session.components;
	coordinator.onNotification(event);
	operations.onNotification(event);
	realtime.onNotification(event);
	spokenApproval.onNotification(event);
	// After the operations owner, which settles the coordinator's own delegations first.
	callbacks.onNotification(event);
}

/**
 * The tab sessions of one generation, and how Codex finds them.
 * @param options How a session is built, how a thread is named, and where refusals go.
 * @returns The store.
 */
function createCodexWorkbenchSessions(
	options: CreateCodexWorkbenchSessionsOptions,
): CodexWorkbenchSessions {
	const live = new Map<TabSessionId, CodexWorkbenchTabSession>();
	const byThread = new Map<string, CodexWorkbenchTabSession>();
	const listeners = new Set<() => void>();
	let disposed = false;

	/** Tell every listener the sessions changed. */
	const publish = (): void => {
		for (const listener of listeners) listener();
	};
	/**
	 * Record that a session started a thread.
	 * @param session The session.
	 * @param threadId The thread.
	 */
	const claimThread = (session: CodexWorkbenchTabSession, threadId: ThreadId): void => {
		session.state.threads.add(threadId);
		byThread.set(options.identity.decoder.serializeCodexIdentity(threadId), session);
	};
	/**
	 * The session a thread belongs to, by the spelling Codex uses.
	 * @param wireThreadId The thread as Codex names it, or null.
	 * @returns The session, or null.
	 */
	const owning = (wireThreadId: string | null): CodexWorkbenchTabSession | null =>
		wireThreadId === null ? null : (byThread.get(wireThreadId) ?? null);
	/**
	 * Build a session.
	 * @param id Its id.
	 * @returns The session.
	 */
	const build = (id: TabSessionId): CodexWorkbenchTabSession => {
		const state = freshState();
		const built = options.build({
			id,
			state,
			/**
			 * Claim a thread for this session once it is live.
			 * @param threadId The thread.
			 */
			claimThread: (threadId) => {
				const session = live.get(id);
				if (session === undefined) {
					throw new Error(`The tab session ${id} is not live, so it can start no thread.`);
				}
				claimThread(session, threadId);
			},
		});
		return Object.freeze({ id, components: built.components, actions: built.actions, state });
	};

	return Object.freeze({
		/**
		 * The live session with this id, built the first time it is asked for.
		 * @param id The session.
		 * @returns The session.
		 */
		open: (id) => {
			const existing = live.get(id);
			if (existing !== undefined) {
				return existing;
			}
			if (disposed) {
				throw new Error("The Codex generation's tab sessions are disposed.");
			}
			const session = build(id);
			live.set(id, session);
			publish();
			return session;
		},
		/**
		 * The live session with this id.
		 * @param id The session.
		 * @returns The session.
		 * @throws {Error} When no session with this id is live.
		 */
		require: (id) => {
			const session = live.get(id);
			if (session === undefined) {
				throw new Error(`No tab session ${id} is live on this Codex generation.`);
			}
			return session;
		},
		/**
		 * Every live session, in the order they opened.
		 * @returns The sessions.
		 */
		list: () => [...live.values()],
		/**
		 * The session that started a thread.
		 * @param threadId The thread.
		 * @returns The session, or null when none did.
		 */
		forThread: (threadId) => owning(options.identity.decoder.serializeCodexIdentity(threadId)),
		claimThread,
		/**
		 * Hand one notification to the session its thread belongs to, or to every
		 * session when no session started that thread or it names none.
		 * @param event The notification.
		 */
		onNotification: (event) => {
			const owner = owning(notificationThread(event));
			for (const session of owner === null ? [...live.values()] : [owner]) {
				deliver(session, event);
			}
		},
		/**
		 * Hand a coordinator tool call to the session that started the calling
		 * thread, and refuse it through the coordinator tools' own answer otherwise.
		 * @param request The call.
		 */
		routeCoordinatorTool: (request) => {
			const owner = owning(request.params.threadId);
			if (owner !== null) {
				owner.components.coordinatorTools.onServerRequest(request);
				return;
			}
			void options.transport
				.respond(request, COORDINATOR_TOOLS_OWNER, {
					result: refusedResponse(
						"invalid_call",
						"No conversation on this Archboard server started the calling thread.",
						true,
					),
				})
				.catch(() => undefined);
		},
		/**
		 * Hand a workhorse's tell_coordinator call to the session that started the
		 * calling thread, and answer it through the callbacks' own answer otherwise.
		 * @param request The call.
		 */
		routeCallback: (request) => {
			const owner = owning(request.params.threadId);
			if (owner !== null) {
				owner.components.callbacks.onServerRequest(request);
				return;
			}
			void answerUnownedTellCoordinator(options.transport, request).catch(() => undefined);
		},
		/**
		 * Settle what every session carried for a child that exited: its board
		 * news, its spoken approval, its coordinator's tool calls.
		 * @param child The child.
		 * @param epoch Its epoch.
		 * @returns Resolves once every session has settled.
		 */
		childExit: (child, epoch) =>
			settleEach(
				[...live.values()].flatMap(({ components }) => [
					() => components.semanticDelivery.childExit(child, epoch),
					() => components.spokenApproval.onChildExit({ child, epoch }),
					() => components.coordinatorTools.onChildExit({ child, epoch }),
				]),
				"Codex child-exit cleanup failed.",
			),
		/**
		 * Stop what every session runs: its voice, its realtime adapter, its board
		 * news and its queue.
		 * @returns Resolves once every session has stopped.
		 */
		stop: () =>
			settleEach(
				[...live.values()].flatMap(({ components }) => [
					() => stopVoice(components.realtime),
					() => components.realtime.dispose(),
					() => components.semanticPublisher.dispose(),
					() => components.queue.shutdown(),
				]),
				"Codex workbench shutdown failed.",
			),
		/**
		 * Dispose every session's callbacks, spoken approval gate, semantic delivery
		 * and coordinator tools, and forget every session.
		 */
		dispose: async () => {
			disposed = true;
			const sessions = [...live.values()];
			live.clear();
			byThread.clear();
			try {
				await settleEach(
					sessions.flatMap(({ components }) => [
						() => components.callbacks.dispose(),
						() => components.spokenApproval.dispose(),
						() => components.semanticDelivery.dispose(),
						() => components.coordinatorTools.dispose(),
					]),
					"Codex workbench shutdown failed.",
				);
			} finally {
				listeners.clear();
			}
		},
		/**
		 * Hear when a session opens.
		 * @param listener What to tell.
		 * @returns How to stop listening.
		 */
		onChange: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	} satisfies CodexWorkbenchSessions);
}

export { createCodexWorkbenchSessions, SHARED_TAB_SESSION_ID };
export type {
	BuiltTabSession,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchSessions,
	CodexWorkbenchTabSession,
	CodexWorkbenchTabSessionActions,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchTabSessionState,
	CreateCodexWorkbenchSessionsOptions,
};
