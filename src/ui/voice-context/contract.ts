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

/** Every value that binds one voice ledger to one immutable realtime run. */
export interface VoiceContextSessionIdentity {
	readonly childId: string;
	readonly epoch: string;
	readonly workhorseThreadId: string;
	readonly coordinatorThreadId: string;
	readonly realtimeSessionId: string;
	readonly paneId: string;
}

export interface VoiceContextCursor {
	readonly feedId: string;
	readonly sequence: number;
}

export interface VoiceContextSelectionCapture {
	readonly elementIds: readonly string[];
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
	readonly freshness: "fresh" | "stale";
}

export interface VoiceContextClaim {
	readonly holder: "human" | "agent" | "none";
	readonly doing: string | null;
}

/**
 * The exact baseline handed to voice when the session started.
 * `canonicalBrief` is the copy source; the remaining fields explain those bytes.
 */
export interface VoiceContextStartBrief {
	readonly canonicalBrief: string;
	readonly capturedAtMs: number;
	readonly repository: string;
	readonly board: {
		readonly key: string;
		readonly note: string;
	};
	readonly version: number | null;
	readonly focused: boolean;
	readonly focusCapturedAtMs: number;
	readonly focusFreshUntilMs: number;
	readonly focusFreshness: "fresh" | "stale";
	readonly selection: VoiceContextSelectionCapture;
	readonly claim: VoiceContextClaim;
	readonly doing: string | null;
	readonly cursor: VoiceContextCursor | null;
	readonly ambiguity: readonly string[];
	readonly truncated: boolean;
	readonly staleness: {
		readonly state: "current" | "stale";
		readonly reasons: readonly string[];
	};
}

/** One exact later body and the adapter outcome for attempting to deliver it. */
export interface VoiceContextLedgerEntry {
	readonly id: string;
	readonly kind: VoiceContextEntryKind;
	readonly capturedAtMs: number;
	readonly attemptedAtMs: number;
	readonly attempted: boolean;
	readonly outcome: VoiceContextDeliveryOutcome;
	readonly reason: string | null;
	readonly body: string;
	readonly provenance: VoiceContextProvenance;
	readonly connection: VoiceContextConnection;
}

export type VoiceContextSessionStatus =
	| { readonly state: "active"; readonly startedAtMs: number }
	| {
			readonly state: "replaced";
			readonly startedAtMs: number;
			readonly replacedAtMs: number;
			readonly replacedBy: VoiceContextSessionIdentity;
	  }
	| {
			readonly state: "stopped";
			readonly startedAtMs: number;
			readonly stoppedAtMs: number;
	  };

export type VoiceContextBriefCondition =
	| { readonly state: "current" }
	| {
			readonly state: "stale";
			readonly markedAtMs: number;
			readonly reasons: readonly string[];
	  };

export interface VoiceContextSessionRecord {
	readonly identity: VoiceContextSessionIdentity;
	readonly brief: VoiceContextStartBrief;
	readonly briefCondition: VoiceContextBriefCondition;
	readonly status: VoiceContextSessionStatus;
	readonly provenance: VoiceContextProvenance;
	readonly entries: readonly VoiceContextLedgerEntry[];
}

export interface VoiceContextHistorySnapshot {
	readonly revision: number;
	/** Oldest first. Presentation may reverse this, but the ledger never does. */
	readonly sessions: readonly VoiceContextSessionRecord[];
}

export interface VoiceContextSessionStart {
	readonly identity: VoiceContextSessionIdentity;
	readonly brief: VoiceContextStartBrief;
	readonly startedAtMs: number;
	readonly provenance: VoiceContextProvenance;
}

export interface VoiceContextAppend {
	readonly identity: VoiceContextSessionIdentity;
	readonly entry: VoiceContextLedgerEntry;
}

export interface VoiceContextBriefStaleMutation {
	readonly identity: VoiceContextSessionIdentity;
	readonly markedAtMs: number;
	readonly reasons: readonly string[];
}

export interface VoiceContextStopMutation {
	readonly identity: VoiceContextSessionIdentity;
	readonly stoppedAtMs: number;
}

export type VoiceContextMutationIgnoredReason =
	| "duplicate_session"
	| "duplicate_entry"
	| "unknown_session"
	| "session_not_active"
	| "already_stale";

export type VoiceContextMutationResult =
	| { readonly outcome: "applied"; readonly revision: number }
	| {
			readonly outcome: "ignored";
			readonly reason: VoiceContextMutationIgnoredReason;
			readonly revision: number;
	  };

/** The sole session/history owner. Every accepted value is copied and frozen. */
export interface VoiceContextHistory {
	readonly snapshot: () => VoiceContextHistorySnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly start: (input: VoiceContextSessionStart) => VoiceContextMutationResult;
	readonly append: (input: VoiceContextAppend) => VoiceContextMutationResult;
	readonly markBriefStale: (input: VoiceContextBriefStaleMutation) => VoiceContextMutationResult;
	readonly stop: (input: VoiceContextStopMutation) => VoiceContextMutationResult;
}

export interface VoiceContextProjectionLimits {
	readonly collapsedSessions: number;
	readonly collapsedEntries: number;
	readonly collapsedBodyCharacters: number;
}

export interface VoiceContextProjectionInput {
	readonly snapshot: VoiceContextHistorySnapshot;
	readonly showAllSessions: boolean;
	readonly expandedSessions: ReadonlySet<string>;
	readonly expandedBriefs: ReadonlySet<string>;
	readonly expandedEntries: ReadonlySet<string>;
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
	readonly capturedAt: string;
	readonly attemptedAt: string;
	readonly attemptLabel: string;
	readonly outcome: VoiceContextDeliveryOutcome;
	readonly outcomeLabel: string;
	readonly reason: string;
	readonly body: string;
	readonly bodyLabel: string;
	readonly bodyPreview: string;
	readonly bodyExpanded: boolean;
	readonly bodyTruncated: boolean;
	readonly provenanceLabel: string;
	readonly disconnected: boolean;
	readonly connectionLabel: string;
}

export interface VoiceContextSessionView {
	readonly key: string;
	readonly identity: VoiceContextSessionIdentity;
	readonly heading: string;
	readonly status: VoiceContextSessionStatus["state"];
	readonly statusLabel: string;
	readonly statusDetail: string;
	readonly briefState: VoiceContextBriefCondition["state"];
	readonly briefLabel: string;
	readonly briefDetail: string;
	readonly provenanceLabel: string;
	readonly fields: readonly VoiceContextFieldView[];
	readonly canonicalBrief: string;
	readonly canonicalBriefPreview: string;
	readonly canonicalBriefExpanded: boolean;
	readonly canonicalBriefTruncated: boolean;
	readonly entries: readonly VoiceContextEntryView[];
	readonly entryCount: number;
	readonly entriesExpanded: boolean;
	readonly hiddenEntryCount: number;
}

export interface VoiceContextHistoryView {
	readonly sessions: readonly VoiceContextSessionView[];
	readonly sessionCount: number;
	readonly hiddenSessionCount: number;
	readonly sessionsExpanded: boolean;
}

export interface VoiceContextClipboardPort {
	readonly writeText: (text: string) => Promise<void>;
}

export interface VoiceContextPanelProps {
	readonly history: VoiceContextHistory;
	readonly clipboard?: VoiceContextClipboardPort;
	readonly limits?: Partial<VoiceContextProjectionLimits>;
	readonly className?: string;
}
