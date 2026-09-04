import type { RealtimeTranscriptRecord } from "../../codex-realtime/index.js";
import type { VoiceSessionStatus, VoiceSessionView } from "../../voice-session/index.js";
import type { VoiceTranscriptCrossLinkIds } from "../index.js";

export const CROSS_LINK_IDS: VoiceTranscriptCrossLinkIds = Object.freeze({
	delegationId: "delegation-record",
	queueId: "queue-record",
	steerId: "steer-record",
	approvalId: "approval-record",
	callbackId: "callback-record",
	workhorseResultId: "workhorse-result-record",
});

const CONTROLS = Object.freeze({
	canStart: false,
	canMute: false,
	canUnmute: false,
	canStop: true,
	canRestart: false,
	canClose: false,
});

export function voiceSession(
	status: VoiceSessionStatus = "listening",
	overrides: Partial<VoiceSessionView> = {},
): VoiceSessionView {
	return {
		status,
		label: status === "agent_speaking" ? "Agent speaking" : status.replaceAll("_", " "),
		detail: `Voice is ${status.replaceAll("_", " ")}.`,
		accessibleStatus: `Voice is ${status.replaceAll("_", " ")}.`,
		failure: null,
		outcome: { kind: "none" },
		controls: CONTROLS,
		binding: null,
		sessionId: "session-current",
		...overrides,
	};
}

type TranscriptRecordOverrides = Partial<RealtimeTranscriptRecord>;

export function transcriptRecord(
	itemId: string,
	sequence: number,
	overrides: TranscriptRecordOverrides = {},
): RealtimeTranscriptRecord {
	return {
		sessionId: "session-current" as RealtimeTranscriptRecord["sessionId"],
		correlationId: "correlation-current" as RealtimeTranscriptRecord["correlationId"],
		itemId: itemId as RealtimeTranscriptRecord["itemId"],
		sequence,
		role: "user",
		status: "final",
		text: `Transcript ${itemId}`,
		...overrides,
	};
}
