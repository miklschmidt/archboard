export { createVoiceAgent } from "#server/agent/services/voice-agent.ts";
export { resolveCodexExecutable } from "@archboard/codex-app-server/process";
export type {
	VoiceAgent,
	VoiceAgentBrowserPort,
	VoiceAgentExtensions,
	VoiceAgentOptions,
} from "#server/agent/services/voice-agent.ts";
export type { ContextChange } from "#server/sessions/announce/protocol/contract.ts";

export { parseTabSessionId } from "#server/tab-session/rules/tab-session.ts";
export type { TabSessionId } from "#server/tab-session/rules/tab-session.ts";

// Below: seams for a host that serves its own chat sockets, domain tools and dynamic approvals. A
// host that serves its browser through `attach` needs none of them.
export { parseWorkhorseLinkKey } from "#server/tab-session/rules/tab-session.ts";
export {
	createServerCodexBrowserSocketOwner,
	createServerCodexBrowserSocketSend,
} from "#server/browser-socket/services/socket.ts";
export type { BrowserProjectionInput } from "#server/projection/protocol/projection-contract.ts";

export { projectCodexBrowserState } from "#server/chat-conversations/browser-state/projections/projection.ts";
export { liveWorkhorseCheckouts } from "#server/chat-conversations/browser-state/projections/workhorse-list.ts";

export { createBrowserLeaseLedger } from "#server/lease/services/lease.ts";
export { mountVoiceStartTraceRoute } from "#server/voice/services/start-trace.ts";
