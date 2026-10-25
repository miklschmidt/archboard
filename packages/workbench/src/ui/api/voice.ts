// The voice: the voice session, the browser media it runs over, the measured output level, the orb's stage, the subtitles and the voice box a pane draws. Safe for the browser.
export { OrbHost, OrbStageProvider } from "#ui/components/orb/OrbStage.tsx";
export { VoiceSubtitles } from "#ui/components/subtitles/VoiceSubtitles.tsx";
export { TalkControl } from "#ui/components/voice/TalkControl.tsx";
export { VoiceBox } from "#ui/components/voice/VoiceBox.tsx";
export type { VoiceBoxProps } from "#ui/components/voice/VoiceBox.tsx";
export { VoiceSurfaceProvider } from "#ui/components/voice/VoiceSurfaceProvider.tsx";
export { useCircleState } from "#ui/hooks/dock/use-circle-state.ts";
export { useOrbPlacement } from "#ui/hooks/orb/use-orb-stage.ts";
export { useSubtitlesWanted } from "#ui/hooks/subtitles/use-subtitle-preference.ts";
export { useVoiceBoxed } from "#ui/hooks/subtitles/use-voice-boxed.ts";
export type { SubtitleSource } from "#ui/hooks/subtitles/use-voice-subtitles.ts";
export { useVoiceSurface } from "#ui/hooks/voice/use-voice-surface.ts";
export { subtitlePreference } from "#ui/state/subtitles/preference.ts";
export type { AgentVoiceView, VoiceLevel, VoiceStage } from "#ui/state/surfaces/contracts.ts";
export type {
	VoiceSession,
	VoiceSessionPorts,
	VoiceSessionStatus,
	VoiceSessionView,
} from "#ui/state/voice-session/contract.ts";
export { createVoiceSession } from "#ui/state/voice-session/session.ts";
