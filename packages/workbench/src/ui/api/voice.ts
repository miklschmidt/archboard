// The voice: the voice session, the browser media it runs over, the measured output level, the orb's stage, the subtitles, the voice box a pane draws and the socket a Narrate key offers the orb. Safe for the browser.
export {
	OrbHost,
	OrbSlot,
	OrbStageProvider,
} from "#ui/workbench-client/orb/components/OrbStage.tsx";
export { VoiceSubtitles } from "#ui/workbench-client/subtitles/components/VoiceSubtitles.tsx";
export { TalkControl } from "#ui/workbench-client/voice/components/TalkControl.tsx";
export { VoiceBox } from "#ui/workbench-client/voice/components/VoiceBox.tsx";
export type { VoiceBoxProps } from "#ui/workbench-client/voice/components/VoiceBox.tsx";
export { VoiceSurfaceProvider } from "#ui/workbench-client/voice/components/VoiceSurfaceProvider.tsx";
export { useCircleState } from "#ui/workbench-client/dock/hooks/use-circle-state.ts";
export { useOrbLaunch, useOrbPlacement } from "#ui/workbench-client/orb/hooks/use-orb-stage.ts";
export { useSubtitlesWanted } from "#ui/workbench-client/subtitles/hooks/use-subtitle-preference.ts";
export { useVoiceBoxed } from "#ui/workbench-client/subtitles/hooks/use-voice-boxed.ts";
export type { SubtitleSource } from "#ui/workbench-client/subtitles/hooks/use-voice-subtitles.ts";
export { useVoiceSurface } from "#ui/workbench-client/voice/hooks/use-voice-surface.ts";
export { subtitlePreference } from "#ui/workbench-client/subtitles/state/preference.ts";
export type {
	AgentVoiceView,
	VoiceLevel,
	VoiceStage,
} from "#ui/workbench-client/surfaces/state/contracts.ts";
export type {
	VoiceSession,
	VoiceSessionPorts,
	VoiceSessionStatus,
	VoiceSessionView,
} from "#ui/voice-session/state/contract.ts";
export { createVoiceSession } from "#ui/voice-session/state/session.ts";
