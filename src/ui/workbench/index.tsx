// The agent surfaces: the agent dock at the navigator's foot — the way to talk,
// the agent's state and its plan, and the way to the conversation — and the
// conversation beside the navigator, with the composer at its foot. Both read
// one `AgentView` and act through one `AgentActions`. The voice box is the third:
// the voice over a pane's picture, where the dock's voice goes while subtitles are on.
// A page that draws the voice without a dock, as a rendered recording does, hosts the
// orb itself and shows in it what the dock's circle would (`useCircleState`).

export { AgentDock, type AgentDockProps } from "@/ui/workbench/components/AgentDock";
export { AgentPanel, type AgentPanelProps } from "@/ui/workbench/components/AgentPanel";
export { TalkControl, type TalkControlProps } from "@/ui/workbench/components/TalkControl";
export {
	ConversationList,
	type ConversationListProps,
} from "@/ui/workbench/components/ConversationList";
export {
	VoiceBox,
	type VoiceBoxPlace,
	type VoiceBoxProps,
} from "@/ui/workbench/components/VoiceBox";
export {
	VoiceSurfaceProvider,
	type VoiceSurfaceProviderProps,
} from "@/ui/workbench/components/VoiceSurfaceProvider";
export { useVoiceSurface, type VoiceSurface } from "@/ui/workbench/hooks/use-voice-surface";
export { useCircleState } from "@/ui/workbench/hooks/use-circle-state";
export { agentStatus, type AgentStatus } from "@/ui/workbench/lib/agent-status";
export { createDraftStore, type DraftStore } from "@/ui/workbench/lib/draft-store";
