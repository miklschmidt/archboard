import type {
	VoiceSessionBinding,
	VoiceSessionStatus,
	VoiceSessionView as PublicVoiceSessionView,
} from "../voice-session/index.js";
import type { BrowserSnapshot } from "../../shared/codex-browser-model/index.js";

export const VOICE_CONTEXT_ENTRY_KINDS = Object.freeze([
	"semantic",
	"focus",
	"selection",
	"callback",
] as const);

export const VOICE_CONTEXT_DELIVERY_OUTCOMES = Object.freeze([
	"delivered",
	"not_delivered",
	"outcome_unknown",
] as const);

export type VoiceContextEntryKind = (typeof VOICE_CONTEXT_ENTRY_KINDS)[number];
export type VoiceContextDeliveryOutcome = (typeof VOICE_CONTEXT_DELIVERY_OUTCOMES)[number];
export type VoiceContextProvenance = "live" | "recovered";
export type VoiceContextConnection = "connected" | "disconnected";

/** The complete JSON value encoded by codex-semantic-context's canonical brief. */
export interface VoiceContextCanonicalBrief {
	readonly source: "semantic_context";
	readonly feedId: string;
	readonly repository: string;
	readonly workhorse: { readonly threadId: string | null; readonly turnId: string | null };
	readonly coordinator: {
		readonly threadId: string | null;
		readonly realtimeSessionId: string | null;
	};
	readonly board: { readonly key: string; readonly note: string; readonly version: number | null };
	readonly pane: { readonly paneId: string; readonly focused: boolean };
	readonly version: number | null;
	readonly selection: readonly string[];
	readonly claim: {
		readonly holder: "human" | "agent" | "none";
		readonly doing: string | null;
	};
	readonly doing: string | null;
	readonly cursor: { readonly feedId: string; readonly sequence: number } | null;
	readonly description: string;
	readonly freshness: {
		readonly capturedAtMs: number;
		readonly freshUntilMs: number;
		readonly state: "fresh" | "stale";
	};
	readonly truncated: boolean;
	readonly ambiguity: readonly string[];
	readonly staleness: { readonly state: "current" | "stale"; readonly reasons: readonly string[] };
	readonly child: { readonly id: string | null; readonly epoch: string | null };
	readonly threadLink: {
		readonly state: "executable" | "inspect_only" | "unbound";
		readonly reason: string | null;
	};
}

export type VoiceContextSourceOrder =
	| {
			/** The exact cursor published with a semantic event. */
			readonly kind: "semantic_sequence";
			readonly feedId: string;
			readonly sequence: number;
	  }
	| {
			/** A position read from an authoritative adapter inspect ledger. */
			readonly kind: "adapter_ledger";
			readonly ledgerId: string;
			readonly position: number;
	  };

export interface VoiceContextDeliveryFreshness {
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
}

/** One exact later body and the adapter outcome for attempting to deliver it. */
interface VoiceContextLedgerEntryBase {
	readonly id: string;
	readonly kind: VoiceContextEntryKind;
	readonly sourceOrder: VoiceContextSourceOrder;
	readonly freshness: VoiceContextDeliveryFreshness;
	readonly reason: string | null;
	readonly body: string;
	readonly provenance: VoiceContextProvenance;
	readonly connection: VoiceContextConnection;
}

export type VoiceContextLedgerEntry = VoiceContextLedgerEntryBase &
	(
		| {
				readonly attempted: false;
				readonly attemptedAtMs: null;
				readonly outcome: "not_delivered";
		  }
		| {
				readonly attempted: true;
				readonly attemptedAtMs: number;
				readonly outcome: VoiceContextDeliveryOutcome;
		  }
	);

export interface VoiceContextSessionEvidence {
	/** An externally projected session view. This module never transitions it. */
	readonly session: PublicVoiceSessionView;
	readonly observedAtMs: number;
	readonly provenance: VoiceContextProvenance;
}

export interface VoiceContextSessionCapture extends VoiceContextSessionEvidence {
	/** The byte-exact copy source and sole source for structured baseline display. */
	readonly canonicalBrief: string;
}

export interface VoiceContextSessionRecord {
	readonly captured: VoiceContextSessionEvidence & {
		readonly canonicalBrief: string;
		readonly brief: VoiceContextCanonicalBrief;
	};
	/** Oldest first, including the externally supplied view at capture. */
	readonly observations: readonly VoiceContextSessionEvidence[];
	/** Sorted by the explicitly supplied source order, never promise settlement. */
	readonly entries: readonly VoiceContextLedgerEntry[];
	/** Permanent records the callback owner evicted for this exact session. */
	readonly ownerOmittedPrefixCount: number;
	/** Greatest exact-generation source total observed before transport fitting. */
	readonly sourceEntryCount: number;
}

export interface VoiceContextHistorySnapshot {
	readonly revision: number;
	/** Oldest captured session first. */
	readonly sessions: readonly VoiceContextSessionRecord[];
}

export interface VoiceContextAppend {
	readonly session: Pick<PublicVoiceSessionView, "binding" | "sessionId">;
	readonly entry: VoiceContextLedgerEntry;
}

export interface VoiceContextSourceHistory {
	readonly session: Pick<PublicVoiceSessionView, "binding" | "sessionId">;
	readonly ownerOmittedPrefixCount: number;
	readonly sourceEntryCount: number;
}

export type VoiceContextMutationIgnoredReason =
	| "duplicate_session"
	| "duplicate_entry"
	| "duplicate_observation"
	| "duplicate_source_history"
	| "invalid_brief"
	| "identity_mismatch"
	| "invalid_source_order"
	| "invalid_delivery_evidence"
	| "invalid_source_history"
	| "source_order_conflict"
	| "source_stream_mismatch"
	| "unbound_session"
	| "unknown_session";

export type VoiceContextMutationResult =
	| { readonly outcome: "applied"; readonly revision: number }
	| {
			readonly outcome: "ignored";
			readonly reason: VoiceContextMutationIgnoredReason;
			readonly revision: number;
	  };

/** Retains evidence supplied by existing owners; it owns no session lifecycle. */
export interface VoiceContextHistory {
	readonly snapshot: () => VoiceContextHistorySnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly capture: (input: VoiceContextSessionCapture) => VoiceContextMutationResult;
	readonly observe: (input: VoiceContextSessionEvidence) => VoiceContextMutationResult;
	readonly append: (input: VoiceContextAppend) => VoiceContextMutationResult;
	readonly recordSourceHistory: (input: VoiceContextSourceHistory) => VoiceContextMutationResult;
}

export interface VoiceContextProjectionLimits {
	readonly sessionPageSize: number;
	readonly entryPageSize: number;
	readonly bodyWindowCharacters: number;
}

export interface VoiceContextProjectionInput {
	readonly snapshot: VoiceContextHistorySnapshot;
	readonly sessionPage: number;
	readonly entryPages: ReadonlyMap<string, number>;
	readonly briefPages: ReadonlyMap<string, number>;
	readonly entryBodyPages: ReadonlyMap<string, number>;
	readonly limits?: Partial<VoiceContextProjectionLimits>;
}

export interface VoiceContextFieldView {
	readonly label: string;
	readonly value: string;
	readonly technical: boolean;
}

export interface VoiceContextEntryView {
	readonly id: string;
	readonly expansionKey: string;
	readonly kind: VoiceContextEntryKind;
	readonly kindLabel: string;
	readonly sourceOrderLabel: string;
	readonly capturedAt: string;
	readonly freshUntil: string;
	readonly attemptedAt: string | null;
	readonly attemptLabel: string;
	readonly freshnessLabel: string;
	readonly outcome: VoiceContextDeliveryOutcome;
	readonly outcomeLabel: string;
	readonly reason: string;
	readonly body: string;
	readonly bodyLabel: string;
	readonly bodyPreview: string;
	readonly bodyPage: number;
	readonly bodyWindowStart: number;
	readonly bodyWindowEnd: number;
	readonly bodyTotalCharacters: number;
	readonly previousBodyCharacters: number;
	readonly bodyRemainingCharacters: number;
	readonly nextBodyCharacters: number;
	readonly provenanceLabel: string;
	readonly disconnected: boolean;
	readonly connectionLabel: string;
}

export type VoiceContextStatusTone = "quiet" | "status" | "warning" | "destructive";

export interface VoiceContextSessionView {
	readonly key: string;
	readonly binding: VoiceSessionBinding;
	readonly sessionId: string;
	readonly heading: string;
	readonly status: VoiceSessionStatus;
	readonly statusLabel: string;
	readonly statusDetail: string;
	readonly statusTone: VoiceContextStatusTone;
	readonly replaced: boolean;
	readonly briefLabel: string;
	readonly briefDetail: string;
	readonly provenanceLabel: string;
	readonly fields: readonly VoiceContextFieldView[];
	readonly canonicalBrief: string;
	readonly canonicalBriefPreview: string;
	readonly canonicalBriefPage: number;
	readonly canonicalBriefWindowStart: number;
	readonly canonicalBriefWindowEnd: number;
	readonly canonicalBriefTotalCharacters: number;
	readonly previousCanonicalBriefCharacters: number;
	readonly canonicalBriefRemainingCharacters: number;
	readonly nextCanonicalBriefCharacters: number;
	readonly entries: readonly VoiceContextEntryView[];
	readonly entryCount: number;
	readonly entryPage: number;
	readonly hiddenEntryCount: number;
	readonly nextEntryCount: number;
	readonly newerEntryCount: number;
	readonly omittedPrefixCount: number;
}

export interface VoiceContextHistoryView {
	readonly sessions: readonly VoiceContextSessionView[];
	readonly sessionCount: number;
	readonly sessionPage: number;
	readonly hiddenSessionCount: number;
	readonly nextSessionCount: number;
	readonly newerSessionCount: number;
}

/** One browser snapshot observation; the panel may ingest it before projecting. */
export interface VoiceContextBrowserEvidenceInput {
	readonly snapshot: BrowserSnapshot;
	readonly session: PublicVoiceSessionView;
	readonly observedAtMs: number;
	readonly provenance: VoiceContextProvenance;
	readonly connection: VoiceContextConnection;
}

export interface VoiceContextBrowserIngestResult {
	readonly capture: VoiceContextMutationResult | null;
	readonly observation: VoiceContextMutationResult | null;
	readonly entries: readonly VoiceContextMutationResult[];
	readonly sourceHistory: VoiceContextMutationResult | null;
	readonly sourceEntriesTruncated: number;
}

export interface VoiceContextClipboardPort {
	readonly writeText: (text: string) => Promise<void>;
}

export interface VoiceContextPanelProps {
	readonly history: VoiceContextHistory;
	readonly browserEvidence?: VoiceContextBrowserEvidenceInput | null;
	readonly clipboard?: VoiceContextClipboardPort;
	readonly limits?: Partial<VoiceContextProjectionLimits>;
	readonly className?: string;
}
