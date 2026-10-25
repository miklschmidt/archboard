// One browser tab's voice session: started, spoken into and stopped by the tab that holds it.
//
// Voice speaks for the whole tab. A start is bound to the workhorse of the checkout of
// the chat it came from, for as long as that session runs, and any chat of the tab can stop it.
//
// Each tab session has its own coordinator and its own voice, so two tabs talk at once
// and an unattended session, whose page is a tab session of its own, never stops somebody who is
// talking in another tab. A start replaces whatever session its own tab was running.
//
// A coordinator carries one voice session. A start that finds the coordinator already
// carried one has it replaced first, so a turn the last session left running, and whatever that
// turn answers, stay on a thread no later session speaks from. Once nothing runs on that thread,
// the coordinator unsubscribes from it so Codex unloads it, and the trace says how
// that went.

import type {
	BrowserActionContext,
	BrowserRealtimeActions,
} from "#server/protocol/gateway/contract.ts";
import type { ChildEpoch, ChildId, ThreadId } from "@archboard/codex-app-server/identity";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
import type { CoordinatorRetirement } from "#runtime/protocol/coordinator/contract.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/workbench.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchWorkhorseComponents,
} from "#server/services/sessions/sessions.ts";
import {
	sessionVoiceStartTrace,
	traceMessage,
	type SessionVoiceStartTrace,
} from "#server/services/voice/start-trace.ts";
import {
	validateNarrative,
	isUnattended,
	forgetNarrative,
	prepareNarrative,
	openedNarrative,
	type VoiceNarrativeAdapter,
} from "#server/services/voice/narrative.ts";
type RealtimeComponents = Pick<CodexWorkbenchComponents, "identity"> &
	Pick<CodexWorkbenchSessionComponents, "coordinator" | "realtime">;

/** What a voice start reads and records of its tab session: its workhorses, and voice's checkout. */
type RealtimeScope = Pick<
	CodexWorkbenchTabSessionScope,
	"claimThread" | "releaseThread" | "workhorses" | "state"
>;

type ActiveRealtime = Readonly<{
	handle: string;
	connection: BrowserActionContext["connection"];
	browserId: string;
	chatId: string;
	/** The checkout the tab showed when voice started, whose workhorse it is bound to. */
	checkout: string;
	childId: ChildId;
	epoch: ChildEpoch;
	threadId: ThreadId;
	coordinatorThreadId: ThreadId;
	sessionId: ReturnType<typeof parseRealtimeSessionId>;
	correlationId: ReturnType<typeof parseRealtimeCorrelationId>;
}>;

/** The coordinator as it describes itself. */
type CoordinatorSnapshot = ReturnType<RealtimeComponents["coordinator"]["snapshot"]>;

/** The workhorse as it describes itself. */
type WorkhorseSnapshot = ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>;

/**
 * Keep what became of a replaced coordinator's thread in the voice start trace, where a failed
 * unsubscribe can be read afterwards, and stop the tab session owning the thread.
 * @param trace The tab session's voice start trace.
 * @param releaseThread Stops the tab session owning the unloaded thread.
 * @returns What notes one retirement.
 */
function noteRetirement(
	trace: SessionVoiceStartTrace,
	releaseThread: CodexWorkbenchTabSessionScope["releaseThread"],
): (retirement: CoordinatorRetirement) => void {
	return (retirement) => {
		releaseThread(retirement.threadId);
		trace.note("coordinator_retired", {
			threadId: retirement.threadId,
			outcome: retirement.outcome,
			message: retirement.outcome === "failed" ? retirement.message : null,
		});
	};
}

/**
 * Whether a realtime session belongs to the exact browser socket this command
 * came in on.
 * @param active The realtime session.
 * @param context The chat and its connection.
 * @returns True when it is the same socket.
 */
function sameSocket(active: ActiveRealtime, context: BrowserActionContext): boolean {
	return (
		active.connection === context.connection &&
		active.browserId === context.browserId &&
		active.chatId === context.chatId
	);
}

/**
 * Whether a realtime session belongs to the exact thread link this command came
 * in on.
 * @param active The realtime session.
 * @param context The chat and the link it named.
 * @returns True when it is the same link.
 */
function sameLink(active: ActiveRealtime, context: BrowserActionContext): boolean {
	return (
		active.childId === context.childId &&
		active.epoch === context.epoch &&
		active.threadId === context.link.threadId
	);
}

/**
 * Whether the coordinator is still the one this realtime session was started
 * against: voice belongs to that coordinator and to no other.
 * @param coordinator The coordinator snapshot.
 * @param active The realtime session.
 * @returns True when it is the same coordinator.
 */
function coordinatorHolds(coordinator: CoordinatorSnapshot, active: ActiveRealtime): boolean {
	return (
		coordinator.state === "ready" &&
		coordinator.threadId === active.coordinatorThreadId &&
		coordinator.childId === active.childId &&
		coordinator.epoch === active.epoch
	);
}

/**
 * Whether a realtime session is the one this command may act on: the same
 * handle and coordinator it was started under, and — for a command that
 * speaks into it — the same socket and link, whose media is what plays the voice.
 * A stop may come from any chat of the tab, whichever checkout it shows.
 * @param active The realtime session.
 * @param handle The handle the command named.
 * @param context The chat and the link it named.
 * @param coordinator The coordinator snapshot.
 * @param socketBound Whether the command must come from the session's own socket.
 * @returns True when the command may act on it.
 */
function isCurrentRealtime(
	active: ActiveRealtime,
	handle: string,
	context: BrowserActionContext,
	coordinator: CoordinatorSnapshot,
	socketBound: boolean,
): boolean {
	return (
		active.handle === handle &&
		(!socketBound || (sameSocket(active, context) && sameLink(active, context))) &&
		coordinatorHolds(coordinator, active)
	);
}

/**
 * Whether the coordinator can carry voice for this chat right now.
 * @param coordinator The coordinator snapshot.
 * @param context The chat and its child epoch.
 * @returns True when it can.
 */
function coordinatorReadyFor(
	coordinator: CoordinatorSnapshot,
	context: BrowserActionContext,
): boolean {
	return (
		coordinator.state === "ready" &&
		coordinator.childId === context.childId &&
		coordinator.epoch === context.epoch
	);
}

/**
 * Whether the workhorse of the chat's checkout is running the thread the chat is linked to,
 * which is the thread voice would be bound to.
 * @param workhorse The workhorse snapshot, or null while the checkout has no workhorse.
 * @param threadId The chat's linked thread.
 * @returns True when it is.
 */
function workhorseReadyFor(workhorse: WorkhorseSnapshot | null, threadId: ThreadId): boolean {
	return workhorse?.state === "ready" && workhorse.threadId === threadId;
}

/**
 * The workhorse of one checkout of the tab, as it describes its thread.
 * @param threads The tab session's workhorses.
 * @param checkout The checkout of the chat voice starts from.
 * @returns Its snapshot, or null while the checkout has no workhorse.
 */
function workhorseSnapshotOf(threads: RealtimeScope, checkout: string): WorkhorseSnapshot | null {
	const workhorse = threads.workhorses().find((candidate) => candidate.checkout === checkout);
	return workhorse === undefined ? null : workhorse.components.workhorse.snapshot();
}

/**
 * Keep in the start trace which of the conditions a voice start needs held: which one a refusal
 * turned on is the first thing anybody asks.
 * @param trace The tab session's voice start trace.
 * @param coordinator The coordinator snapshot.
 * @param workhorse The snapshot of the workhorse of the chat's checkout, or null.
 * @param context The chat and the link it named.
 */
function notePreconditions(
	trace: SessionVoiceStartTrace,
	coordinator: CoordinatorSnapshot,
	workhorse: WorkhorseSnapshot | null,
	context: BrowserActionContext,
): void {
	const threadId = context.link.threadId;
	trace.note("preconditions", {
		linkedThread: threadId !== null,
		coordinatorState: coordinator.state,
		coordinatorReason: coordinator.reason,
		coordinatorReady: coordinatorReadyFor(coordinator, context),
		workhorseState: workhorse?.state ?? "unbound",
		workhorseReady: threadId !== null && workhorseReadyFor(workhorse, threadId),
	});
}

/**
 * Own one continuous realtime session for one tab session, spoken through one
 * exact browser socket binding.
 * @param components The tab session's coordinator and realtime adapter.
 * @param threads Records that the session started a thread, the fresh coordinator a start
 * replaces the voiced one with, and that it no longer owns the one replaced once that unloaded;
 * the session's workhorses, and where it keeps the checkout voice is bound to.
 * @param trace Where this tab session's voice starts are kept; each start begins its own attempt.
 * @param narrativeAdapter The optional host narrative adapter.
 * @returns The actions.
 */
export function createServerRealtimeActions(
	components: RealtimeComponents,
	threads: RealtimeScope,
	trace: SessionVoiceStartTrace = sessionVoiceStartTrace(),
	narrativeAdapter?: VoiceNarrativeAdapter,
): BrowserRealtimeActions {
	let activeRealtime: ActiveRealtime | null = null;
	// The coordinator thread the last session started on, which no later session may start on.
	let voicedCoordinator: ThreadId | null = null;
	// The chat the last session started from, whose narrative a later session replaces.
	let voicedChat: string | null = null;
	let realtimeQueue = Promise.resolve();
	// The start trace keeps every state the session moves through and every diagnostic it raises.
	components.realtime.onSemanticEvent((event) => {
		if (event.kind === "diagnostic") {
			trace.note("diagnostic", { code: event.code, message: event.message });
		}
		if (event.kind !== "state") {
			return;
		}
		trace.note("state", { phase: event.state.phase, reason: event.state.reason });
	});
	/**
	 * Run one realtime operation after the last one has settled: a session is a
	 * single continuous thing, and two commands must not overlap on it.
	 * @param operation The operation.
	 * @returns What the operation answered.
	 */
	const serialize = <Value>(operation: () => Promise<Value>): Promise<Value> => {
		const pending = realtimeQueue.then(operation);
		realtimeQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};
	/**
	 * Stop the realtime session, leaving alone one that has already been
	 * replaced by a later start.
	 * @param expected The session the caller means, or every session when
	 * the caller means whichever is active.
	 */
	const stopActive = async (expected?: ActiveRealtime): Promise<void> => {
		const active = activeRealtime;
		if (active === null || (expected !== undefined && active !== expected)) {
			return;
		}
		try {
			await components.realtime.stop({
				sessionId: active.sessionId,
				correlationId: active.correlationId,
			});
		} finally {
			if (activeRealtime === active) {
				activeRealtime = null;
			}
		}
	};

	/**
	 * Give a start a coordinator that has carried no voice session: the current one when it has
	 * not, and a fresh one in its place when it has. A replacement that does not become ready
	 * leaves the current coordinator to the visual workbench and refuses the start.
	 */
	const freshCoordinator = async (): Promise<void> => {
		const coordinator = components.coordinator.snapshot();
		if (coordinator.threadId === null || coordinator.threadId !== voicedCoordinator) {
			return;
		}
		try {
			await components.coordinator.replace({
				operationId: components.identity.operation.issuer.mintOperationId(),
				onRetired: noteRetirement(trace, threads.releaseThread),
			});
		} catch (error) {
			const refusal = new Error(
				`Voice could not start a fresh coordinator: ${traceMessage(error)}`,
				{ cause: error },
			);
			trace.note("refused", { message: traceMessage(refusal) });
			throw refusal;
		}
		const fresh = components.coordinator.snapshot();
		if (fresh.threadId !== null) {
			threads.claimThread(fresh.threadId);
		}
		trace.note("coordinator_replaced", { coordinatorState: fresh.state });
	};
	/**
	 * The realtime session one command may act on, refused when the handle no
	 * longer names this exact browser binding.
	 * @param handle The handle the command named.
	 * @param context The chat and the link it named.
	 * @param socketBound Whether the command must come from the session's own
	 * socket; only stopping may come from any chat of the tab.
	 * @returns The session.
	 */
	const requireActive = (
		handle: string,
		context: BrowserActionContext,
		socketBound = true,
	): ActiveRealtime => {
		const active = activeRealtime;
		if (active === null) {
			throw new Error("The realtime session handle is stale for this exact browser binding.");
		}
		if (
			!isCurrentRealtime(active, handle, context, components.coordinator.snapshot(), socketBound)
		) {
			throw new Error("The realtime session handle is stale for this exact browser binding.");
		}
		return active;
	};
	/**
	 * The session one start would own, refused unless the coordinator and the
	 * workhorse are both on this chat's linked thread.
	 * @param commandId The command starting it, which is also its handle.
	 * @param context The chat and the link it named.
	 * @returns The session, not yet offered.
	 */
	const pendingRealtime = (
		commandId: BrowserActionContext["commandId"],
		context: BrowserActionContext,
	): ActiveRealtime => {
		const coordinator = components.coordinator.snapshot();
		const threadId = context.link.threadId;
		const coordinatorThreadId = coordinator.threadId;
		const workhorse = workhorseSnapshotOf(threads, context.checkout);
		notePreconditions(trace, coordinator, workhorse, context);
		if (
			threadId === null ||
			coordinatorThreadId === null ||
			!coordinatorReadyFor(coordinator, context) ||
			!workhorseReadyFor(workhorse, threadId)
		) {
			throw new Error("Realtime is unavailable for this exact linked thread.");
		}
		const handle = String(commandId);
		return Object.freeze({
			handle,
			connection: context.connection,
			browserId: context.browserId,
			chatId: context.chatId,
			checkout: context.checkout,
			childId: context.childId,
			epoch: context.epoch,
			threadId,
			coordinatorThreadId,
			sessionId: parseRealtimeSessionId(handle),
			correlationId: parseRealtimeCorrelationId(handle),
		});
	};

	/**
	 * The session one start would own, with a refusal kept in the start trace.
	 * @param commandId The command starting it.
	 * @param context The chat and the link it named.
	 * @returns The session, not yet offered.
	 */
	const tracedPending = (
		commandId: BrowserActionContext["commandId"],
		context: BrowserActionContext,
	): ActiveRealtime => {
		try {
			return pendingRealtime(commandId, context);
		} catch (error) {
			trace.note("refused", { message: traceMessage(error) });
			throw error;
		}
	};

	const actions: BrowserRealtimeActions = {
		/**
		 * Start voice for one chat, replacing whatever session its tab was running.
		 * @param command The offer.
		 * @param context The chat and the link it named.
		 * @returns The answer, and the handle the chat holds the session by.
		 */
		start: (command, context) =>
			serialize(async () => {
				validateNarrative(narrativeAdapter, command.narrative);
				trace.begin(context.chatId);
				trace.note("requested", {
					narrative: command.narrative !== undefined,
					offerSdpBytes: Buffer.byteLength(command.sdp),
					replacesSession: activeRealtime !== null,
				});
				await stopActive();
				await freshCoordinator();
				const pending = tracedPending(command.commandId, context);
				activeRealtime = pending;
				// Before the offer, which reads the binding: voice is bound to this checkout's workhorse.
				threads.state.voiceCheckout = pending.checkout;
				voicedCoordinator = pending.coordinatorThreadId;
				forgetNarrative(narrativeAdapter, voicedChat);
				voicedChat = pending.browserId;
				try {
					const narrative = prepareNarrative(
						narrativeAdapter,
						command.narrative,
						pending.browserId,
					);
					if (narrative !== null)
						trace.note("prepared", { unattended: isUnattended(narrativeAdapter, narrative) });
					// Creating the offer subscribes the session to the host's voice input before it
					// returns, so what the host says while Codex starts the session reaches the voice
					// model the way everything it says later does.
					const answering = components.realtime.createOffer(
						{
							sessionId: pending.sessionId,
							correlationId: pending.correlationId,
							sdp: command.sdp,
						},
						narrative,
					);
					openedNarrative(narrativeAdapter, narrative, pending.browserId, trace);
					const realtimeAnswer = await answering;
					requireActive(pending.handle, context);
					trace.note("answered", {
						answerSdpBytes: Buffer.byteLength(realtimeAnswer.sdp),
					});
					return {
						outcome: "delivered" as const,
						realtimeAnswer,
						realtimeSessionHandle: pending.handle,
					};
				} catch (error) {
					trace.note("failed", { message: traceMessage(error) });
					if (activeRealtime === pending) {
						activeRealtime = null;
					}
					throw error;
				}
			}),
		/**
		 * Say something into the running session as typed text.
		 * @param command The handle and the text.
		 * @param context The chat and the link it named.
		 * @returns The browser outcome.
		 */
		appendText: (command, context) =>
			serialize(async () => {
				const active = requireActive(command.realtimeSessionHandle, context);
				await components.realtime.appendText({
					sessionId: active.sessionId,
					correlationId: active.correlationId,
					text: command.text,
				});
				return { outcome: "delivered" as const };
			}),
		/**
		 * Stop the session, from whichever chat of the tab holds the lease, of whichever checkout:
		 * the tab has one voice, and ending it needs no media of its own.
		 * @param command The handle.
		 * @param context The chat and the link it named.
		 * @returns The browser outcome.
		 */
		stop: (command, context) =>
			serialize(async () => {
				const active = requireActive(command.realtimeSessionHandle, context, false);
				await stopActive(active);
				return { outcome: "delivered" as const };
			}),
		/**
		 * Stop the session a browser that has gone was speaking through.
		 * @param context The chat and its connection.
		 * @returns When the session this browser was speaking through has stopped.
		 */
		onBrowserDisconnect: async (context) => {
			const active = activeRealtime;
			if (active === null || active.connection !== context.connection) {
				return;
			}
			await serialize(() => stopActive(active));
		},
	};
	return Object.freeze(actions);
}
