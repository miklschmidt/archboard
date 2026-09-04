import {
	type VoiceTranscriptCrossLinkIds,
	type VoiceTranscriptProjectionInput,
	type VoiceTranscriptRecordView,
	type VoiceTranscriptRelationshipsView,
	type VoiceTranscriptRelationshipView,
	type VoiceTranscriptSessionState,
	type VoiceTranscriptView,
} from "../contract.js";

const ROLE_LABELS = {
	user: "User",
	assistant: "Assistant",
} as const satisfies Readonly<Record<VoiceTranscriptRecordView["role"], string>>;

const STATUS_LABELS = {
	provisional: "Provisional",
	final: "Final",
	interrupted: "Interrupted",
} as const satisfies Readonly<Record<VoiceTranscriptRecordView["status"], string>>;

const SESSION_STATES = {
	unavailable: "unavailable",
	ready: "ready",
	requesting_permission: "requesting_permission",
	negotiating: "negotiating",
	listening: "listening",
	muted: "muted",
	processing: "processing",
	agent_speaking: "agent_speaking",
	recovering: "reconnecting",
	stopping: "stopping",
	stopped: "completed",
	failed: "terminal_failure",
} as const satisfies Readonly<
	Record<VoiceTranscriptProjectionInput["session"]["status"], VoiceTranscriptSessionState>
>;

const BUSY_STATES = new Set<VoiceTranscriptSessionState>([
	"processing",
	"agent_speaking",
	"reconnecting",
]);

const CROSS_LINK_LABELS = {
	delegation: "Delegation",
	queue: "Queue",
	steer: "Steer",
	approval: "Approval",
	callback: "Callback",
	workhorse_result: "Workhorse result",
} as const;

function sessionState(input: VoiceTranscriptProjectionInput): VoiceTranscriptSessionState {
	if (input.session.status !== "failed") return SESSION_STATES[input.session.status];
	return input.session.outcome.kind === "retry" ||
		(input.session.outcome.kind === "none" && input.session.failure?.recoverable === true)
		? "recoverable_failure"
		: "terminal_failure";
}

function canonicalIdentity(sessionId: string, itemId: string): string {
	return `${sessionId.length}:${sessionId}${itemId.length}:${itemId}`;
}

function projectRecords(
	input: VoiceTranscriptProjectionInput,
): readonly VoiceTranscriptRecordView[] {
	const occurrences = new Map<string, number>();
	return Object.freeze(
		input.records.map((record) => {
			const sessionId = String(record.sessionId);
			const itemId = String(record.itemId);
			const identity = canonicalIdentity(sessionId, itemId);
			const occurrence = occurrences.get(identity) ?? 0;
			occurrences.set(identity, occurrence + 1);
			const textSuppressed =
				input.session.sessionId === null || sessionId !== input.session.sessionId;
			return Object.freeze({
				key: occurrence === 0 ? identity : `${identity}:${occurrence}`,
				sessionId,
				itemId,
				correlationId: String(record.correlationId),
				sequence: record.sequence,
				role: record.role,
				roleLabel: ROLE_LABELS[record.role],
				status: record.status,
				statusLabel: STATUS_LABELS[record.status],
				text: textSuppressed ? null : record.text,
				textSuppressed,
			});
		}),
	);
}

function relationship<Kind extends keyof typeof CROSS_LINK_LABELS>(
	kind: Kind,
	targetId: string | null,
): VoiceTranscriptRelationshipView<Kind> {
	return Object.freeze({ kind, label: CROSS_LINK_LABELS[kind], targetId });
}

function projectRelationships(ids: VoiceTranscriptCrossLinkIds): VoiceTranscriptRelationshipsView {
	return Object.freeze([
		relationship("delegation", ids.delegationId),
		relationship("queue", ids.queueId),
		relationship("steer", ids.steerId),
		relationship("approval", ids.approvalId),
		relationship("callback", ids.callbackId),
		relationship("workhorse_result", ids.workhorseResultId),
	]);
}

export function projectVoiceTranscript(input: VoiceTranscriptProjectionInput): VoiceTranscriptView {
	const records = projectRecords(input);
	const projectedSessionState = sessionState(input);
	const streaming = records.some(
		(record) => !record.textSuppressed && record.status === "provisional",
	);
	return Object.freeze({
		contentState: records.length === 0 ? "empty" : "records",
		sessionState: projectedSessionState,
		busy: BUSY_STATES.has(projectedSessionState) || streaming,
		session: input.session,
		records,
		relationships: projectRelationships(input.crossLinkIds),
	});
}
