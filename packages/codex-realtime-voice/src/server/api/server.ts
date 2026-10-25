export {
	createVoiceAgent,
	DEFAULT_VOICE_AGENT_IDENTITY,
} from "#server/services/agent/voice-agent.ts";
export type {
	VoiceAgent,
	VoiceAgentBrowserPort,
	VoiceAgentExtensions,
	VoiceAgentIdentity,
	VoiceAgentOptions,
	VoiceAgentStatus,
} from "#server/services/agent/voice-agent.ts";
export type { VoiceAgentAttachOptions } from "#server/services/agent/attach.ts";
export { createCodexWorkbench } from "#server/services/owner/workbench.ts";
export type { CreateCodexWorkbenchOptions } from "#server/services/owner/workbench.ts";

export type {
	CodexWorkbenchHostPolicy,
	PendingOperation,
	WorkbenchOperationAuthority,
} from "#server/protocol/generation/host.ts";
export type {
	CodexWorkbenchDomain,
	CodexWorkbenchDomainScope,
	CodexWorkbenchDomainTools,
} from "#server/protocol/generation/domain.ts";

export type {
	CodexWorkbenchTabSession,
	CodexWorkbenchSessionComponents,
} from "#server/protocol/generation/session-contract.ts";
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
	BrowserWorkbenchActions,
	BrowserActionContext,
	BrowserActionResult,
	BrowserDynamicApprovalActions,
	BrowserLeaseLedger,
} from "#server/protocol/gateway/contract.ts";
export type {
	BrowserOwnerProjection,
	BrowserProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";

export { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
export { createServerCanonicalTextActions } from "#server/services/actions/text-actions.ts";
export { liveWorkhorseCheckouts } from "#server/projections/browser-state/workhorse-list.ts";
export type { WorkbenchVoicePresentationAdapter } from "#server/services/voice/presentation.ts";

export type { TabSessions } from "#server/services/sessions/browser-tabs.ts";
export { closedTransport, requireCreated } from "#server/services/generation/owners.ts";

export { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
export { mountVoiceStartTraceRoute } from "#server/services/voice/start-trace.ts";

export { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";
export { createServerRealtimeActions } from "#server/services/voice/realtime-actions.ts";
