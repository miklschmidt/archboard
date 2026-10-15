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
//
// A session ends when its tab has gone for good (no pane of it came back within the grace): its
// approvals are cancelled, its voice, board news and queue stop, its link is cleared, and each of
// its threads is unsubscribed once nothing runs on it, so Codex unloads it. Until then its
// coordinator's tools and its operations stay, so a turn still running is answered. A tab that
// comes back under the same id meanwhile gets a fresh session. A child exit or a server shutdown
// drops every session without unsubscribing anything, because the child is gone.

import type { CoordinatorCallbacks } from "@/runtime/codex-coordinator-callbacks";
import { answerUnownedTellCoordinator } from "@/runtime/codex-coordinator-callbacks";
import {
	COORDINATOR_TOOLS_OWNER,
	refusedResponse,
	type CoordinatorToolDispatcher,
} from "@/runtime/codex-coordinator-tools";
import type { CodexCoordinator } from "@/runtime/codex-coordinator";
import type { CodexRealtimeAdapter } from "@/runtime/codex-realtime";
import type { CodexSession } from "@/runtime/codex-session";
import type { SemanticContextPublisher } from "@/runtime/codex-semantic-context";
import type { CodexSpokenApprovalGate } from "@/runtime/codex-spoken-approval";
import type { CodexThreadContextController } from "@/runtime/codex-thread-context";
import { createCodexThreadUnload, type ThreadUnload } from "@/runtime/codex-thread-unload";
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
	TurnId,
} from "@/shared/codex-workbench-identity";
import {
	type BrowserRealtimeActions,
	type BrowserThreadLinkActions,
	type CodexQueueProjectionInput,
	type TabSessionId,
} from "@/server/codex-workbench";
import {
	endTabSession,
	settleEach,
	stopVoice,
	type TabSessionEnding,
} from "@/server/archboard/lib/codex-workbench-session-end";
import {
	sessionVoiceStartTrace,
	type SessionVoiceStartTrace,
} from "@/server/archboard/lib/voice-start-trace";

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
	/** Which coordinator turn delegated each workhorse turn, newest last; bounded. */
	readonly delegations: Map<TurnId, TurnId>;
	/** The coordinator tool call running now, which every owner that asks sees the same. */
	currentCoordinatorCall: LogicalToolCallCorrelation | null;
	/** Every thread this conversation started, current and replaced. */
	readonly threads: Set<ThreadId>;
	/** The attempt this conversation's latest voice start began, which its voice notes into. */
	readonly voiceTrace: SessionVoiceStartTrace;
	/**
	 * The pane work nobody's command started presented through last, and the vault it was in. While
	 * none of the tab's panes is open, its context is filed under that pane id, and the changes the
	 * session hears are those of that vault; null before any pane was open.
	 */
	presenting: { readonly paneId: string; readonly vault: string } | null;
	/** Live while its tab may still use it; ending once the tab has gone, until its threads unload. */
	phase: "live" | "ending";
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
	/**
	 * Give up a thread this conversation no longer runs on: it is unsubscribed once nothing runs
	 * on it, so Codex unloads it, and only then stops being this conversation's.
	 */
	readonly retireThread: (threadId: ThreadId) => Promise<ThreadUnload>;
	/** Stop owning a thread something else already unloaded, such as a replaced coordinator's. */
	readonly releaseThread: (threadId: ThreadId) => void;
}

/** A tab session's owners and actions, as its builder made them. */
interface BuiltTabSession {
	readonly components: CodexWorkbenchSessionComponents;
	readonly actions: CodexWorkbenchTabSessionActions;
}

interface CreateCodexWorkbenchSessionsOptions {
	/** Names threads as Codex spells them, and says which child and epoch are current. */
	readonly identity: Pick<IdentityAuthority, "decoder" | "validator">;
	/** Where a refused request is answered. */
	readonly transport: Pick<CodexTransport, "respond">;
	/** What reads a thread's status and unsubscribes it once it is idle. */
	readonly session: Pick<CodexSession, "threadRead" | "threadUnsubscribe">;
	/** Where a session's link is cleared when the session ends. */
	readonly threadLink: TabSessionEnding["threadLink"];
	/** Settle every approval an ended session was still to answer. */
	readonly endApprovals: TabSessionEnding["endApprovals"];
	/** Build one session's owners and actions. */
	readonly build: (scope: CodexWorkbenchTabSessionScope) => BuiltTabSession;
}

interface CodexWorkbenchSessions {
	/** The live session with this id, built the first time it is asked for or after it ended. */
	readonly open: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** The live session with this id, refused when there is none. */
	readonly require: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** Every live session, in the order they opened. */
	readonly list: () => readonly CodexWorkbenchTabSession[];
	/** The live session that started this thread, or null when none did or it is ending. */
	readonly forThread: (threadId: ThreadId) => CodexWorkbenchTabSession | null;
	readonly claimThread: (session: CodexWorkbenchTabSession, threadId: ThreadId) => void;
	/** Hand one notification to the session its thread belongs to, or to every session. */
	readonly onNotification: (event: TransportServerNotification) => void;
	/** Hand a coordinator tool call to the calling thread's session, or refuse it. */
	readonly routeCoordinatorTool: (request: DynamicServerRequest) => void;
	/** Hand a workhorse's tell_coordinator call to the calling thread's session, or refuse it. */
	readonly routeCallback: (request: DynamicServerRequest) => void;
	/**
	 * End the live session with this id, because its tab has gone for good. Resolves once every
	 * thread it started was unloaded and the session was dropped; a session that is not live is
	 * left alone.
	 */
	readonly end: (id: TabSessionId) => Promise<void>;
	/** Settle what every session carried for a child that exited. */
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	/** Stop what every session runs: voice, board news, the queue. */
	readonly stop: () => Promise<void>;
	/** Dispose every session's remaining owners and forget every session. */
	readonly dispose: () => Promise<void>;
	/** Hear when a session opens or ends. */
	readonly onChange: (listener: () => void) => () => void;
}

/**
 * A session's state before anything was read into it.
 * @returns The state.
 */
function freshState(): CodexWorkbenchTabSessionState {
	return {
		queue: { kind: "codex_queue", submissions: null },
		queueThreadId: null,
		delegations: new Map(),
		currentCoordinatorCall: null,
		threads: new Set(),
		voiceTrace: sessionVoiceStartTrace(),
		presenting: null,
		phase: "live",
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
 * Hand one notification to one session's owners, in the order they depend on each other.
 * @param session The session.
 * @param event The notification.
 */
function deliver(session: CodexWorkbenchTabSession, event: TransportServerNotification): void {
	const { coordinator, operations, realtime, spokenApproval, callbacks } = session.components;
	coordinator.onNotification(event);
	operations.onNotification(event);
	realtime.onNotification(event);
	if (session.state.phase === "ending") {
		// Its spoken approval and callbacks are gone; its turns still settle their operations.
		return;
	}
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
	const ending = new Set<CodexWorkbenchTabSession>();
	const byThread = new Map<string, CodexWorkbenchTabSession>();
	const listeners = new Set<() => void>();
	const unloads = createCodexThreadUnload(options);
	let disposed = false;

	/** Tell every listener the sessions changed. */
	const publish = (): void => {
		for (const listener of listeners) listener();
	};
	/**
	 * Every session Codex may still speak to: the live ones, then those ending.
	 * @returns The sessions.
	 */
	const every = (): CodexWorkbenchTabSession[] => [...live.values(), ...ending];
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
	 * Stop a session owning a thread, which Codex has unloaded or was told to.
	 * @param session The session.
	 * @param threadId The thread.
	 */
	const releaseThread = (session: CodexWorkbenchTabSession, threadId: ThreadId): void => {
		session.state.threads.delete(threadId);
		const wireThreadId = options.identity.decoder.serializeCodexIdentity(threadId);
		if (byThread.get(wireThreadId) === session) {
			byThread.delete(wireThreadId);
		}
	};
	/**
	 * Unload a session's thread once nothing runs on it, then stop the session owning it.
	 * @param session The session.
	 * @param threadId The thread.
	 * @returns What became of it.
	 */
	const retireThread = async (
		session: CodexWorkbenchTabSession,
		threadId: ThreadId,
	): Promise<ThreadUnload> => {
		const unload = await unloads.unload(threadId);
		releaseThread(session, threadId);
		return unload;
	};
	/**
	 * The session a thread belongs to, live or ending, by the spelling Codex uses.
	 * @param wireThreadId The thread as Codex names it, or null.
	 * @returns The session, or null.
	 */
	const owning = (wireThreadId: string | null): CodexWorkbenchTabSession | null =>
		wireThreadId === null ? null : (byThread.get(wireThreadId) ?? null);
	/**
	 * The live session with this id.
	 * @param id The session.
	 * @param action What it was to do, for the refusal.
	 * @returns The session.
	 * @throws {Error} When the session is not live.
	 */
	const requireLive = (id: TabSessionId, action: string): CodexWorkbenchTabSession => {
		const session = live.get(id);
		if (session === undefined) {
			throw new Error(`The tab session ${id} is not live, so it can ${action}.`);
		}
		return session;
	};
	/**
	 * Build a session.
	 * @param id Its id.
	 * @returns The session.
	 */
	const build = (id: TabSessionId): CodexWorkbenchTabSession => {
		const state = freshState();
		let session: CodexWorkbenchTabSession | null = null;
		/**
		 * This record, once it is built: a session that ended keeps its id for the tab that
		 * comes back, so the record rather than the id is what a thread belongs to.
		 * @returns The session.
		 */
		const self = (): CodexWorkbenchTabSession => {
			if (session === null) {
				throw new Error(`The tab session ${id} is still being built.`);
			}
			return session;
		};
		const built = options.build({
			id,
			state,
			/**
			 * Claim a thread for this session while it is live.
			 * @param threadId The thread.
			 */
			claimThread: (threadId) => {
				if (requireLive(id, "start no thread") !== self()) {
					throw new Error(`The tab session ${id} ended, so it can start no thread.`);
				}
				claimThread(self(), threadId);
			},
			/**
			 * Unload a thread this session no longer runs on, then stop owning it.
			 * @param threadId The thread.
			 * @returns What became of it.
			 */
			retireThread: (threadId) => retireThread(self(), threadId),
			/**
			 * Stop owning a thread something else unloaded.
			 * @param threadId The thread.
			 */
			releaseThread: (threadId) => {
				releaseThread(self(), threadId);
			},
		});
		session = Object.freeze({ id, components: built.components, actions: built.actions, state });
		return session;
	};
	return Object.freeze({
		/**
		 * The live session with this id, built the first time it is asked for, and built afresh
		 * for a tab that comes back after its session ended.
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
		 * The live session that started a thread.
		 * @param threadId The thread.
		 * @returns The session, or null when none did or the one that did is ending.
		 */
		forThread: (threadId) => {
			const session = owning(options.identity.decoder.serializeCodexIdentity(threadId));
			return session?.state.phase === "live" ? session : null;
		},
		claimThread,
		/**
		 * Hand one notification to the thread unloads, then to the session its thread belongs
		 * to, or to every session when no session started that thread or it names none.
		 * @param event The notification.
		 */
		onNotification: (event) => {
			unloads.onNotification(event);
			const owner = owning(notificationThread(event));
			for (const session of owner === null ? every() : [owner]) {
				deliver(session, event);
			}
		},
		/**
		 * Hand a coordinator tool call to the session that started the calling thread, ending
		 * or not, and refuse it through the coordinator tools' own answer otherwise.
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
		 * Hand a workhorse's tell_coordinator call to the live session that started the calling
		 * thread, and answer it through the callbacks' own answer otherwise: an ending session's
		 * coordinator hears nothing more.
		 * @param request The call.
		 */
		routeCallback: (request) => {
			const owner = owning(request.params.threadId);
			if (owner?.state.phase === "live") {
				owner.components.callbacks.onServerRequest(request);
				return;
			}
			void answerUnownedTellCoordinator(options.transport, request).catch(() => undefined);
		},
		/**
		 * End the live session with this id: it stops being live at once, so a tab that comes
		 * back under the id gets a fresh session, and it is dropped once its threads unloaded.
		 * @param id The session.
		 * @returns Resolves once the session was dropped.
		 */
		end: (id) => {
			const session = live.get(id);
			if (session === undefined) {
				return Promise.resolve();
			}
			live.delete(id);
			session.state.phase = "ending";
			ending.add(session);
			publish();
			return endTabSession(session, {
				threadLink: options.threadLink,
				endApprovals: options.endApprovals,
				unload: unloads.unload,
				/**
				 * Stop the ending session owning a thread.
				 * @param threadId The thread.
				 */
				release: (threadId) => {
					releaseThread(session, threadId);
				},
			}).finally(() => ending.delete(session));
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
				every().flatMap(({ components }) => [
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
				every().flatMap(({ components }) => [
					() => stopVoice(components.realtime),
					() => components.realtime.dispose(),
					() => components.semanticPublisher.dispose(),
					() => components.queue.shutdown(),
				]),
				"Codex workbench shutdown failed.",
			),
		/**
		 * Dispose every session's callbacks, spoken approval gate, semantic delivery
		 * and coordinator tools, and forget every session, ending ones included: the
		 * child is gone, so nothing is left to unload.
		 */
		dispose: async () => {
			disposed = true;
			const sessions = every();
			live.clear();
			ending.clear();
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
		 * Hear when a session opens or ends.
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

export { createCodexWorkbenchSessions };
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
