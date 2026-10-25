// The tab sessions of one Codex child generation (TASK-373).
//
// A tab session owns the coordinator, voice, and the coordinator's tools and callbacks of one
// browser tab, and one workhorse for each checkout the tab works in (ADR 0050). Each workhorse
// owns its thread link, its queue, its operations and its board-change delivery. The generation
// owns what describes the child and what every tab shares: the transport, the protocol session,
// the thread link port, the approval broker, the app's dynamic tools, the account and the gateway.
//
// Codex speaks to the generation, so this store is where a notification or a server request finds
// its conversation: by the thread it names. A thread belongs to the session that started it, and
// a workhorse thread to its workhorse. A notification for a thread nobody claimed yet goes to
// every session, because a coordinator start waits for its own thread's settings before it knows
// the thread. A request from a thread nobody holds is refused by its owner's own answer, so a
// running turn never waits on nobody.
//
// A session ends when its tab has gone for good (no pane of it came back within the grace): its
// approvals are cancelled, its voice, board news and queues stop, every link of its workhorses is
// cleared, and each of its threads is unsubscribed once nothing runs on it, so Codex unloads it.
// Until then its coordinator's tools and its operations stay, so a turn still running is
// answered. A tab that comes back under the same id meanwhile gets a fresh session. A child exit
// or a server shutdown drops every session without unsubscribing anything, because the child is
// gone.

import { answerUnownedTellCoordinator } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import { COORDINATOR_TOOLS_OWNER } from "#runtime/protocol/coordinator-tools/contract.ts";
import { refusedResponse } from "#runtime/rules/coordinator-tools/response.ts";
import { createCodexThreadUnload } from "#runtime/operations/thread-unload/unload.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { WorkhorseOperationEventListener } from "#runtime/protocol/workhorse-operations/contract.ts";
import type { IdentityAuthority, ThreadId } from "@archboard/codex-app-server/identity";
import { workhorseLinkKey, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { endTabSession, settleEach, stopVoice } from "#server/services/sessions/end.ts";
import {
	freshWorkhorseState,
	noteActiveTurn,
	stopWorkhorses,
	type CodexWorkbenchWorkhorse,
	type CodexWorkbenchWorkhorseComponents,
	type CodexWorkbenchWorkhorseState,
	type WorkhorseStop,
} from "#server/services/sessions/workhorses.ts";
import { sessionVoiceStartTrace } from "#server/services/voice/start-trace.ts";
import {
	noteCoordinatorTurnStart,
	recordGivenWork,
} from "#server/services/sessions/delegations.ts";
import type {
	BuiltTabSession,
	BuiltWorkhorse,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchSessions,
	CodexWorkbenchTabSession,
	CodexWorkbenchTabSessionActions,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchTabSessionState,
	CodexWorkbenchWorkhorseScope,
	CreateCodexWorkbenchSessionsOptions,
} from "#server/protocol/generation/session-contract.ts";

/** Who started one thread: a tab session, and the workhorse of it when a workhorse did. */
interface ThreadOwner {
	readonly session: CodexWorkbenchTabSession;
	readonly workhorse: CodexWorkbenchWorkhorse | null;
}

/**
 * A session's state before anything was read into it.
 * @returns The state.
 */
function freshState(): CodexWorkbenchTabSessionState {
	return {
		delegations: new Map(),
		coordinatorTurnHomes: new Map(),
		currentCoordinatorCall: null,
		threads: new Set(),
		voiceTrace: sessionVoiceStartTrace(),
		voiceCheckout: null,
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
 * @param decoder Names threads and turns as Codex spells them.
 */
function deliver(
	session: CodexWorkbenchTabSession,
	event: TransportServerNotification,
	decoder: IdentityAuthority["decoder"],
): void {
	const { coordinator, realtime, spokenApproval, callbacks } = session.components;
	coordinator.onNotification(event);
	for (const workhorse of session.workhorses.values()) {
		noteActiveTurn(workhorse, event, decoder);
		workhorse.components.operations.onNotification(event);
	}
	realtime.onNotification(event);
	if (session.state.phase === "ending") {
		// Its spoken approval and callbacks are gone; its turns still settle their operations.
		return;
	}
	spokenApproval.onNotification(event);
	// After the operations owners, which settle the coordinator's own delegations first.
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
	const byThread = new Map<string, ThreadOwner>();
	const listeners = new Set<() => void>();
	const unloads = createCodexThreadUnload(options);
	const { decoder } = options.identity;
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
	 * Record that a session, or a workhorse of it, started a thread.
	 * @param owner The session, and the workhorse when one started it.
	 * @param threadId The thread.
	 */
	const claimThread = (owner: ThreadOwner, threadId: ThreadId): void => {
		owner.session.state.threads.add(threadId);
		byThread.set(decoder.serializeCodexIdentity(threadId), owner);
	};
	/**
	 * Stop a session owning a thread, which Codex has unloaded or was told to.
	 * @param session The session.
	 * @param threadId The thread.
	 */
	const releaseThread = (session: CodexWorkbenchTabSession, threadId: ThreadId): void => {
		session.state.threads.delete(threadId);
		const wireThreadId = decoder.serializeCodexIdentity(threadId);
		if (byThread.get(wireThreadId)?.session === session) {
			byThread.delete(wireThreadId);
		}
	};
	/**
	 * Who started a thread, live or ending, by the spelling Codex uses.
	 * @param wireThreadId The thread as Codex names it, or null.
	 * @returns The owner, or null.
	 */
	const owning = (wireThreadId: string | null): ThreadOwner | null =>
		wireThreadId === null ? null : (byThread.get(wireThreadId) ?? null);
	/**
	 * Refuse what a session that is no longer live would start.
	 * @param session The session.
	 * @param action What it was to do, for the refusal.
	 * @throws {Error} When the session is not the live one under its id.
	 */
	const assertLive = (session: CodexWorkbenchTabSession, action: string): void => {
		if (live.get(session.id) !== session) {
			throw new Error(`The tab session ${session.id} is not live, so it can ${action}.`);
		}
	};
	/**
	 * Build the workhorse of one checkout of a session, and keep it there.
	 * @param session The session.
	 * @param workhorses Where the session keeps its workhorses.
	 * @param fanOut Tells the session's listeners what every workhorse's operations report.
	 * @param checkout The checkout.
	 * @returns The workhorse.
	 */
	const buildWorkhorse = (
		session: CodexWorkbenchTabSession,
		workhorses: Map<string, CodexWorkbenchWorkhorse>,
		fanOut: WorkhorseOperationEventListener,
		checkout: string,
	): CodexWorkbenchWorkhorse => {
		assertLive(session, "start no workhorse");
		const key = workhorseLinkKey(session.id, checkout);
		const state = freshWorkhorseState();
		let workhorse: CodexWorkbenchWorkhorse | null = null;
		/**
		 * This workhorse, once it is built.
		 * @returns The workhorse.
		 */
		const self = (): CodexWorkbenchWorkhorse => {
			if (workhorse === null) {
				throw new Error(`The workhorse of ${checkout} is still being built.`);
			}
			return workhorse;
		};
		const built = options.buildWorkhorse({
			session,
			checkout,
			key,
			state,
			/**
			 * Claim a thread for this workhorse while its session is live.
			 * @param threadId The thread.
			 */
			claimThread: (threadId) => {
				assertLive(session, "start no thread");
				claimThread({ session, workhorse: self() }, threadId);
			},
			/**
			 * Claim a thread for the session's coordinator while the session is live.
			 * @param threadId The thread.
			 */
			claimCoordinatorThread: (threadId) => {
				assertLive(session, "start no thread");
				claimThread({ session, workhorse: null }, threadId);
			},
			/**
			 * Unload a thread this workhorse no longer runs on, then stop owning it.
			 * @param threadId The thread.
			 * @returns What became of it.
			 */
			retireThread: async (threadId) => {
				const unload = await unloads.unload(threadId);
				releaseThread(session, threadId);
				return unload;
			},
		});
		workhorse = Object.freeze({
			checkout,
			key,
			components: built.components,
			actions: built.actions,
			state,
		});
		built.components.operations.subscribe(fanOut);
		built.components.operations.subscribe(
			recordGivenWork(session.state.coordinatorTurnHomes, checkout),
		);
		workhorses.set(checkout, workhorse);
		publish();
		return workhorse;
	};
	/**
	 * Build a session.
	 * @param id Its id.
	 * @returns The session.
	 */
	const build = (id: TabSessionId): CodexWorkbenchTabSession => {
		const state = freshState();
		const workhorses = new Map<string, CodexWorkbenchWorkhorse>();
		const operationListeners = new Set<WorkhorseOperationEventListener>();
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
		/**
		 * Tell every listener of the session what one workhorse's operations reported.
		 * @param event The report.
		 */
		const fanOut: WorkhorseOperationEventListener = (event) => {
			for (const listener of operationListeners) listener(event);
		};
		/**
		 * The workhorse of one checkout, built the first time it is asked for.
		 * @param named The checkout as the caller names it.
		 * @returns The workhorse.
		 */
		const workhorse = (named: string): CodexWorkbenchWorkhorse => {
			const checkout = options.resolveCheckout(named);
			if (checkout === null) throw new Error(`The host does not admit checkout ${named}.`);
			return workhorses.get(checkout) ?? buildWorkhorse(self(), workhorses, fanOut, checkout);
		};
		/**
		 * The workhorse voice is bound to.
		 * @returns It, or null before voice started or while its checkout has none.
		 */
		const voiceWorkhorse = (): CodexWorkbenchWorkhorse | null =>
			state.voiceCheckout === null ? null : (workhorses.get(state.voiceCheckout) ?? null);
		/**
		 * Stop the workhorse of one checkout, or every one of the tab.
		 * @param checkout The checkout, or null for every workhorse.
		 * @returns What each stopped workhorse did.
		 */
		const stopWork = (checkout: string | null): Promise<readonly WorkhorseStop[]> =>
			stopWorkhorses(
				[...workhorses.values()].filter(
					(candidate) => checkout === null || candidate.checkout === checkout,
				),
				options.session,
			);
		const built = options.build({
			id,
			state,
			/**
			 * Claim a thread for this session's coordinator while it is live.
			 * @param threadId The thread.
			 */
			claimThread: (threadId) => {
				assertLive(self(), "start no thread");
				claimThread({ session: self(), workhorse: null }, threadId);
			},
			/**
			 * Stop owning a thread something else unloaded.
			 * @param threadId The thread.
			 */
			releaseThread: (threadId) => {
				releaseThread(self(), threadId);
			},
			/**
			 * The session's workhorses, as they are now.
			 * @returns Them, in the order they were built.
			 */
			workhorses: () => [...workhorses.values()],
			workhorse,
			voiceWorkhorse,
			stopWork,
			workhorseOperations: {
				/**
				 * Hear every workhorse's operation reports.
				 * @param listener What to tell.
				 * @returns How to stop listening.
				 */
				subscribe: (listener) => {
					operationListeners.add(listener);
					return () => {
						operationListeners.delete(listener);
					};
				},
			},
		});
		session = Object.freeze({
			id,
			components: built.components,
			actions: built.actions,
			state,
			workhorses,
			workhorse,
			voiceWorkhorse,
			stopWork,
		});
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
			const owner = owning(decoder.serializeCodexIdentity(threadId));
			return owner?.session.state.phase === "live" ? owner.session : null;
		},
		/**
		 * The workhorse of a live session that started a thread.
		 * @param threadId The thread.
		 * @returns The workhorse, or null when no live workhorse did.
		 */
		workhorseForThread: (threadId) => {
			const owner = owning(decoder.serializeCodexIdentity(threadId));
			return owner?.session.state.phase === "live" ? owner.workhorse : null;
		},
		/**
		 * Hand one notification to the thread unloads, then to the session its thread belongs
		 * to, or to every session when no session started that thread or it names none.
		 * @param event The notification.
		 */
		onNotification: (event) => {
			unloads.onNotification(event);
			const owner = owning(notificationThread(event));
			if (owner?.workhorse === null) {
				noteCoordinatorTurnStart(owner.session.state.coordinatorTurnHomes, event, decoder, () =>
					options.shownConversationOf(owner.session.id),
				);
			}
			for (const session of owner === null ? every() : [owner.session]) {
				deliver(session, event, decoder);
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
				owner.session.components.coordinatorTools.onServerRequest(request);
				return;
			}
			void options.transport
				.respond(request, COORDINATOR_TOOLS_OWNER, {
					result: refusedResponse(
						"invalid_call",
						"No conversation on this server started the calling thread.",
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
			if (owner?.session.state.phase === "live") {
				owner.session.components.callbacks.onServerRequest(request);
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
				every().flatMap(({ components, workhorses }) => [
					...[...workhorses.values()].map(
						(workhorse) => () => workhorse.components.contextDelivery.childExit(child, epoch),
					),
					() => components.spokenApproval.onChildExit({ child, epoch }),
					() => components.coordinatorTools.onChildExit({ child, epoch }),
				]),
				"Codex child-exit cleanup failed.",
			),
		/**
		 * Stop what every session runs: its voice, its realtime adapter, its board
		 * news and its queues.
		 * @returns Resolves once every session has stopped.
		 */
		stop: () =>
			settleEach(
				every().flatMap(({ components, workhorses }) => [
					() => stopVoice(components.realtime),
					() => components.realtime.dispose(),
					() => components.semanticPublisher.dispose(),
					...[...workhorses.values()].flatMap((workhorse) => [
						() => workhorse.components.semanticPublisher.dispose(),
						() => workhorse.components.queue.shutdown(),
					]),
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
					sessions.flatMap(({ components, workhorses }) => [
						() => components.callbacks.dispose(),
						() => components.spokenApproval.dispose(),
						...[...workhorses.values()].map(
							(workhorse) => () => workhorse.components.contextDelivery.dispose(),
						),
						() => components.coordinatorTools.dispose(),
					]),
					"Codex workbench shutdown failed.",
				);
			} finally {
				listeners.clear();
			}
		},
		/**
		 * Hear when a session opens or ends, or gains a workhorse.
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
	BuiltWorkhorse,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchSessions,
	CodexWorkbenchTabSession,
	CodexWorkbenchTabSessionActions,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchTabSessionState,
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
	CodexWorkbenchWorkhorseState,
	CreateCodexWorkbenchSessionsOptions,
	WorkhorseStop,
};
