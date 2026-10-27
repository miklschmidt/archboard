// The agent as the application shows it: getting it ready, the dock and the conversation panel with what they read and do, and the conversation the workbench projects from the server's timelines. Safe for the browser.
export { AgentDock } from "#ui/components/dock/AgentDock.tsx";
export { AgentPanel } from "#ui/components/panel/AgentPanel.tsx";
export { useConversation } from "#ui/hooks/runtime/use-agent-runtime.ts";
export type { Conversation } from "#ui/hooks/runtime/use-agent-runtime.ts";
export type { AgentPhase } from "#ui/rules/agent-setup/phase.ts";
export { createAgentSetup } from "#ui/state/agent-setup/setup.ts";
export type {
	AgentSetup,
	AgentSetupPorts,
	AgentSetupSnapshot,
	AuthTab,
	SetupStepResult,
} from "#ui/state/agent-setup/setup.ts";
export type { AgentActions, AgentView } from "#ui/state/surfaces/contracts.ts";
export { createDraftStore } from "#ui/state/surfaces/draft-store.ts";
export type { DraftStore } from "#ui/state/surfaces/draft-store.ts";
