// The Archboard server's one voice session: started, spoken into and stopped by the browser that holds it.
//
// A start replaces whatever session was running, except a recording's (TASK-304): a recording is
// started from a headless page nobody is watching, and must never stop somebody who is talking,
// so it is refused while any session is live, with the reason the page reports. A recording
// start also opens no step: the recording page opens step 1 itself and moves on by itself, and
// each step it reports reaches the voice model the way a step chosen by hand does.
//
// A coordinator carries one voice session (TASK-301). A start that finds the coordinator already
// carried one has it replaced first, so a turn the last session left running, and whatever that
// turn answers, stay on a thread no later session speaks from. Once nothing runs on that thread,
// the coordinator unsubscribes from it so Codex unloads it (TASK-374), and the trace says how
// that went.

import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserRealtimeActions,
} from "@/server/codex-workbench";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "@/shared/codex-realtime-contract";
import type { CoordinatorRetirement } from "@/runtime/codex-coordinator";
import type { RealtimePresentation } from "@/runtime/codex-realtime";
import type { CodexWorkbenchComponents } from "@/server/archboard/lib/codex-workbench";
import { traceMessage, voiceStartTrace } from "@/server/archboard/lib/voice-start-trace";
import {
	bindVoicePane,
	forgetNarration,
	narrationFor,
	openNarration,
} from "@/server/archboard/lib/walkthrough-narration";

type RealtimeComponents = Pick<
	CodexWorkbenchComponents,
	"coordinator" | "identity" | "realtime" | "workhorse"
>;

/** A browser's request to start voice. */
type RealtimeStartCommand = Parameters<BrowserRealtimeActions["start"]>[0];

type ActiveRealtime = Readonly<{
	handle: string;
	connection: BrowserActionContext["connection"];
	browserId: string;
	paneId: string;
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
type WorkhorseSnapshot = ReturnType<RealtimeComponents["workhorse"]["snapshot"]>;

/**
 * Keep what became of a replaced coordinator's thread in the voice start trace, where a failed
 * unsubscribe can be read afterwards.
 * @param retirement The retired thread and Codex's answer, or why it failed.
 */
function noteRetirement(retirement: CoordinatorRetirement): void {
	voiceStartTrace.note("coordinator_retired", {
		threadId: retirement.threadId,
		outcome: retirement.outcome,
		message: retirement.outcome === "failed" ? retirement.message : null,
	});
}

/**
 * Whether a realtime session belongs to the exact browser socket this command
 * came in on.
 * @param active The realtime session.
 * @param context The pane and its connection.
 * @returns True when it is the same socket.
 */
function sameSocket(active: ActiveRealtime, context: BrowserActionContext): boolean {
	return (
		active.connection === context.connection &&
		active.browserId === context.browserId &&
		active.paneId === context.paneId
	);
}

/**
 * Whether a realtime session belongs to the exact thread link this command came
 * in on.
 * @param active The realtime session.
 * @param context The pane and the link it named.
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
 * handle, link, and coordinator it was started under, and — for a command that
 * speaks into it — the same socket, whose media is what plays the voice.
 * @param active The realtime session.
 * @param handle The handle the command named.
 * @param context The pane and the link it named.
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
		(!socketBound || sameSocket(active, context)) &&
		sameLink(active, context) &&
		coordinatorHolds(coordinator, active)
	);
}

/**
 * Whether the coordinator can carry voice for this pane right now.
 * @param coordinator The coordinator snapshot.
 * @param context The pane and its child epoch.
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
 * Whether the workhorse is running the thread this pane is linked to, which is
 * the thread voice would be speaking about.
 * @param workhorse The workhorse snapshot.
 * @param threadId The pane's linked thread.
 * @returns True when it is.
 */
function workhorseReadyFor(workhorse: WorkhorseSnapshot, threadId: ThreadId): boolean {
	return workhorse.state === "ready" && workhorse.threadId === threadId;
}

/**
 * What one start narrates, with the session bound to the pane in the browser it came from: the
 * browser id is that pane's client id, exact where the shell's "A" is not (TASK-294). A start
 * that presents a walkthrough is told what it says by the server, from the board that pane is
 * showing (TASK-251).
 * @param pending The session being started.
 * @param presentation The walkthrough the start presents and whether it is recorded, or undefined.
 * @returns The walkthrough to present, or null for an ordinary session.
 */
function narrationOfStart(
	pending: ActiveRealtime,
	presentation: RealtimeStartCommand["presentation"],
): RealtimePresentation | null {
	bindVoicePane(pending.paneId, pending.browserId);
	if (presentation === undefined) {
		forgetNarration(pending.paneId);
		return null;
	}
	return narrationFor(
		pending.paneId,
		pending.browserId,
		presentation.walkthrough,
		presentation.recording === true,
	);
}

/**
 * The refusal of a recording while voice is live on the server, kept in the start trace: a
 * recording needs the voice to itself, and taking it would stop somebody who is talking.
 * @returns The refusal to throw.
 */
function recordingRefusal(): CodexWorkbenchGatewayError {
	// The browser is told the gateway's own sentence for this code; this one is for the trace.
	const refusal = new CodexWorkbenchGatewayError(
		"voice_live",
		"A recording was refused because voice is live on the Archboard server.",
	);
	voiceStartTrace.note("refused", { message: traceMessage(refusal) });
	return refusal;
}

/**
 * Open a narration's first step in its pane. A recording's page opens its own, so a recording
 * is asked for nothing.
 * @param presentation The walkthrough the session presents, or null.
 * @param paneId The pane it presents in.
 */
function openFirstStep(presentation: RealtimePresentation | null, paneId: string): void {
	if (presentation === null || presentation.recording) {
		return;
	}
	openNarration(paneId).catch((error: unknown) => {
		voiceStartTrace.note("narration_failed", { message: traceMessage(error) });
	});
}

/**
 * Own one continuous server realtime session for one exact browser socket
 * binding.
 * @param components The coordinator, the realtime adapter, and the workhorse.
 * @returns The actions.
 */
export function createServerRealtimeActions(
	components: RealtimeComponents,
): BrowserRealtimeActions {
	let activeRealtime: ActiveRealtime | null = null;
	// The coordinator thread the last session started on, which no later session may start on.
	let voicedCoordinator: ThreadId | null = null;
	let realtimeQueue = Promise.resolve();
	// The start trace keeps every state the session moves through and every diagnostic it raises.
	components.realtime.onSemanticEvent((event) => {
		if (event.kind === "diagnostic") {
			voiceStartTrace.note("diagnostic", { code: event.code, message: event.message });
		}
		if (event.kind !== "state") {
			return;
		}
		voiceStartTrace.note("state", { phase: event.state.phase, reason: event.state.reason });
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
	 * Make room for a new session: stop the one running, or refuse a recording while one is.
	 *
	 * Live means the adapter still holds the session. One Codex ended by itself leaves the server's
	 * record of it behind until something stops it, and refusing a recording over that would say
	 * voice is live when nobody is talking.
	 * @param recording Whether the new session is a recording.
	 */
	const makeRoom = async (recording: boolean): Promise<void> => {
		if (activeRealtime === null) {
			return;
		}
		if (recording && components.realtime.generation() !== null) {
			throw recordingRefusal();
		}
		await stopActive();
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
				onRetired: noteRetirement,
			});
		} catch (error) {
			const refusal = new Error(
				`Voice could not start a fresh coordinator: ${traceMessage(error)}`,
				{ cause: error },
			);
			voiceStartTrace.note("refused", { message: traceMessage(refusal) });
			throw refusal;
		}
		voiceStartTrace.note("coordinator_replaced", {
			coordinatorState: components.coordinator.snapshot().state,
		});
	};
	/**
	 * The realtime session one command may act on, refused when the handle no
	 * longer names this exact browser binding.
	 * @param handle The handle the command named.
	 * @param context The pane and the link it named.
	 * @param socketBound Whether the command must come from the session's own
	 * socket; only stopping may come from any pane of the server.
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
	 * workhorse are both on this pane's linked thread.
	 * @param commandId The command starting it, which is also its handle.
	 * @param context The pane and the link it named.
	 * @returns The session, not yet offered.
	 */
	const pendingRealtime = (
		commandId: BrowserActionContext["commandId"],
		context: BrowserActionContext,
	): ActiveRealtime => {
		const coordinator = components.coordinator.snapshot();
		const threadId = context.link.threadId;
		const coordinatorThreadId = coordinator.threadId;
		const workhorse = components.workhorse.snapshot();
		// Which of the conditions a refusal turned on is the first thing anybody asks.
		voiceStartTrace.note("preconditions", {
			linkedThread: threadId !== null,
			coordinatorState: coordinator.state,
			coordinatorReason: coordinator.reason,
			coordinatorReady: coordinatorReadyFor(coordinator, context),
			workhorseState: workhorse.state,
			workhorseReady: threadId !== null && workhorseReadyFor(workhorse, threadId),
		});
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
			paneId: context.paneId,
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
	 * @param context The pane and the link it named.
	 * @returns The session, not yet offered.
	 */
	const tracedPending = (
		commandId: BrowserActionContext["commandId"],
		context: BrowserActionContext,
	): ActiveRealtime => {
		try {
			return pendingRealtime(commandId, context);
		} catch (error) {
			voiceStartTrace.note("refused", { message: traceMessage(error) });
			throw error;
		}
	};

	const actions: BrowserRealtimeActions = {
		/**
		 * Start voice for one pane, replacing whatever session was running; a recording is
		 * refused instead while one is.
		 * @param command The offer.
		 * @param context The pane and the link it named.
		 * @returns The answer, and the handle the pane holds the session by.
		 */
		start: (command, context) =>
			serialize(async () => {
				const recording = command.presentation?.recording === true;
				voiceStartTrace.begin(context.paneId);
				voiceStartTrace.note("requested", {
					narration: command.presentation !== undefined,
					recording,
					offerSdpBytes: Buffer.byteLength(command.sdp),
					replacesSession: activeRealtime !== null,
				});
				await makeRoom(recording);
				await freshCoordinator();
				const pending = tracedPending(command.commandId, context);
				activeRealtime = pending;
				voicedCoordinator = pending.coordinatorThreadId;
				try {
					const presentation = narrationOfStart(pending, command.presentation);
					// Creating the offer subscribes the session to this pane's narration before it
					// returns, so the first step, asked of the pane now while Codex starts the
					// session, reaches the voice model the way every later step does. A recording's
					// page opens the first step itself, which reaches it the same way.
					const answering = components.realtime.createOffer(
						{
							sessionId: pending.sessionId,
							correlationId: pending.correlationId,
							sdp: command.sdp,
						},
						presentation,
					);
					openFirstStep(presentation, pending.paneId);
					const realtimeAnswer = await answering;
					requireActive(pending.handle, context);
					voiceStartTrace.note("answered", {
						answerSdpBytes: Buffer.byteLength(realtimeAnswer.sdp),
					});
					return {
						outcome: "delivered" as const,
						realtimeAnswer,
						realtimeSessionHandle: pending.handle,
					};
				} catch (error) {
					voiceStartTrace.note("failed", { message: traceMessage(error) });
					if (activeRealtime === pending) {
						activeRealtime = null;
					}
					throw error;
				}
			}),
		/**
		 * Say something into the running session as typed text.
		 * @param command The handle and the text.
		 * @param context The pane and the link it named.
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
		 * Stop the session, from whichever pane holds the lease: the server has
		 * one conversation, and ending its voice needs no media of its own.
		 * @param command The handle.
		 * @param context The pane and the link it named.
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
		 * @param context The pane and its connection.
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
