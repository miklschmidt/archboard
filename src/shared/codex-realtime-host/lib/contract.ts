import { z } from "zod";

import { CANONICAL_ITEM_ID_MAX_LENGTH } from "@/shared/codex-workbench-identity/index";

const BrowserRealtimeIdentitySchemas = {
	session: z.string().brand<"BrowserRealtimeSessionId">(),
	correlation: z.string().brand<"BrowserRealtimeCorrelationId">(),
	item: z
		.string()
		.min(1)
		.max(CANONICAL_ITEM_ID_MAX_LENGTH)
		.refine((value) => !value.includes("\0"))
		.brand<"BrowserRealtimeItemId">(),
};

type RealtimeSessionId = z.infer<typeof BrowserRealtimeIdentitySchemas.session>;
type RealtimeCorrelationId = z.infer<typeof BrowserRealtimeIdentitySchemas.correlation>;
type RealtimeItemId = z.infer<typeof BrowserRealtimeIdentitySchemas.item>;

/**
 * Narrows an untrusted value to a realtime session id.
 *
 * @param value - The raw value from the wire.
 * @returns The validated session id.
 * @throws {ZodError} when the value is not a well-formed session id.
 */
function parseRealtimeSessionId(value: unknown): RealtimeSessionId {
	return BrowserRealtimeIdentitySchemas.session.parse(value);
}

/**
 * Narrows an untrusted value to a realtime correlation id.
 *
 * @param value - The raw value from the wire.
 * @returns The validated correlation id.
 * @throws {ZodError} when the value is not a well-formed correlation id.
 */
function parseRealtimeCorrelationId(value: unknown): RealtimeCorrelationId {
	return BrowserRealtimeIdentitySchemas.correlation.parse(value);
}

/**
 * Narrows an untrusted value to a realtime item id.
 *
 * @param value - The raw value from the wire.
 * @returns The validated item id.
 * @throws {ZodError} when the value is not a well-formed item id.
 */
function parseRealtimeItemId(value: unknown): RealtimeItemId {
	return BrowserRealtimeIdentitySchemas.item.parse(value);
}

interface RealtimeCorrelation {
	readonly sessionId: RealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
}
interface CreateOfferSdp extends RealtimeCorrelation {
	readonly sdp: string;
}
interface AnswerSdp extends RealtimeCorrelation {
	readonly sdp: string;
}
interface RemoteMediaAttachment extends RealtimeCorrelation {
	readonly attachTo: (element: HTMLMediaElement) => void;
}
type RealtimeUnsubscribe = () => void;

type RealtimePhase =
	| "idle"
	| "requesting_permission"
	| "negotiating"
	| "listening"
	| "muted"
	| "processing"
	| "speaking"
	| "stopping"
	| "recoverable_error"
	| "terminal_error"
	| "closed";
type RealtimeRecoverableErrorReason =
	| "permission_denied"
	| "device_unavailable"
	| "device_lost"
	| "sdp_failed"
	| "ice_disconnected"
	| "data_channel_closed"
	| "remote_media_failed"
	| "autoplay_suspended"
	| "realtime_unavailable"
	| "app_server_unavailable"
	| "coordinator_unavailable"
	| "append_failed"
	| "recovery_failed"
	| "stop_failed";
type RealtimeTerminalErrorReason =
	| "unsupported_browser"
	| "invalid_session"
	| "protocol_error"
	| "fatal_error";
type RealtimeState =
	| { readonly phase: "idle"; readonly reason: "created" | "recovered" }
	| {
			readonly phase: "requesting_permission";
			readonly reason: "start_requested" | "recovery_requested";
	  }
	| {
			readonly phase: "negotiating";
			readonly reason:
				| "permission_granted"
				| "offer_created"
				| "answer_received"
				| "recovery_requested";
	  }
	| {
			readonly phase: "listening";
			readonly reason:
				| "negotiation_succeeded"
				| "unmute_requested"
				| "processing_complete"
				| "assistant_finished";
	  }
	| { readonly phase: "muted"; readonly reason: "mute_requested" }
	| { readonly phase: "processing"; readonly reason: "input_completed" | "user_interrupted" }
	| { readonly phase: "speaking"; readonly reason: "assistant_started" }
	| { readonly phase: "stopping"; readonly reason: "stop_requested" | "dispose_requested" }
	| {
			readonly phase: "recoverable_error";
			readonly reason: RealtimeRecoverableErrorReason;
			readonly message: string;
	  }
	| {
			readonly phase: "terminal_error";
			readonly reason: RealtimeTerminalErrorReason;
			readonly message: string;
	  }
	| { readonly phase: "closed"; readonly reason: "stopped" | "disposed" };
type RealtimeTransitionReason = RealtimeState["reason"];

type RealtimeTranscriptRole = "user" | "assistant";
type RealtimeTranscriptStatus = "provisional" | "final" | "interrupted";
interface RealtimeTranscriptRecord extends RealtimeCorrelation {
	readonly itemId: RealtimeItemId;
	readonly sequence: number;
	readonly role: RealtimeTranscriptRole;
	readonly status: RealtimeTranscriptStatus;
	readonly text: string;
}
type RealtimeDiagnosticCode =
	| "permission"
	| "device"
	| "sdp"
	| "ice"
	| "remote_media"
	| "data_channel"
	| "realtime"
	| "app_server"
	| "coordinator"
	| "protocol";
type RealtimeSemanticEvent =
	| {
			readonly kind: "state";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly state: RealtimeState;
	  }
	| { readonly kind: "transcript"; readonly record: RealtimeTranscriptRecord }
	| {
			readonly kind: "diagnostic";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly code: RealtimeDiagnosticCode;
			readonly message: string;
	  };
type RealtimeSemanticEventListener = (event: RealtimeSemanticEvent) => void;

interface AppendTextRequest extends RealtimeCorrelation {
	readonly text: string;
}
interface AppendSpeechRequest extends RealtimeCorrelation {
	readonly text: string;
}
interface RealtimeCommandRequest extends RealtimeCorrelation {}
type StopRequest = RealtimeCommandRequest;
type RecoveryRequest = RealtimeCommandRequest;
type AppendNotDeliveredReason = "rejected" | "not_ready" | "stale_session" | "cancelled";
type AppendOutcomeUnknownReason = "transport_failure" | "response_lost";
type CommandNotDeliveredReason = "rejected" | "not_ready" | "stale_session" | "cancelled";
type CommandOutcomeUnknownReason = "transport_failure" | "response_lost";
type AppendOutcomeReason = AppendNotDeliveredReason | AppendOutcomeUnknownReason;
type CommandOutcomeReason = CommandNotDeliveredReason | CommandOutcomeUnknownReason;
type AppendOutcome =
	| (RealtimeCorrelation & { readonly outcome: "delivered" })
	| (RealtimeCorrelation & {
			readonly outcome: "not_delivered";
			readonly reason: AppendNotDeliveredReason;
	  })
	| (RealtimeCorrelation & {
			readonly outcome: "outcome_unknown";
			readonly reason: AppendOutcomeUnknownReason;
	  });
type CommandOutcome =
	| (RealtimeCorrelation & { readonly outcome: "delivered" })
	| (RealtimeCorrelation & {
			readonly outcome: "not_delivered";
			readonly reason: CommandNotDeliveredReason;
	  })
	| (RealtimeCorrelation & {
			readonly outcome: "outcome_unknown";
			readonly reason: CommandOutcomeUnknownReason;
	  });
interface RealtimeHost {
	readonly createOffer: (offer: CreateOfferSdp) => Promise<AnswerSdp>;
	readonly attachRemoteMedia: (attachment: RemoteMediaAttachment) => void;
	readonly onSemanticEvent: (listener: RealtimeSemanticEventListener) => RealtimeUnsubscribe;
	readonly appendText: (request: AppendTextRequest) => Promise<AppendOutcome>;
	readonly appendSpeech: (request: AppendSpeechRequest) => Promise<AppendOutcome>;
	readonly stop: (request: StopRequest) => Promise<CommandOutcome>;
	readonly recover: (request: RecoveryRequest) => Promise<CommandOutcome>;
}

export {
	type RealtimeSessionId,
	type RealtimeCorrelationId,
	type RealtimeItemId,
	parseRealtimeSessionId,
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	type RealtimeCorrelation,
	type CreateOfferSdp,
	type AnswerSdp,
	type RemoteMediaAttachment,
	type RealtimeUnsubscribe,
	type RealtimePhase,
	type RealtimeRecoverableErrorReason,
	type RealtimeTerminalErrorReason,
	type RealtimeState,
	type RealtimeTransitionReason,
	type RealtimeTranscriptRole,
	type RealtimeTranscriptStatus,
	type RealtimeTranscriptRecord,
	type RealtimeDiagnosticCode,
	type RealtimeSemanticEvent,
	type RealtimeSemanticEventListener,
	type AppendTextRequest,
	type AppendSpeechRequest,
	type RealtimeCommandRequest,
	type StopRequest,
	type RecoveryRequest,
	type AppendNotDeliveredReason,
	type AppendOutcomeUnknownReason,
	type CommandNotDeliveredReason,
	type CommandOutcomeUnknownReason,
	type AppendOutcomeReason,
	type CommandOutcomeReason,
	type AppendOutcome,
	type CommandOutcome,
	type RealtimeHost,
};
