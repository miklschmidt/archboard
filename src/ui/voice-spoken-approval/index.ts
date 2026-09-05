// Spoken approval: the display-only state of the one spoken gate beside an
// ordinary approval card. The card owns every decision; unknown outcomes stay
// unknown, with resolver loss visible and spoken eligibility false.

export { VOICE_SPOKEN_APPROVAL_STATES } from "@/ui/voice-spoken-approval/contract";
export { projectVoiceSpokenApproval } from "@/ui/voice-spoken-approval/lib/projection";
export type {
	VoiceSpokenApprovalInput,
	VoiceSpokenApprovalReason,
	VoiceSpokenApprovalState,
	VoiceSpokenApprovalUtterance,
	VoiceSpokenApprovalView,
} from "@/ui/voice-spoken-approval/contract";
