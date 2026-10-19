// The agent's surfaces beside the navigator: the dock, the conversation panel, what they read and the actions they take, and the draft of the composer. Safe for the browser.
export { AgentDock } from "#ui/components/dock/AgentDock.tsx";
export { AgentPanel } from "#ui/components/panel/AgentPanel.tsx";
export type { AgentActions, AgentContext, AgentView } from "#ui/state/surfaces/contracts.ts";
export { createDraftStore } from "#ui/state/surfaces/draft-store.ts";
export type { DraftStore } from "#ui/state/surfaces/draft-store.ts";
