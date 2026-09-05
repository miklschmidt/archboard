// The spoken approval contract: the states a spoken gate can present beside
// the ordinary approval card, the reasons it names, and the display-only
// view it projects. The ordinary card remains the only owner of decisions.

import type { BrowserApproval, BrowserSpokenApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalDisclosure,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";

const VOICE_SPOKEN_APPROVAL_STATES = Object.freeze([
	"eligible",
	"ineligible",
	"armed",
	"expired",
	"resolving",
	"visual_fallback",
	"outcome_unknown",
	"duplicate",
	"stale_session",
] as const);

type VoiceSpokenApprovalState = (typeof VOICE_SPOKEN_APPROVAL_STATES)[number];

type VoiceSpokenApprovalReason =
	| BrowserApproval["spoken"]["reason"]
	| NonNullable<BrowserSpokenApproval["reason"]>
	| "duplicate";

type CapturedUserFinal = NonNullable<BrowserSpokenApproval["capturedUserFinal"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;

/** The one host-bound final user utterance that may arm a request. */
interface VoiceSpokenApprovalUtterance {
	readonly itemId: CapturedUserFinal["itemId"];
	readonly realtimeSessionId: SpokenGate["realtimeSessionId"];
	readonly sequence: CapturedUserFinal["sequence"];
	readonly text: CapturedUserFinal["text"];
	readonly authority: "captured_user_final";
	readonly label: "Captured final user utterance";
}

/** The display-only spoken state beside an ordinary card. */
interface VoiceSpokenApprovalView {
	readonly state: VoiceSpokenApprovalState;
	readonly label: string;
	readonly detail: string;
	readonly classifierNotice: string | null;
	readonly reason: VoiceSpokenApprovalReason;
	readonly visualCardPreserved: true;
	readonly request: readonly WorkbenchApprovalDisclosure[];
	readonly effect: readonly WorkbenchApprovalDisclosure[];
	readonly source: readonly WorkbenchApprovalDisclosure[];
	readonly gate: readonly WorkbenchApprovalDisclosure[];
	readonly utterance: VoiceSpokenApprovalUtterance | null;
}

/** What the projection reads. */
interface VoiceSpokenApprovalInput {
	/** The ordinary card remains the only owner of approval decisions. */
	readonly card: WorkbenchOrdinaryApprovalCard;
	/** The authoritative browser projection of the single spoken-approval owner. */
	readonly spokenApproval: BrowserSpokenApproval;
}

export {
	VOICE_SPOKEN_APPROVAL_STATES,
	type VoiceSpokenApprovalInput,
	type VoiceSpokenApprovalReason,
	type VoiceSpokenApprovalState,
	type VoiceSpokenApprovalUtterance,
	type VoiceSpokenApprovalView,
};
