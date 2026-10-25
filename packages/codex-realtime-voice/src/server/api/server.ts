export { createVoiceAgent } from "#server/services/agent/voice-agent.ts";
export { resolveCodexExecutable } from "@archboard/codex-app-server/process";
export type {
	VoiceAgent,
	VoiceAgentBrowserPort,
	VoiceAgentExtensions,
	VoiceAgentOptions,
	VoiceAgentStatus,
} from "#server/services/agent/voice-agent.ts";
export {
	DEFAULT_VOICE_AGENT_IDENTITY,
	type VoiceAgentIdentity,
} from "#runtime/protocol/host/identity.ts";
export type { VoiceAgentAttachOptions } from "#server/services/agent/attach.ts";
export type {
	ContextAudience,
	ContextChange,
	ContextReceipt,
	ContextReceiptReason,
	ContextWords,
} from "#server/protocol/announce/contract.ts";

export { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
export type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

// Below: seams that chat sockets, domain tools and dynamic approvals still use. A host
// that serves its browser through `attach` needs none of them.
export { parseWorkhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
export {
	createServerCodexBrowserSocketOwner,
	createServerCodexBrowserSocketSend,
} from "#server/services/browser-socket/socket.ts";
export type { BrowserProjectionInput } from "#server/protocol/projection/projection-contract.ts";

export { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
export { liveWorkhorseCheckouts } from "#server/projections/browser-state/workhorse-list.ts";

export { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
export { mountVoiceStartTraceRoute } from "#server/services/voice/start-trace.ts";
