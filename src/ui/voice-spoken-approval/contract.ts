import type { BrowserApproval, BrowserVoice } from "../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalDisclosure,
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

export type VoiceSpokenApprovalFallbackReason =
	| "ambiguous"
	| "missing"
	| "non_final"
	| "assistant_only"
	| "lost_result"
	| "expiry"
	| "realtime_unavailable"
	| "coordinator_unavailable"
	| "stale_identity"
	| "stale_session"
	| "duplicate";

export type VoiceSpokenApprovalReason =
	| BrowserApproval["spoken"]["reason"]
	| VoiceSpokenApprovalFallbackReason
	| "dynamic_approval";

type BrowserVoiceItem = BrowserVoice["transcript"][number];
type BrowserApprovalBinding = BrowserApproval["binding"];

export type VoiceSpokenApprovalEffectPrompt = Readonly<
	Pick<BrowserVoiceItem, "itemId" | "sequence">
>;

export type VoiceSpokenApprovalCapturedItem = Readonly<
	Pick<BrowserVoiceItem, "itemId" | "sequence" | "speaker" | "text" | "final"> & {
		readonly realtimeSessionId: NonNullable<BrowserVoice["realtimeSessionId"]>;
	}
>;

type GateIdentity = Readonly<
	Pick<BrowserApproval, "requestId" | "approvalId" | "threadId"> & {
		readonly binding: Readonly<
			Pick<BrowserApprovalBinding, "child" | "epoch" | "target" | "effect">
		>;
		readonly coordinatorThreadId: string;
		readonly realtimeSessionId: NonNullable<BrowserVoice["realtimeSessionId"]>;
		readonly effectPrompt: VoiceSpokenApprovalEffectPrompt;
		readonly capturedItem: VoiceSpokenApprovalCapturedItem | null;
		readonly expiresAtMs: number;
	}
>;

type GateState =
	| { readonly state: "armed" | "resolving"; readonly reason: null }
	| { readonly state: "expired"; readonly reason: "expiry" }
	| {
			readonly state: "visual_fallback";
			readonly reason: Exclude<
				VoiceSpokenApprovalFallbackReason,
				"expiry" | "stale_session" | "duplicate"
			>;
	  }
	| { readonly state: "outcome_unknown"; readonly reason: "lost_result" }
	| { readonly state: "stale_session"; readonly reason: "stale_session" };

type WithGateIdentity<State> = State extends GateState ? GateIdentity & State : never;

export type VoiceSpokenApprovalGatePresentation = WithGateIdentity<GateState>;

export type VoiceSpokenApprovalEvidenceAuthority = "captured_user_final" | "non_authoritative";

export interface VoiceSpokenApprovalUtterance {
	readonly itemId: BrowserVoiceItem["itemId"];
	readonly realtimeSessionId: NonNullable<BrowserVoice["realtimeSessionId"]>;
	readonly sequence: number;
	readonly speaker: BrowserVoiceItem["speaker"];
	readonly text: string;
	readonly final: boolean;
	readonly authority: VoiceSpokenApprovalEvidenceAuthority;
	readonly label: string;
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
	readonly card: WorkbenchApprovalCard;
	/** Immutable facts projected by the caller from its spoken-gate owner. */
	readonly gate: VoiceSpokenApprovalGatePresentation | null;
	/** The browser model used to verify exact realtime item correlation. */
	readonly voice: BrowserVoice;
	readonly nowMs: number;
}

export interface VoiceSpokenApprovalProps extends VoiceSpokenApprovalInput {
	readonly className?: string;
}
