// The voice context contract: the exact canonical brief a session was started
// with, the later delivery ledger, the history that retains them, and the
// bounded projection a presentation reads.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { VoiceSessionBinding, VoiceSessionStatus, VoiceSessionView } from "@/ui/voice-session";

const VOICE_CONTEXT_ENTRY_KINDS = Object.freeze([
	"semantic",
	"focus",
	"selection",
	"callback",
] as const);

const VOICE_CONTEXT_DELIVERY_OUTCOMES = Object.freeze([
	"delivered",
	"not_delivered",
	"outcome_unknown",
] as const);

type VoiceContextEntryKind = (typeof VOICE_CONTEXT_ENTRY_KINDS)[number];
type VoiceContextDeliveryOutcome = (typeof VOICE_CONTEXT_DELIVERY_OUTCOMES)[number];
type VoiceContextProvenance = "live" | "recovered";
type VoiceContextConnection = "connected" | "disconnected";

/** The complete JSON value encoded by the canonical semantic brief. */
interface VoiceContextCanonicalBrief {
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

/** Where one later entry sits in its authoritative source stream. */
type VoiceContextSourceOrder =
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

/** When an entry was captured and until when it counts as fresh. */
interface VoiceContextDeliveryFreshness {
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

type VoiceContextLedgerEntry = VoiceContextLedgerEntryBase &
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

/** One externally projected session view, observed at one moment. */
interface VoiceContextSessionEvidence {
	/** This module never transitions it. */
	readonly session: VoiceSessionView;
	readonly observedAtMs: number;
	readonly provenance: VoiceContextProvenance;
}

/** The capture of a session's start brief. */
interface VoiceContextSessionCapture extends VoiceContextSessionEvidence {
	/** The byte-exact copy source and sole source for structured baseline display. */
	readonly canonicalBrief: string;
}

/** Everything retained about one session. */
interface VoiceContextSessionRecord {
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

/** The history at one revision. */
interface VoiceContextHistorySnapshot {
	readonly revision: number;
	/** Oldest captured session first. */
	readonly sessions: readonly VoiceContextSessionRecord[];
}

/** The identity a session is addressed by: its binding and realtime session. */
type VoiceContextSessionIdentity = Pick<VoiceSessionView, "binding" | "sessionId">;

/** One later entry for one session. */
interface VoiceContextAppend {
	readonly session: VoiceContextSessionIdentity;
	readonly entry: VoiceContextLedgerEntry;
}

/** What the source owner reports about records it no longer holds. */
interface VoiceContextSourceHistory {
	readonly session: VoiceContextSessionIdentity;
	readonly ownerOmittedPrefixCount: number;
	readonly sourceEntryCount: number;
}

type VoiceContextMutationIgnoredReason =
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

type VoiceContextMutationResult =
	| { readonly outcome: "applied"; readonly revision: number }
	| {
			readonly outcome: "ignored";
			readonly reason: VoiceContextMutationIgnoredReason;
			readonly revision: number;
	  };

/** Retains evidence supplied by existing owners; it owns no session lifecycle. */
interface VoiceContextHistory {
	readonly snapshot: () => VoiceContextHistorySnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly capture: (input: VoiceContextSessionCapture) => VoiceContextMutationResult;
	readonly observe: (input: VoiceContextSessionEvidence) => VoiceContextMutationResult;
	readonly append: (input: VoiceContextAppend) => VoiceContextMutationResult;
	readonly recordSourceHistory: (input: VoiceContextSourceHistory) => VoiceContextMutationResult;
}

/** How much a projection reveals per page. */
interface VoiceContextProjectionLimits {
	readonly sessionPageSize: number;
	readonly entryPageSize: number;
	readonly bodyWindowCharacters: number;
}

/** What the projection reads. */
interface VoiceContextProjectionInput {
	readonly snapshot: VoiceContextHistorySnapshot;
	readonly sessionPage: number;
	readonly entryPages: ReadonlyMap<string, number>;
	readonly briefPages: ReadonlyMap<string, number>;
	readonly entryBodyPages: ReadonlyMap<string, number>;
	readonly limits?: Partial<VoiceContextProjectionLimits>;
}

/** One labelled field of the captured brief. */
interface VoiceContextFieldView {
	readonly label: string;
	readonly value: string;
	readonly technical: boolean;
}

/** One later entry as projected. */
interface VoiceContextEntryView {
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

type VoiceContextStatusTone = "quiet" | "status" | "warning" | "destructive";

/** One session as projected. */
interface VoiceContextSessionView {
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

/** The history as projected. */
interface VoiceContextHistoryView {
	readonly sessions: readonly VoiceContextSessionView[];
	readonly sessionCount: number;
	readonly sessionPage: number;
	readonly hiddenSessionCount: number;
	readonly nextSessionCount: number;
	readonly newerSessionCount: number;
}

/** One browser snapshot observation; a presentation may ingest it before projecting. */
interface VoiceContextBrowserEvidenceInput {
	readonly snapshot: BrowserSnapshot;
	readonly session: VoiceSessionView;
	readonly observedAtMs: number;
	readonly provenance: VoiceContextProvenance;
	readonly connection: VoiceContextConnection;
}

/** What one browser snapshot ingestion did. */
interface VoiceContextBrowserIngestResult {
	readonly capture: VoiceContextMutationResult | null;
	readonly observation: VoiceContextMutationResult | null;
	readonly entries: readonly VoiceContextMutationResult[];
	readonly sourceHistory: VoiceContextMutationResult | null;
	readonly sourceEntriesTruncated: number;
}

export {
	VOICE_CONTEXT_DELIVERY_OUTCOMES,
	VOICE_CONTEXT_ENTRY_KINDS,
	type VoiceContextAppend,
	type VoiceContextBrowserEvidenceInput,
	type VoiceContextBrowserIngestResult,
	type VoiceContextCanonicalBrief,
	type VoiceContextConnection,
	type VoiceContextDeliveryFreshness,
	type VoiceContextDeliveryOutcome,
	type VoiceContextEntryKind,
	type VoiceContextEntryView,
	type VoiceContextFieldView,
	type VoiceContextHistory,
	type VoiceContextHistorySnapshot,
	type VoiceContextHistoryView,
	type VoiceContextLedgerEntry,
	type VoiceContextMutationIgnoredReason,
	type VoiceContextMutationResult,
	type VoiceContextProjectionInput,
	type VoiceContextProjectionLimits,
	type VoiceContextProvenance,
	type VoiceContextSessionCapture,
	type VoiceContextSessionEvidence,
	type VoiceContextSessionIdentity,
	type VoiceContextSessionRecord,
	type VoiceContextSessionView,
	type VoiceContextSourceHistory,
	type VoiceContextSourceOrder,
	type VoiceContextStatusTone,
};
