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

// Below: seams that Archboard's pane sockets, domain tools and dynamic approvals still use. A host
// that serves its browser through `attach` needs none of them.
export type { CodexWorkbenchSessionComponents } from "#server/protocol/generation/session-contract.ts";
export type {
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseComponents,
} from "#server/services/sessions/workhorses.ts";
export { parseTabSessionId, parseWorkhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
export type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
export {
	createServerCodexBrowserSocketOwner,
	createServerCodexBrowserSocketSend,
} from "#server/services/browser-socket/socket.ts";
export type {
	BrowserConnectionInstance,
	BrowserActionContext,
	BrowserActionResult,
	BrowserDynamicApprovalActions,
} from "#server/protocol/gateway/contract.ts";
export type { BrowserProjectionInput } from "#server/protocol/projection/projection-contract.ts";

export { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
export { liveWorkhorseCheckouts } from "#server/projections/browser-state/workhorse-list.ts";

export { closedTransport, requireCreated } from "#server/services/generation/owners.ts";

export { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
export { mountVoiceStartTraceRoute } from "#server/services/voice/start-trace.ts";
