declare const browserRealtimeBrand: unique symbol;
type BrowserRealtimeString<Brand extends string> = string & {
	readonly [browserRealtimeBrand]: Brand;
};

export type RealtimeSessionId = BrowserRealtimeString<"session">;
export type RealtimeCorrelationId = BrowserRealtimeString<"correlation">;
export type RealtimeItemId = BrowserRealtimeString<"item">;

export interface RealtimeCorrelation {
	readonly sessionId: RealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
}
export interface CreateOfferSdp extends RealtimeCorrelation {
	readonly sdp: string;
}
export interface AnswerSdp extends RealtimeCorrelation {
	readonly sdp: string;
}
export interface RemoteMediaAttachment extends RealtimeCorrelation {
	readonly attachTo: (element: HTMLMediaElement) => void;
}
export type RealtimeUnsubscribe = () => void;

export type RealtimePhase =
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
export type RealtimeRecoverableErrorReason =
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
export type RealtimeTerminalErrorReason =
	| "unsupported_browser"
	| "invalid_session"
	| "protocol_error"
	| "fatal_error";
export type RealtimeState =
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
export type RealtimeTransitionReason = RealtimeState["reason"];

export type RealtimeTranscriptRole = "user" | "assistant";
export type RealtimeTranscriptStatus = "provisional" | "final" | "interrupted";
export interface RealtimeTranscriptRecord extends RealtimeCorrelation {
	readonly itemId: RealtimeItemId;
	readonly sequence: number;
	readonly role: RealtimeTranscriptRole;
	readonly status: RealtimeTranscriptStatus;
	readonly text: string;
}
export type RealtimeDiagnosticCode =
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
export type RealtimeSemanticEvent =
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
export type RealtimeSemanticEventListener = (event: RealtimeSemanticEvent) => void;

export interface AppendTextRequest extends RealtimeCorrelation {
	readonly text: string;
}
export interface AppendSpeechRequest extends RealtimeCorrelation {
	readonly text: string;
}
export interface RealtimeCommandRequest extends RealtimeCorrelation {}
export type StopRequest = RealtimeCommandRequest;
export type RecoveryRequest = RealtimeCommandRequest;
export type AppendNotDeliveredReason = "rejected" | "not_ready" | "stale_session" | "cancelled";
export type AppendOutcomeUnknownReason = "transport_failure" | "response_lost";
export type CommandNotDeliveredReason = "rejected" | "not_ready" | "stale_session" | "cancelled";
export type CommandOutcomeUnknownReason = "transport_failure" | "response_lost";
export type AppendOutcomeReason = AppendNotDeliveredReason | AppendOutcomeUnknownReason;
export type CommandOutcomeReason = CommandNotDeliveredReason | CommandOutcomeUnknownReason;
export type AppendOutcome =
	| (RealtimeCorrelation & { readonly outcome: "delivered" })
	| (RealtimeCorrelation & {
			readonly outcome: "not_delivered";
			readonly reason: AppendNotDeliveredReason;
	  })
	| (RealtimeCorrelation & {
			readonly outcome: "outcome_unknown";
			readonly reason: AppendOutcomeUnknownReason;
	  });
export type CommandOutcome =
	| (RealtimeCorrelation & { readonly outcome: "delivered" })
	| (RealtimeCorrelation & {
			readonly outcome: "not_delivered";
			readonly reason: CommandNotDeliveredReason;
	  })
	| (RealtimeCorrelation & {
			readonly outcome: "outcome_unknown";
			readonly reason: CommandOutcomeUnknownReason;
	  });
export interface RealtimeHost {
	readonly createOffer: (offer: CreateOfferSdp) => Promise<AnswerSdp>;
	readonly attachRemoteMedia: (attachment: RemoteMediaAttachment) => void;
	readonly onSemanticEvent: (listener: RealtimeSemanticEventListener) => RealtimeUnsubscribe;
	readonly appendText: (request: AppendTextRequest) => Promise<AppendOutcome>;
	readonly appendSpeech: (request: AppendSpeechRequest) => Promise<AppendOutcome>;
	readonly stop: (request: StopRequest) => Promise<CommandOutcome>;
	readonly recover: (request: RecoveryRequest) => Promise<CommandOutcome>;
}
