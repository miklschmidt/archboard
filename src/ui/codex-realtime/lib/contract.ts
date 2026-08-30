declare const opaqueBrand: unique symbol;
type OpaqueString<Brand extends string> = string & { readonly [opaqueBrand]: Brand };

export type RealtimeSessionId = OpaqueString<"session">;
export type RealtimeCorrelationId = OpaqueString<"correlation">;
export type RealtimeItemId = OpaqueString<"item">;

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

export const REALTIME_PHASES = Object.freeze([
	"idle",
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"speaking",
	"stopping",
	"recoverable_error",
	"terminal_error",
	"closed",
] as const);

export type RealtimePhase = (typeof REALTIME_PHASES)[number];

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
	| {
			readonly phase: "stopping";
			readonly reason: "stop_requested" | "dispose_requested";
	  }
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

type RealtimeStateForPhase<Phase extends RealtimePhase> = Extract<
	RealtimeState,
	{ readonly phase: Phase }
>;

type RealtimeTransitionTable = Readonly<{
	[phase in RealtimePhase]: Readonly<
		Partial<{
			[destination in RealtimePhase]: readonly RealtimeStateForPhase<destination>["reason"][];
		}>
	>;
}>;

export const REALTIME_TRANSITIONS: RealtimeTransitionTable = Object.freeze({
	idle: Object.freeze({
		requesting_permission: Object.freeze(["start_requested", "recovery_requested"] as const),
		stopping: Object.freeze(["dispose_requested"] as const),
	}),
	requesting_permission: Object.freeze({
		negotiating: Object.freeze(["permission_granted"] as const),
		recoverable_error: Object.freeze(["permission_denied", "device_unavailable"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	negotiating: Object.freeze({
		negotiating: Object.freeze(["offer_created", "answer_received"] as const),
		listening: Object.freeze(["negotiation_succeeded"] as const),
		recoverable_error: Object.freeze([
			"sdp_failed",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"autoplay_suspended",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze([
			"unsupported_browser",
			"invalid_session",
			"protocol_error",
			"fatal_error",
		] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	listening: Object.freeze({
		muted: Object.freeze(["mute_requested"] as const),
		processing: Object.freeze(["input_completed"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"autoplay_suspended",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	muted: Object.freeze({
		listening: Object.freeze(["unmute_requested"] as const),
		processing: Object.freeze(["input_completed"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	processing: Object.freeze({
		speaking: Object.freeze(["assistant_started"] as const),
		listening: Object.freeze(["processing_complete"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
			"append_failed",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	speaking: Object.freeze({
		listening: Object.freeze(["assistant_finished"] as const),
		processing: Object.freeze(["user_interrupted"] as const),
		recoverable_error: Object.freeze([
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	stopping: Object.freeze({
		closed: Object.freeze(["stopped", "disposed"] as const),
		recoverable_error: Object.freeze(["stop_failed"] as const),
	}),
	recoverable_error: Object.freeze({
		idle: Object.freeze(["recovered"] as const),
		requesting_permission: Object.freeze(["recovery_requested"] as const),
		negotiating: Object.freeze(["recovery_requested"] as const),
		recoverable_error: Object.freeze(["recovery_failed"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	terminal_error: Object.freeze({
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	closed: Object.freeze({}),
});

export const INITIAL_REALTIME_STATE: RealtimeState = Object.freeze({
	phase: "idle",
	reason: "created",
});

function reasonsForTransition(
	from: RealtimePhase,
	to: RealtimePhase,
): readonly RealtimeTransitionReason[] {
	return REALTIME_TRANSITIONS[from][to] ?? [];
}

export function canTransitionRealtimeState(current: RealtimeState, next: RealtimeState): boolean {
	return reasonsForTransition(current.phase, next.phase).includes(
		next.reason as RealtimeTransitionReason,
	);
}

export function assertRealtimeTransition(current: RealtimeState, next: RealtimeState): void {
	if (canTransitionRealtimeState(current, next)) return;
	const allowed = reasonsForTransition(current.phase, next.phase);
	const suffix =
		allowed.length > 0
			? ` Allowed reasons: ${allowed.join(", ")}.`
			: " No such transition is allowed.";
	throw new TypeError(
		`Illegal realtime transition from ${current.phase} to ${next.phase} for reason ${next.reason}.${suffix}`,
	);
}

export function transitionRealtimeState(
	current: RealtimeState,
	next: RealtimeState,
): RealtimeState {
	assertRealtimeTransition(current, next);
	return Object.freeze({ ...next });
}

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
	| {
			readonly outcome: "delivered";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
	  }
	| {
			readonly outcome: "not_delivered";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly reason: AppendNotDeliveredReason;
	  }
	| {
			readonly outcome: "outcome_unknown";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly reason: AppendOutcomeUnknownReason;
	  };

export type CommandOutcome =
	| {
			readonly outcome: "delivered";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
	  }
	| {
			readonly outcome: "not_delivered";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly reason: CommandNotDeliveredReason;
	  }
	| {
			readonly outcome: "outcome_unknown";
			readonly sessionId: RealtimeSessionId;
			readonly correlationId: RealtimeCorrelationId;
			readonly reason: CommandOutcomeUnknownReason;
	  };

export interface RealtimeHost {
	readonly createOffer: (offer: CreateOfferSdp) => Promise<AnswerSdp>;
	readonly attachRemoteMedia: (attachment: RemoteMediaAttachment) => void;
	readonly onSemanticEvent: (listener: RealtimeSemanticEventListener) => RealtimeUnsubscribe;
	readonly appendText: (request: AppendTextRequest) => Promise<AppendOutcome>;
	readonly appendSpeech: (request: AppendSpeechRequest) => Promise<AppendOutcome>;
	readonly stop: (request: StopRequest) => Promise<CommandOutcome>;
	readonly recover: (request: RecoveryRequest) => Promise<CommandOutcome>;
}
