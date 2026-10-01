// The agent surfaces: the agent dock at the navigator's foot — the voice
// circle, the agent's state, its plan and the composer — and the conversation
// beside the navigator. Both read one `AgentView` and act through one
// `AgentActions`.

export { AgentDock, type AgentDockProps } from "@/ui/workbench/components/AgentDock";
export { AgentPanel, type AgentPanelProps } from "@/ui/workbench/components/AgentPanel";
export { TalkControl, type TalkControlProps } from "@/ui/workbench/components/TalkControl";
export { agentStatus, type AgentStatus } from "@/ui/workbench/lib/agent-status";
export { createDraftStore, type DraftStore } from "@/ui/workbench/lib/draft-store";
