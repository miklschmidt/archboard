// Voice transcript: the identity-preserving projection of the realtime
// adapter's transcript records with their session state and cross-links.

export { VOICE_TRANSCRIPT_CROSS_LINK_KINDS } from "@/ui/voice-transcript/contract";
export { projectVoiceTranscript } from "@/ui/voice-transcript/lib/projection";
export type {
	VoiceTranscriptCrossLinkIds,
	VoiceTranscriptCrossLinkKind,
	VoiceTranscriptProjectionInput,
	VoiceTranscriptRecordView,
	VoiceTranscriptRelationshipView,
	VoiceTranscriptRelationshipsView,
	VoiceTranscriptSessionState,
	VoiceTranscriptView,
} from "@/ui/voice-transcript/contract";
