// The voice session adapter: availability, source binding, notifications,
// session and mute lifecycle, recovery, and the seam to the committed voice
// controls.

export { VOICE_SESSION_FAILURE_CODES, VOICE_SESSION_STATUSES } from "@/ui/voice-session/contract";
export { createVoiceSession } from "@/ui/voice-session/lib/session";
export { projectVoiceSession } from "@/ui/voice-session/lib/projection";
export { voiceControlsView } from "@/ui/voice-session/lib/presentation";
export type {
	VoiceNarration,
	VoiceRealtimePort,
	VoiceSession,
	VoiceSessionBinding,
	VoiceSessionControlName,
	VoiceSessionControls,
	VoiceSessionFailure,
	VoiceSessionFailureCode,
	VoiceSessionOutcome,
	VoiceSessionPorts,
	VoiceSessionProjectionInput,
	VoiceSessionStatus,
	VoiceSessionView,
	VoiceTransportPort,
} from "@/ui/voice-session/contract";
