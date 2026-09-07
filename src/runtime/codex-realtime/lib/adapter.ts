import { watchCatalogueUpdates } from "@/runtime/codex-realtime/lib/catalogue-updates";
import {
	INITIAL_REALTIME_STATE,
	transitionRealtimeState,
	type AnswerSdp,
	type AppendOutcome,
	type AppendSpeechRequest,
	type AppendTextRequest,
	type CommandOutcome,
	type CreateOfferSdp,
	type RealtimeCorrelation,
	type RealtimeDiagnosticCode,
	type RealtimeSemanticEvent,
	type RealtimeSemanticEventListener,
	type RealtimeState,
	type RealtimeTranscriptRecord,
} from "@/shared/codex-realtime-host";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import type {
	CodexRealtimeAdapter,
	CodexRealtimeAdapterOptions,
} from "@/runtime/codex-realtime/lib/contract";
import { sameRealtimeBinding } from "@/runtime/codex-realtime/lib/binding";
import { runRealtimeMutation } from "@/runtime/codex-realtime/lib/mutation";
import {
	failStart,
	settleAnswer,
	startNegotiation,
} from "@/runtime/codex-realtime/lib/negotiation";
import { reduceRealtimeNotification } from "@/runtime/codex-realtime/lib/notifications";
import * as phase from "@/runtime/codex-realtime/lib/phase";
import { exactNotification, orderedRecords } from "@/runtime/codex-realtime/lib/records";
import { recoverRealtimeSession } from "@/runtime/codex-realtime/lib/recovery";
import type { RealtimeSessionOps } from "@/runtime/codex-realtime/lib/session-ops";
import { realtimeGeneration, type ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * The server half of one browser realtime session: it owns at most one active session, turns
 * Codex notifications into state and transcript events, and answers the browser's requests with
 * outcomes that say whether Codex actually received them.
 * @param options - The session, identity authority, brief source and binding source.
 * @returns The adapter.
 */
export function createCodexRealtimeAdapter(
	options: CodexRealtimeAdapterOptions,
): CodexRealtimeAdapter {
	const listeners = new Set<RealtimeSemanticEventListener>();
	let active: ActiveRealtimeSession | null = null;
	let retainedTranscript: readonly RealtimeTranscriptRecord[] = [];
	let disposed = false;

	/**
	 * Deliver one event to every listener; a listener that throws cannot stop protocol reduction.
	 * @param event - The event to deliver.
	 */
	const emit = (event: RealtimeSemanticEvent): void => {
		for (const listener of Array.from(listeners)) {
			try {
				listener(event);
			} catch {
				// A presentation listener cannot take ownership of protocol reduction.
			}
		}
	};

	/**
	 * Publish a diagnostic for the session.
	 * @param session - The session the diagnostic concerns.
	 * @param code - Which layer failed.
	 * @param message - The failure text.
	 */
	const emitDiagnostic = (
		session: ActiveRealtimeSession,
		code: RealtimeDiagnosticCode,
		message: string,
	): void => {
		emit({
			kind: "diagnostic",
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			code,
			message,
		});
	};

	/**
	 * Apply one state transition through the shared transition table and publish the result.
	 * @param session - The session to transition.
	 * @param value - The requested next state.
	 */
	const state = (session: ActiveRealtimeSession, value: RealtimeState): void => {
		session.state = transitionRealtimeState(session.state, value);
		emit({
			kind: "state",
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			state: session.state,
		});
	};

	/**
	 * Apply several state transitions in order.
	 * @param session - The session to transition.
	 * @param values - The requested next states.
	 */
	const states = (session: ActiveRealtimeSession, values: readonly RealtimeState[]): void => {
		for (const value of values) {
			state(session, value);
		}
	};

	/**
	 * Keep the session's transcript readable after it ends and release it as the active session.
	 * @param session - The session to retire.
	 */
	const retire = (session: ActiveRealtimeSession): void => {
		retainedTranscript = orderedRecords(session);
		if (active === session) {
			session.stopCatalogueUpdates?.();
			active = null;
		}
	};

	/**
	 * Close the session: walk it to closed, retire it, and reject a still-pending answer.
	 * @param session - The session to close.
	 */
	const finalize = (session: ActiveRealtimeSession): void => {
		session.stopCatalogueUpdates?.();
		states(session, phase.closingStates(session.state));
		if (!session.answerSettled) {
			session.answerSettled = true;
			session.rejectAnswer(
				new Error("Codex closed the realtime session before negotiation completed."),
			);
		}
		retire(session);
	};

	/**
	 * Whether the session is still the live one under a binding that has not changed and an
	 * epoch that is still current.
	 * @param session - The session to check.
	 * @returns True when every delivery to the session is still meaningful.
	 */
	const bindingIsCurrent = (session: ActiveRealtimeSession): boolean => {
		const current = options.currentBinding();
		return (
			!disposed &&
			active === session &&
			current !== null &&
			sameRealtimeBinding(session.binding, current) &&
			options.identity.validator.isCurrentEpoch(session.binding.child, session.binding.epoch)
		);
	};

	/**
	 * Whether a browser request names the live session exactly.
	 * @param session - The session to check.
	 * @param request - The browser request.
	 * @returns True when the request may act on the session.
	 */
	const requestIsCurrent = (
		session: ActiveRealtimeSession,
		request: RealtimeCorrelation,
	): boolean =>
		bindingIsCurrent(session) &&
		request.sessionId === session.browserSessionId &&
		request.correlationId === session.correlationId;

	/**
	 * Publish the session's whole ordered transcript, one record per event.
	 * @param session - The session whose transcript to publish.
	 */
	const publishTranscript = (session: ActiveRealtimeSession): void => {
		for (const record of orderedRecords(session)) {
			emit({ kind: "transcript", record });
		}
	};

	const ops: RealtimeSessionOps = {
		options,
		emitDiagnostic,
		state,
		states,
		publishTranscript,
		/**
		 * Settle the answer through the negotiation reducer.
		 * @param session - The session whose answer may be ready.
		 */
		settleAnswer: (session) => {
			settleAnswer(ops, session);
		},
		finalize,
		retire,
		bindingIsCurrent,
		requestIsCurrent,
	};

	/**
	 * Watch catalogue changes for this session, refusing the offer if the watch cannot start.
	 * @param session The newly active session.
	 * @returns Whether the watch was installed.
	 */
	const installCatalogueUpdates = (session: ActiveRealtimeSession): boolean => {
		try {
			session.stopCatalogueUpdates = watchCatalogueUpdates(
				options,
				session,
				session.boardCatalogue,
				() => bindingIsCurrent(session),
				(message) => emitDiagnostic(session, "coordinator", message),
			);
		} catch (error) {
			active = null;
			session.rejectAnswer(error instanceof Error ? error : new Error(String(error)));
			return false;
		}
		return true;
	};

	/**
	 * Accept the browser's offer, open the one active session and start negotiation with Codex.
	 * @param offer - The browser's offer SDP and correlation.
	 * @returns The answer SDP once Codex has started the session.
	 */
	const createOffer = (offer: CreateOfferSdp): Promise<AnswerSdp> => {
		if (disposed) {
			return Promise.reject(new Error("The Codex realtime adapter is disposed."));
		}
		if (active !== null) {
			return Promise.reject(new Error("A Codex realtime session is already active."));
		}
		const binding = options.currentBinding();
		if (
			binding === null ||
			!options.identity.validator.isCurrentEpoch(binding.child, binding.epoch)
		) {
			return Promise.reject(new Error("The linked Codex coordinator is not current."));
		}
		let resolveAnswer!: (answer: AnswerSdp) => void;
		let rejectAnswer!: (error: Error) => void;
		const answer = new Promise<AnswerSdp>((resolve, reject) => {
			resolveAnswer = resolve;
			rejectAnswer = reject;
		});
		const wireSessionId = options.identity.issuer.mintRealtimeSessionId();
		const session: ActiveRealtimeSession = {
			binding,
			browserSessionId: offer.sessionId,
			correlationId: offer.correlationId,
			wireSessionId,
			semanticBrief: options.freshSemanticBrief(wireSessionId),
			boardCatalogue: options.boardCatalogue.read(),
			answer,
			resolveAnswer,
			rejectAnswer,
			entries: new Map(),
			state: INITIAL_REALTIME_STATE,
			startReturned: false,
			started: false,
			answerSdp: null,
			answerSettled: false,
			nextLiveOrder: 1_000_000_000,
			stopCatalogueUpdates: null,
		};
		active = session;
		if (!installCatalogueUpdates(session)) return answer;
		retainedTranscript = [];
		state(session, { phase: "requesting_permission", reason: "start_requested" });
		state(session, { phase: "negotiating", reason: "permission_granted" });
		state(session, { phase: "negotiating", reason: "offer_created" });
		startNegotiation(ops, session, offer.sdp);
		return answer;
	};

	/**
	 * Reduce a server notification when it belongs exactly to the live session.
	 * @param event - The correlated notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		const session = active;
		if (
			session === null ||
			!exactNotification(session, event, options.identity.decoder) ||
			!bindingIsCurrent(session)
		) {
			return;
		}
		reduceRealtimeNotification(ops, session, event.notification);
	};

	/**
	 * Run one mutation for a browser request, diagnosing failures under the layer that owns them.
	 * @param session - The live session.
	 * @param request - The browser request.
	 * @param invoke - Performs the mutation.
	 * @param kind - Whether an append (realtime layer) or a command (app-server layer).
	 * @returns The outcome to report.
	 */
	const mutationOutcome = async (
		session: ActiveRealtimeSession,
		request: RealtimeCorrelation,
		invoke: () => Promise<unknown>,
		kind: "append" | "command",
	): Promise<AppendOutcome> =>
		runRealtimeMutation(
			request,
			invoke,
			() => requestIsCurrent(session, request),
			(message) => emitDiagnostic(session, kind === "append" ? "realtime" : "app_server", message),
		);

	/**
	 * The active session when a browser request names it.
	 * @param request - The browser request.
	 * @returns The session, or null when the request names no live session.
	 */
	const currentFor = (request: RealtimeCorrelation): ActiveRealtimeSession | null => {
		const session = active;
		return session !== null &&
			request.sessionId === session.browserSessionId &&
			request.correlationId === session.correlationId
			? session
			: null;
	};

	/**
	 * Advance the phase once an append was delivered, since Codex now holds new input.
	 * @param session - The live session.
	 * @param outcome - The append outcome.
	 * @returns The same outcome.
	 */
	const afterAppend = (session: ActiveRealtimeSession, outcome: AppendOutcome): AppendOutcome => {
		if (outcome.outcome === "delivered") {
			states(session, phase.inputStates(session.state));
		}
		return outcome;
	};

	/**
	 * Append typed user text to the live session.
	 * @param request - The text and its correlation.
	 * @returns The append outcome.
	 */
	const appendText = (request: AppendTextRequest): Promise<AppendOutcome> => {
		const session = currentFor(request);
		if (session === null) {
			return Promise.resolve({ ...request, outcome: "not_delivered", reason: "not_ready" });
		}
		return mutationOutcome(
			session,
			request,
			() =>
				options.session.realtimeAppendText({
					threadId: session.binding.coordinatorThreadId,
					text: request.text,
					role: "user",
				}),
			"append",
		).then((outcome) => afterAppend(session, outcome));
	};

	/**
	 * Append a transcribed speech segment to the live session.
	 * @param request - The speech text and its correlation.
	 * @returns The append outcome.
	 */
	const appendSpeech = (request: AppendSpeechRequest): Promise<AppendOutcome> => {
		const session = currentFor(request);
		if (session === null) {
			return Promise.resolve({ ...request, outcome: "not_delivered", reason: "not_ready" });
		}
		return mutationOutcome(
			session,
			request,
			() =>
				options.session.realtimeAppendSpeech({
					threadId: session.binding.coordinatorThreadId,
					text: request.text,
				}),
			"append",
		).then((outcome) => afterAppend(session, outcome));
	};

	/**
	 * Stop the live session; only a confirmed stop closes it, anything else leaves a recoverable
	 * error so the browser can decide.
	 * @param request - The stop request.
	 * @returns The command outcome.
	 */
	const stop: CodexRealtimeAdapter["stop"] = async (request) => {
		const session = currentFor(request);
		if (session === null) {
			return { ...request, outcome: "not_delivered", reason: "not_ready" };
		}
		const stopping = phase.stopState(session.state);
		if (stopping === null) {
			return { ...request, outcome: "not_delivered", reason: "not_ready" };
		}
		state(session, stopping);
		session.stopCatalogueUpdates?.();
		const outcome: CommandOutcome = await mutationOutcome(
			session,
			request,
			() => options.session.realtimeStop({ threadId: session.binding.coordinatorThreadId }),
			"command",
		);
		if (active !== session) {
			return outcome;
		}
		if (outcome.outcome === "delivered") {
			finalize(session);
		} else {
			state(session, {
				phase: "recoverable_error",
				reason: "stop_failed",
				message: "Codex did not confirm that the realtime session stopped.",
			});
		}
		return outcome;
	};

	/**
	 * Recover the live session's transcript from the coordinator thread's timeline.
	 * @param request - The recovery request.
	 * @returns The command outcome.
	 */
	const recover: CodexRealtimeAdapter["recover"] = (request) => {
		const session = currentFor(request);
		if (session === null) {
			return Promise.resolve({ ...request, outcome: "not_delivered", reason: "not_ready" });
		}
		return recoverRealtimeSession(ops, session, request);
	};

	return Object.freeze({
		createOffer,
		/**
		 * Subscribe to state, transcript and diagnostic events.
		 * @param listener - The subscriber.
		 * @returns Unsubscribes the listener.
		 */
		onSemanticEvent: (listener: RealtimeSemanticEventListener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		appendText,
		appendSpeech,
		stop,
		recover,
		onNotification,
		/**
		 * The live session's transcript, or the last session's once it ended.
		 * @returns The ordered transcript records.
		 */
		transcript: () => (active === null ? retainedTranscript : orderedRecords(active)),
		/**
		 * The live session's generation identity.
		 * @returns The generation, or null with no live session.
		 */
		generation: () => (active === null ? null : realtimeGeneration(active)),
		/**
		 * Drop listeners, retain the live transcript and reject a still-pending start.
		 */
		dispose: () => {
			disposed = true;
			listeners.clear();
			if (active !== null) {
				active.stopCatalogueUpdates?.();
				retainedTranscript = orderedRecords(active);
			}
			if (active !== null && !active.answerSettled) {
				failStart(ops, active, new Error("The Codex realtime adapter was disposed."));
			}
			active = null;
		},
	});
}
