import type {
	BrowserApproval,
	BrowserSpokenApproval,
} from "../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalDisclosure,
	WorkbenchOrdinaryApprovalCard,
} from "../workbench-approvals/index.js";

export const VOICE_SPOKEN_APPROVAL_STATES = Object.freeze([
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

export type VoiceSpokenApprovalState = (typeof VOICE_SPOKEN_APPROVAL_STATES)[number];

export type VoiceSpokenApprovalReason =
	| BrowserApproval["spoken"]["reason"]
	| NonNullable<BrowserSpokenApproval["reason"]>
	| "duplicate";

type CapturedUserFinal = NonNullable<BrowserSpokenApproval["capturedUserFinal"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;

export interface VoiceSpokenApprovalUtterance {
	readonly itemId: CapturedUserFinal["itemId"];
	readonly realtimeSessionId: SpokenGate["realtimeSessionId"];
	readonly sequence: CapturedUserFinal["sequence"];
	readonly text: CapturedUserFinal["text"];
	readonly authority: "captured_user_final";
	readonly label: "Captured final user utterance";
}

export interface VoiceSpokenApprovalView {
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

export interface VoiceSpokenApprovalInput {
	/** The ordinary card remains the only owner of approval decisions. */
	readonly card: WorkbenchOrdinaryApprovalCard;
	/** The authoritative browser projection of the single spoken-approval owner. */
	readonly spokenApproval: BrowserSpokenApproval;
}

export interface VoiceSpokenApprovalProps extends VoiceSpokenApprovalInput {
	readonly className?: string;
}
