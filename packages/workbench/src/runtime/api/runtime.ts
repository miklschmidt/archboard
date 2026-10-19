// The Codex runtime pieces that the system tests compose with the gateway and the projection: the approval broker, the realtime adapter, the parse of a tool-call response and the spoken approval snapshot. Bun only.
export type { SpokenApprovalSnapshot } from "#runtime/protocol/spoken-approval/contract.ts";
export { parseDynamicToolCallResponse } from "#runtime/protocol/thread-tools/results.ts";
export type { ParsedDynamicToolCallResponse } from "#runtime/protocol/thread-tools/results.ts";
export { createCodexApprovalBroker } from "#runtime/services/approvals/broker.ts";
export { createCodexRealtimeAdapter } from "#runtime/services/realtime/adapter.ts";
export type {
	CodexRealtimeAdapter,
	CodexRealtimeBinding,
} from "#runtime/services/realtime/contract.ts";
export { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "#runtime/state/spoken-approval/state.ts";
