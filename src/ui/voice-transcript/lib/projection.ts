import type {
	VoiceTranscriptCrossLinkIds,
	VoiceTranscriptCrossLinkView,
	VoiceTranscriptProjectionInput,
	VoiceTranscriptRecordView,
	VoiceTranscriptSessionState,
	VoiceTranscriptView,
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

function projectCrossLinks(
	ids: VoiceTranscriptCrossLinkIds,
): readonly VoiceTranscriptCrossLinkView[] {
	return Object.freeze([
		Object.freeze({
			kind: "delegation",
			label: CROSS_LINK_LABELS.delegation,
			targetId: ids.delegationId,
		}),
		Object.freeze({ kind: "queue", label: CROSS_LINK_LABELS.queue, targetId: ids.queueId }),
		Object.freeze({ kind: "steer", label: CROSS_LINK_LABELS.steer, targetId: ids.steerId }),
		Object.freeze({
			kind: "approval",
			label: CROSS_LINK_LABELS.approval,
			targetId: ids.approvalId,
		}),
		Object.freeze({
			kind: "callback",
			label: CROSS_LINK_LABELS.callback,
			targetId: ids.callbackId,
		}),
		Object.freeze({
			kind: "workhorse_result",
			label: CROSS_LINK_LABELS.workhorse_result,
			targetId: ids.workhorseResultId,
		}),
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
		crossLinks: projectCrossLinks(input.crossLinkIds),
	});
}
