// The neutral realtime server contract, re-exported. This file is the one importer the
// repository policy names: it may reach the shared neutral root and nothing
// else. Every type the module speaks is derived from that root; none is
// redeclared here.

export {
	assertRealtimeTransition,
	canTransitionRealtimeState,
	INITIAL_REALTIME_STATE,
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	transitionRealtimeState,
} from "#shared/rules/realtime-state.ts";
export type {
	AnswerSdp,
	AppendNotDeliveredReason,
	AppendOutcome,
	AppendOutcomeReason,
	AppendOutcomeUnknownReason,
	AppendSpeechRequest,
	AppendTextRequest,
	CommandNotDeliveredReason,
	CommandOutcome,
	CommandOutcomeReason,
	CommandOutcomeUnknownReason,
	CreateOfferSdp,
	RealtimeCommandRequest,
	RealtimeCorrelation,
	RealtimeCorrelationId,
	RealtimeDiagnosticCode,
	RealtimeServer,
	RealtimeItemId,
	RealtimePhase,
	RealtimeRecoverableErrorReason,
	RealtimeSemanticEvent,
	RealtimeSemanticEventListener,
	RealtimeSessionId,
	RealtimeState,
	RealtimeTerminalErrorReason,
	RealtimeTranscriptRecord,
	RealtimeTranscriptRole,
	RealtimeTranscriptStatus,
	RealtimeTransitionReason,
	RealtimeUnsubscribe,
	RecoveryRequest,
	RemoteMediaAttachment,
	StopRequest,
} from "#shared/protocol/realtime-contract.ts";
