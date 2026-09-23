// The agent surfaces: the agent bar under the panes — the agent's state, Talk
// and the composer — and the conversation panel beside them. Both read one
// `AgentView` and act through one `AgentActions`.

export { AgentBar, type AgentBarProps } from "@/ui/workbench/components/AgentBar";
export { AgentPanel, type AgentPanelProps } from "@/ui/workbench/components/AgentPanel";
export { TalkControl, type TalkControlProps } from "@/ui/workbench/components/TalkControl";
export { agentStatus, type AgentStatus } from "@/ui/workbench/lib/agent-status";
export { createDraftStore, type DraftStore } from "@/ui/workbench/lib/draft-store";
