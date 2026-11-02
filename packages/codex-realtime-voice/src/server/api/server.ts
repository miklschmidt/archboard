export { createVoiceAgent } from "#server/services/agent/voice-agent.ts";
export { resolveCodexExecutable } from "@archboard/codex-app-server/process";
export type {
	VoiceAgent,
	VoiceAgentBrowserPort,
	VoiceAgentExtensions,
	VoiceAgentOptions,
} from "#server/services/agent/voice-agent.ts";
export type { ContextChange } from "#server/protocol/announce/contract.ts";

export { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
export type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

// Below: seams for a host that serves its own chat sockets, domain tools and dynamic approvals. A
// host that serves its browser through `attach` needs none of them.
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
