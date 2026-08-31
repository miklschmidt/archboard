import {
	parseRealtimeItemId,
	type AnswerSdp,
	type AppendOutcome,
	type AppendSpeechRequest,
	type AppendTextRequest,
	type CommandOutcome,
	type CreateOfferSdp,
	type RealtimeCorrelationId,
	type RealtimeSemanticEvent,
	type RealtimeSemanticEventListener,
	type RealtimeSessionId as BrowserRealtimeSessionId,
	type RealtimeTranscriptRecord,
	type RemoteMediaAttachment,
} from "../../../shared/codex-realtime-host/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type { CodexRealtimeAdapter, CodexRealtimeAdapterOptions } from "./contract.js";
import { realtimeErrorMessage, sameRealtimeBinding } from "./binding.js";
import { createRealtimeStartParams } from "./start-policy.js";
import type { ActiveRealtimeSession } from "./state.js";
const TIMELINE_PAGE_LIMIT = 100;

function orderedRecords(session: ActiveRealtimeSession): readonly RealtimeTranscriptRecord[] {
	return [...session.entries.values()]
		.toSorted((left, right) => left.order - right.order || left.itemId.localeCompare(right.itemId))
		.map((entry, sequence) => ({
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			itemId: entry.itemId,
			sequence,
			role: entry.role,
			status: entry.status,
			text: entry.text,
		}));
}

function exactNotification(
	session: ActiveRealtimeSession,
	event: TransportServerNotification,
): boolean {
	return (
		event.correlation.child === session.binding.child &&
		event.correlation.epoch === session.binding.epoch &&
		"threadId" in event.notification.params &&
		event.notification.params.threadId === session.binding.coordinatorThreadId
	);
}

export function createCodexRealtimeAdapter(
	options: CodexRealtimeAdapterOptions,
): CodexRealtimeAdapter {
	const listeners = new Set<RealtimeSemanticEventListener>();
	let active: ActiveRealtimeSession | null = null;
	let retainedTranscript: readonly RealtimeTranscriptRecord[] = [];
	let disposed = false;
	const emit = (event: RealtimeSemanticEvent): void => {
		for (const listener of Array.from(listeners)) {
			try {
				listener(event);
			} catch {
				// A presentation listener cannot take ownership of protocol reduction.
			}
		}
	};
	const emitDiagnostic = (
		session: ActiveRealtimeSession,
		code: "realtime" | "app_server" | "coordinator" | "protocol",
		message: string,
	): void =>
		emit({
			kind: "diagnostic",
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			code,
			message,
		});
	const emitState = (
		session: ActiveRealtimeSession,
		state: RealtimeSemanticEvent & { kind: "state" },
	): void => emit(state);
	const state = (
		session: ActiveRealtimeSession,
		value: Extract<RealtimeSemanticEvent, { kind: "state" }>["state"],
	): void =>
		emitState(session, {
			kind: "state",
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			state: value,
		});
	const bindingIsCurrent = (session: ActiveRealtimeSession): boolean => {
		const current = options.currentBinding();
		return (
			!disposed &&
			current !== null &&
			sameRealtimeBinding(session.binding, current) &&
			options.identity.validator.isCurrentEpoch(session.binding.child, session.binding.epoch)
		);
	};

	const requestIsCurrent = (
		session: ActiveRealtimeSession,
		request: {
			readonly sessionId: BrowserRealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
		},
	): boolean =>
		bindingIsCurrent(session) &&
		request.sessionId === session.browserSessionId &&
		request.correlationId === session.correlationId;

	const publishTranscript = (session: ActiveRealtimeSession): void => {
		for (const record of orderedRecords(session)) emit({ kind: "transcript", record });
	};

	const settleAnswer = (session: ActiveRealtimeSession): void => {
		if (
			session.answerSettled ||
			!session.startReturned ||
			!session.started ||
			session.answerSdp === null
		)
			return;
		if (!bindingIsCurrent(session)) {
			session.answerSettled = true;
			session.rejectAnswer(new Error("The realtime coordinator identity changed during start."));
			return;
		}
		session.answerSettled = true;
		state(session, { phase: "listening", reason: "negotiation_succeeded" });
		session.resolveAnswer({
			sessionId: session.browserSessionId,
			correlationId: session.correlationId,
			sdp: session.answerSdp,
		});
	};

	const failStart = (session: ActiveRealtimeSession, error: unknown): void => {
		if (session.answerSettled) return;
		session.answerSettled = true;
		emitDiagnostic(session, "app_server", realtimeErrorMessage(error));
		state(session, {
			phase: "recoverable_error",
			reason: "app_server_unavailable",
			message: realtimeErrorMessage(error),
		});
		session.rejectAnswer(error instanceof Error ? error : new Error(realtimeErrorMessage(error)));
	};

	const createOffer = (offer: CreateOfferSdp): Promise<AnswerSdp> => {
		if (disposed) return Promise.reject(new Error("The Codex realtime adapter is disposed."));
		if (active !== null)
			return Promise.reject(new Error("A Codex realtime session is already active."));
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
		const session: ActiveRealtimeSession = {
			binding,
			browserSessionId: offer.sessionId,
			correlationId: offer.correlationId,
			wireSessionId: options.identity.issuer.mintRealtimeSessionId(),
			answer,
			resolveAnswer,
			rejectAnswer,
			entries: new Map(),
			startReturned: false,
			started: false,
			answerSdp: null,
			answerSettled: false,
			nextLiveOrder: 1_000_000_000,
		};
		active = session;
		retainedTranscript = [];
		state(session, { phase: "negotiating", reason: "offer_created" });
		const semanticBrief = options.freshSemanticBrief();
		void options.session
			.realtimeStart(
				createRealtimeStartParams({
					threadId: binding.coordinatorThreadId,
					realtimeSessionId: session.wireSessionId,
					sdp: offer.sdp,
					semanticBrief,
				}),
			)
			.then(
				() => {
					session.startReturned = true;
					return settleAnswer(session);
				},
				(error: unknown) => failStart(session, error),
			);
		return answer;
	};

	const upsertLiveItem = (
		session: ActiveRealtimeSession,
		item: {
			readonly id: string;
			readonly realtimeSessionId: string;
			readonly type: string;
			readonly role?: RealtimeTranscriptRecord["role"];
			readonly text?: string;
		},
		status: RealtimeTranscriptRecord["status"],
	): void => {
		if (item.realtimeSessionId !== session.wireSessionId || item.type !== "transcriptSegment")
			return;
		if (item.role === undefined || item.text === undefined) return;
		const itemId = parseRealtimeItemId(item.id);
		const existing = session.entries.get(itemId);
		session.entries.set(itemId, {
			itemId,
			role: item.role,
			status,
			text: item.text,
			order: existing?.order ?? session.nextLiveOrder++,
		});
		if (item.role === "assistant") {
			if (status === "final") state(session, { phase: "listening", reason: "assistant_finished" });
			else state(session, { phase: "speaking", reason: "assistant_started" });
		} else if (status === "final") {
			state(session, { phase: "processing", reason: "input_completed" });
		}
		publishTranscript(session);
	};

	const onNotification = (event: TransportServerNotification): void => {
		const session = active;
		if (!session || !exactNotification(session, event) || !bindingIsCurrent(session)) return;
		const notification = event.notification;
		switch (notification.method) {
			case "thread/realtime/sdp":
				session.answerSdp = notification.params.sdp;
				settleAnswer(session);
				break;
			case "thread/realtime/started":
				if (
					notification.params.realtimeSessionId !== session.wireSessionId ||
					notification.params.version !== "v3"
				) {
					emitDiagnostic(
						session,
						"protocol",
						"Codex reported a mismatched realtime start identity.",
					);
					return;
				}
				session.started = true;
				settleAnswer(session);
				break;
			case "thread/realtime/item/started":
				upsertLiveItem(session, notification.params.item, "provisional");
				break;
			case "thread/realtime/item/transcript/delta": {
				const itemId = parseRealtimeItemId(notification.params.itemId);
				const entry = session.entries.get(itemId);
				if (entry) {
					entry.text += notification.params.delta;
					entry.status = "provisional";
					publishTranscript(session);
				}
				break;
			}
			case "thread/realtime/item/completed":
				upsertLiveItem(session, notification.params.item, "final");
				if (
					notification.params.item.type === "realtimeSessionClosed" &&
					notification.params.item.realtimeSessionId === session.wireSessionId
				) {
					if (notification.params.item.outcome === "failed")
						emitDiagnostic(session, "realtime", "Codex closed the realtime session as failed.");
					state(session, { phase: "closed", reason: "stopped" });
				}
				break;
			case "thread/realtime/error":
				emitDiagnostic(session, "app_server", notification.params.message);
				state(session, {
					phase: "recoverable_error",
					reason: "realtime_unavailable",
					message: notification.params.message,
				});
				break;
			case "thread/realtime/closed":
				emitDiagnostic(
					session,
					"realtime",
					notification.params.reason ?? "Codex closed the realtime session.",
				);
				state(session, { phase: "closed", reason: "stopped" });
				break;
			case "thread/realtime/itemAdded":
			case "thread/realtime/transcript/delta":
			case "thread/realtime/transcript/done":
			case "thread/realtime/outputAudio/delta":
				emitDiagnostic(
					session,
					"protocol",
					`${notification.method} is outside the WebRTC item-scoped contract.`,
				);
				break;
		}
	};

	const mutationOutcome = async (
		session: ActiveRealtimeSession,
		request: {
			readonly sessionId: BrowserRealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
		},
		invoke: () => Promise<unknown>,
		kind: "append" | "command",
	): Promise<AppendOutcome> => {
		if (!requestIsCurrent(session, request)) {
			return { ...request, outcome: "not_delivered", reason: "stale_session" };
		}
		try {
			await invoke();
			if (!requestIsCurrent(session, request))
				return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
			return { ...request, outcome: "delivered" };
		} catch (error) {
			const outcome: AppendOutcome =
				error instanceof CodexSessionMutationError && error.outcome === "not_delivered"
					? { ...request, outcome: "not_delivered", reason: "rejected" }
					: {
							...request,
							outcome: "outcome_unknown",
							reason:
								error instanceof CodexSessionMutationError ? "response_lost" : "transport_failure",
						};
			emitDiagnostic(
				session,
				kind === "append" ? "realtime" : "app_server",
				realtimeErrorMessage(error),
			);
			return outcome;
		}
	};

	const currentFor = (request: {
		readonly sessionId: BrowserRealtimeSessionId;
		readonly correlationId: RealtimeCorrelationId;
	}): ActiveRealtimeSession | null => {
		const session = active;
		return session &&
			request.sessionId === session.browserSessionId &&
			request.correlationId === session.correlationId
			? session
			: null;
	};

	const appendText = (request: AppendTextRequest): Promise<AppendOutcome> => {
		const session = currentFor(request);
		if (!session)
			return Promise.resolve({ ...request, outcome: "not_delivered", reason: "not_ready" });
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
		).then((outcome) => {
			if (outcome.outcome === "delivered")
				state(session, { phase: "processing", reason: "input_completed" });
			return outcome;
		});
	};

	const appendSpeech = (request: AppendSpeechRequest): Promise<AppendOutcome> => {
		const session = currentFor(request);
		if (!session)
			return Promise.resolve({ ...request, outcome: "not_delivered", reason: "not_ready" });
		return mutationOutcome(
			session,
			request,
			() =>
				options.session.realtimeAppendSpeech({
					threadId: session.binding.coordinatorThreadId,
					text: request.text,
				}),
			"append",
		);
	};

	const stop: CodexRealtimeAdapter["stop"] = async (request) => {
		const session = currentFor(request);
		if (!session) return { ...request, outcome: "not_delivered", reason: "not_ready" };
		state(session, { phase: "stopping", reason: "stop_requested" });
		const outcome: CommandOutcome = await mutationOutcome(
			session,
			request,
			() => options.session.realtimeStop({ threadId: session.binding.coordinatorThreadId }),
			"command",
		);
		if (outcome.outcome === "delivered") {
			state(session, { phase: "closed", reason: "stopped" });
			retainedTranscript = orderedRecords(session);
			if (active === session) active = null;
		} else {
			state(session, {
				phase: "recoverable_error",
				reason: "stop_failed",
				message: "Codex did not confirm that the realtime session stopped.",
			});
		}
		return outcome;
	};

	const recover: CodexRealtimeAdapter["recover"] = async (request) => {
		const session = currentFor(request);
		if (!session) return { ...request, outcome: "not_delivered", reason: "not_ready" };
		const cursors = new Set<string>();
		let cursor: string | null = null;
		try {
			for (;;) {
				if (!requestIsCurrent(session, request))
					return { ...request, outcome: "not_delivered", reason: "stale_session" };
				const page = await options.session.timelineListPage({
					threadId: session.binding.coordinatorThreadId,
					cursor,
					limit: TIMELINE_PAGE_LIMIT,
				});
				if (!requestIsCurrent(session, request))
					return { ...request, outcome: "outcome_unknown", reason: "response_lost" };
				if (
					page.activeRealtimeSessionAtPageStart !== null &&
					page.activeRealtimeSessionAtPageStart !== session.wireSessionId
				)
					throw new Error("Timeline recovery belongs to another realtime session.");
				for (const entry of page.data) {
					if (entry.type !== "realtime" || entry.item.type !== "transcriptSegment") continue;
					if (entry.item.realtimeSessionId !== session.wireSessionId) continue;
					const itemId = parseRealtimeItemId(entry.item.id);
					session.entries.set(itemId, {
						itemId,
						role: entry.item.role,
						status: "final",
						text: entry.item.text,
						order: entry.position,
					});
				}
				if (page.nextCursor === null) break;
				if (cursors.has(page.nextCursor))
					throw new Error("Timeline recovery cursor loop detected.");
				cursors.add(page.nextCursor);
				cursor = page.nextCursor;
			}
			publishTranscript(session);
			state(session, { phase: "idle", reason: "recovered" });
			return { ...request, outcome: "delivered" };
		} catch (error) {
			emitDiagnostic(session, "protocol", realtimeErrorMessage(error));
			state(session, {
				phase: "recoverable_error",
				reason: "recovery_failed",
				message: realtimeErrorMessage(error),
			});
			return { ...request, outcome: "outcome_unknown", reason: "transport_failure" };
		}
	};

	return Object.freeze({
		createOffer,
		attachRemoteMedia: (attachment: RemoteMediaAttachment) => options.attachRemoteMedia(attachment),
		onSemanticEvent: (listener: RealtimeSemanticEventListener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		appendText,
		appendSpeech,
		stop,
		recover,
		onNotification,
		transcript: () => (active ? orderedRecords(active) : retainedTranscript),
		dispose: () => {
			disposed = true;
			listeners.clear();
			if (active) retainedTranscript = orderedRecords(active);
			if (active && !active.answerSettled)
				failStart(active, new Error("The Codex realtime adapter was disposed."));
			active = null;
		},
	});
}
