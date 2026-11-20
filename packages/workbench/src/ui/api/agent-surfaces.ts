// The agent of a page over its panes, as the shell places it: the root that holds the agent and
// takes the shell's facts, the dock, the conversation panel, a pane's part, the presentation's voice
// key and Narrate key, the voice and the panel as the shell reads them, the voice of a recorded
// talk with its box, and an answer that names files. Safe for the browser.
export { AgentRoot } from "#ui/agent-root/components/AgentRoot.tsx";
export type { ChooseShownConversation } from "#ui/agent-root/hooks/use-agent-root.ts";
export { AgentDock, AgentPanel, TalkControl } from "#ui/agent-root/components/AgentSurfaces.tsx";
export { AgentPane } from "#ui/agent-root/components/AgentPane.tsx";
export { NarrateKey } from "#ui/agent-root/components/NarrateKey.tsx";
export { useAgentPanel, useAgentVoice } from "#ui/agent-root/hooks/use-agent.ts";
export type {
	AgentPanelHandle,
	AgentVoice,
	VoiceTranscript,
} from "#ui/agent-root/hooks/use-agent.ts";
export type { AgentReadiness, VoiceStanding } from "#ui/agent-root/rules/voice-standing.ts";
export {
	RecordedVoice,
	RecordedVoiceBox,
} from "#ui/workbench-client/voice/components/RecordedVoice.tsx";
export type { SubtitleSource } from "#ui/workbench-client/subtitles/hooks/use-voice-subtitles.ts";
export type { VoiceLevel, VoiceStage } from "#ui/workbench-client/surfaces/state/contracts.ts";
export { AgentAnswer } from "#ui/workbench-client/thread/components/AnswerText.tsx";
export type { OpenAnswerFile } from "#ui/workbench-client/thread/hooks/use-answer-files.ts";
