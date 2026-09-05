// The voice transcript contract: the identity-preserving projection of the
// realtime adapter's transcript records, the session state it reports, and
// the sibling cross-links it names without copying their content.

import type { RealtimeTranscriptRecord } from "@/ui/codex-realtime";
import type { VoiceSessionView } from "@/ui/voice-session";

const VOICE_TRANSCRIPT_CROSS_LINK_KINDS = Object.freeze([
	"delegation",
	"queue",
	"steer",
	"approval",
	"callback",
	"workhorse_result",
] as const);

type VoiceTranscriptCrossLinkKind = (typeof VOICE_TRANSCRIPT_CROSS_LINK_KINDS)[number];

/**
 * DOM identities owned by sibling workbench records. The transcript renders
 * fragment links only for non-null identities and marks null relationships as
 * unavailable; it never accepts or copies sibling content.
 */
interface VoiceTranscriptCrossLinkIds {
	readonly delegationId: string | null;
	readonly queueId: string | null;
	readonly steerId: string | null;
	readonly approvalId: string | null;
	readonly callbackId: string | null;
	readonly workhorseResultId: string | null;
}

type VoiceTranscriptSessionState =
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

/** One cross-link as projected. */
interface VoiceTranscriptRelationshipView<
	Kind extends VoiceTranscriptCrossLinkKind = VoiceTranscriptCrossLinkKind,
> {
	readonly kind: Kind;
	readonly label: string;
	readonly targetId: string | null;
}

type VoiceTranscriptRelationshipsView = readonly [
	VoiceTranscriptRelationshipView<"delegation">,
	VoiceTranscriptRelationshipView<"queue">,
	VoiceTranscriptRelationshipView<"steer">,
	VoiceTranscriptRelationshipView<"approval">,
	VoiceTranscriptRelationshipView<"callback">,
	VoiceTranscriptRelationshipView<"workhorse_result">,
];

/** One transcript record as projected. */
interface VoiceTranscriptRecordView {
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

/** The transcript as projected. */
interface VoiceTranscriptView {
	readonly contentState: "empty" | "records";
	readonly sessionState: VoiceTranscriptSessionState;
	readonly busy: boolean;
	readonly session: VoiceSessionView;
	readonly records: readonly VoiceTranscriptRecordView[];
	readonly relationships: VoiceTranscriptRelationshipsView;
}

/** What the projection reads. */
interface VoiceTranscriptProjectionInput {
	/** Canonical adapter output. Its order is already authoritative. */
	readonly records: readonly RealtimeTranscriptRecord[];
	readonly session: VoiceSessionView;
	readonly crossLinkIds: VoiceTranscriptCrossLinkIds;
}

export {
	VOICE_TRANSCRIPT_CROSS_LINK_KINDS,
	type VoiceTranscriptCrossLinkIds,
	type VoiceTranscriptCrossLinkKind,
	type VoiceTranscriptProjectionInput,
	type VoiceTranscriptRecordView,
	type VoiceTranscriptRelationshipView,
	type VoiceTranscriptRelationshipsView,
	type VoiceTranscriptSessionState,
	type VoiceTranscriptView,
};
