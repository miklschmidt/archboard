// The agent as the application shows it: getting it ready, the dock and the conversation panel with what they read and do, the conversation the workbench projects from the server's timelines, and the opening of a file an answer names, which the application offers. Safe for the browser.
export { AgentDock } from "#ui/workbench-client/dock/components/AgentDock.tsx";
export { AgentPanel } from "#ui/workbench-client/panel/components/AgentPanel.tsx";
export { AgentAnswer } from "#ui/workbench-client/thread/components/AnswerText.tsx";
export { AnswerFilesContext } from "#ui/workbench-client/thread/hooks/use-answer-files.ts";
export { useConversation } from "#ui/workbench-client/assistant-runtime/hooks/use-agent-runtime.ts";
export { createAgentSetup } from "#ui/agent-setup/state/setup.ts";
export type {
	AgentSetup,
	AgentSetupPorts,
	AgentSetupSnapshot,
	AuthTab,
	SetupStepResult,
} from "#ui/agent-setup/state/setup.ts";
export type { AgentActions, AgentView } from "#ui/workbench-client/surfaces/state/contracts.ts";
export { createDraftStore } from "#ui/workbench-client/surfaces/state/draft-store.ts";
export type { DraftStore } from "#ui/workbench-client/surfaces/state/draft-store.ts";
