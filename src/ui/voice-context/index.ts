// Voice context: the exact canonical brief a session started with, the later
// delivery ledger, their history, and the bounded projection a presentation
// reads. The brief bytes are identical in capture, projection and copy.

export {
	VOICE_CONTEXT_DELIVERY_OUTCOMES,
	VOICE_CONTEXT_ENTRY_KINDS,
} from "@/ui/voice-context/contract";
export { ingestVoiceContextBrowserEvidence } from "@/ui/voice-context/lib/browser-evidence";
export { createVoiceContextHistory } from "@/ui/voice-context/lib/history";
export { voiceContextSessionKey } from "@/ui/voice-context/lib/history-validation";
export {
	DEFAULT_VOICE_CONTEXT_LIMITS,
	projectVoiceContext,
} from "@/ui/voice-context/lib/projection";
export { voiceContextEntryExpansionKey } from "@/ui/voice-context/lib/projection-fields";
export { parseCanonicalBrief } from "@/ui/voice-context/lib/semantic-brief";
export type {
	VoiceContextAppend,
	VoiceContextBrowserEvidenceInput,
	VoiceContextBrowserIngestResult,
	VoiceContextCanonicalBrief,
	VoiceContextConnection,
	VoiceContextDeliveryFreshness,
	VoiceContextDeliveryOutcome,
	VoiceContextEntryKind,
	VoiceContextEntryView,
	VoiceContextFieldView,
	VoiceContextHistory,
	VoiceContextHistorySnapshot,
	VoiceContextHistoryView,
	VoiceContextLedgerEntry,
	VoiceContextMutationIgnoredReason,
	VoiceContextMutationResult,
	VoiceContextProjectionInput,
	VoiceContextProjectionLimits,
	VoiceContextProvenance,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
	VoiceContextSessionIdentity,
	VoiceContextSessionRecord,
	VoiceContextSessionView,
	VoiceContextSourceHistory,
	VoiceContextSourceOrder,
	VoiceContextStatusTone,
} from "@/ui/voice-context/contract";
