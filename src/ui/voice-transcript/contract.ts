import type { RealtimeTranscriptRecord } from "../codex-realtime/index.js";
import type { VoiceSessionView } from "../voice-session/index.js";

export const VOICE_TRANSCRIPT_CROSS_LINK_KINDS = Object.freeze([
	"delegation",
	"queue",
	"steer",
	"approval",
	"callback",
	"workhorse_result",
] as const);

export type VoiceTranscriptCrossLinkKind = (typeof VOICE_TRANSCRIPT_CROSS_LINK_KINDS)[number];

/**
 * DOM identities owned by sibling workbench records. The transcript renders
 * fragment links only for non-null identities and marks null relationships as
 * unavailable; it never accepts or copies sibling content.
 */
export interface VoiceTranscriptCrossLinkIds {
	readonly delegationId: string | null;
	readonly queueId: string | null;
	readonly steerId: string | null;
	readonly approvalId: string | null;
	readonly callbackId: string | null;
	readonly workhorseResultId: string | null;
}

export type VoiceTranscriptSessionState =
	| "unavailable"
	| "ready"
	| "requesting_permission"
	| "negotiating"
	| "listening"
	| "muted"
	| "processing"
	| "agent_speaking"
	| "reconnecting"
	| "stopping"
	| "completed"
	| "recoverable_failure"
	| "terminal_failure";

export interface VoiceTranscriptRelationshipView<
	Kind extends VoiceTranscriptCrossLinkKind = VoiceTranscriptCrossLinkKind,
> {
	readonly kind: Kind;
	readonly label: string;
	readonly targetId: string | null;
}

export type VoiceTranscriptRelationshipsView = readonly [
	VoiceTranscriptRelationshipView<"delegation">,
	VoiceTranscriptRelationshipView<"queue">,
	VoiceTranscriptRelationshipView<"steer">,
	VoiceTranscriptRelationshipView<"approval">,
	VoiceTranscriptRelationshipView<"callback">,
	VoiceTranscriptRelationshipView<"workhorse_result">,
];

export interface VoiceTranscriptRecordView {
	/** Stable across provisional text updates for the same canonical item. */
	readonly key: string;
	readonly sessionId: string;
	readonly itemId: string;
	readonly correlationId: string;
	readonly sequence: number;
	readonly role: RealtimeTranscriptRecord["role"];
	readonly roleLabel: string;
	readonly status: RealtimeTranscriptRecord["status"];
	readonly statusLabel: string;
	/** Null when the record does not belong to the projected voice session. */
	readonly text: string | null;
	readonly textSuppressed: boolean;
}

export interface VoiceTranscriptView {
	readonly contentState: "empty" | "records";
	readonly sessionState: VoiceTranscriptSessionState;
	readonly busy: boolean;
	readonly session: VoiceSessionView;
	readonly records: readonly VoiceTranscriptRecordView[];
	readonly relationships: VoiceTranscriptRelationshipsView;
}

export interface VoiceTranscriptProjectionInput {
	/** Canonical adapter output. Its order is already authoritative. */
	readonly records: readonly RealtimeTranscriptRecord[];
	readonly session: VoiceSessionView;
	readonly crossLinkIds: VoiceTranscriptCrossLinkIds;
}

/**
 * Chooses the single owner of voice-session announcements. Standalone
 * transcripts own them by default; composed workbenches can delegate them to
 * an external control without changing the visible transcript state.
 */
export type VoiceTranscriptAnnouncementOwner = "transcript" | "external";

export interface VoiceTranscriptProps extends VoiceTranscriptProjectionInput {
	readonly label?: string;
	readonly className?: string;
	readonly announcementOwner?: VoiceTranscriptAnnouncementOwner;
}
