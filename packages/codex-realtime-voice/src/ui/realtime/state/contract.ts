// The neutral realtime server contract, re-exported. This file is the one importer the
// repository policy names: it may reach the shared neutral root and nothing
// else. Every type the module speaks is derived from that root; none is
// redeclared here.

export { INITIAL_REALTIME_STATE, transitionRealtimeState } from "#shared/rules/realtime-state.ts";
export type {
	AnswerSdp,
	RealtimeCorrelation,
	RealtimeServer,
	RealtimeRecoverableErrorReason,
	RealtimeState,
	RealtimeTerminalErrorReason,
	RealtimeUnsubscribe,
} from "#shared/protocol/realtime-contract.ts";
