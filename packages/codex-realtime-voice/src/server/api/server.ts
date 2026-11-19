// The voice agent a Bun server runs: create it, start it, and connect each browser socket, from
// any WebSocket library or through its Bun handlers. Below it, what a host that adds its own
// domain composes: its role instructions, the turn input of its own tools, and the context policy.
export { createVoiceAgent } from "#server/agent/services/voice-agent.ts";
export type {
	VoiceAgent,
	VoiceAgentExtensions,
	VoiceAgentOptions,
} from "#server/agent/services/voice-agent.ts";
export type {
	VoiceConnection,
	VoiceRoute,
	VoiceSocket,
} from "#server/agent/services/connect.ts";
export type { ContextChange } from "#server/sessions/announce/protocol/contract.ts";
export { parseTabSessionId } from "#server/tab-session/rules/tab-session.ts";
export type { TabSessionId } from "#server/tab-session/rules/tab-session.ts";
export { composeRoleInstructions } from "#runtime/host/rules/instructions.ts";
export { createTextUserInput } from "#runtime/host/turn-input/rules/text-input.ts";
export {
	additionalContextPolicy,
	type OperationOutcome,
} from "#runtime/workhorses/instructions/rules/context-policy.ts";
export type { DeepReadonly } from "#runtime/approvals/services/contract.ts";
