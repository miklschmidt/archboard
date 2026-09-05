// Fixtures for the voice transcript tests: cross-link ids, session views in
// every status, and realtime transcript records with branded identities.

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "@/shared/codex-realtime-host";
import type { RealtimeTranscriptRecord } from "@/ui/codex-realtime";
import type { VoiceSessionStatus, VoiceSessionView } from "@/ui/voice-session";
import type { VoiceTranscriptCrossLinkIds } from "@/ui/voice-transcript";

const CROSS_LINK_IDS: VoiceTranscriptCrossLinkIds = Object.freeze({
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

/**
 * A session view in one status.
 * @param status The status.
 * @param overrides Fields to change.
 * @returns The view.
 */
function voiceSession(
	status: VoiceSessionStatus = "listening",
	overrides: Partial<VoiceSessionView> = {},
): VoiceSessionView {
	const words = status.replaceAll("_", " ");
	return {
		status,
		label: status === "agent_speaking" ? "Agent speaking" : words,
		detail: `Voice is ${words}.`,
		accessibleStatus: `Voice is ${words}.`,
		failure: null,
		outcome: { kind: "none" },
		controls: CONTROLS,
		binding: null,
		sessionId: "session-current",
		busy: false,
		...overrides,
	};
}

/**
 * A transcript record on the current session.
 * @param itemId The item id.
 * @param sequence The sequence.
 * @param overrides Fields to change.
 * @returns The record.
 */
function transcriptRecord(
	itemId: string,
	sequence: number,
	overrides: Partial<RealtimeTranscriptRecord> = {},
): RealtimeTranscriptRecord {
	return {
		sessionId: parseRealtimeSessionId("session-current"),
		correlationId: parseRealtimeCorrelationId("correlation-current"),
		itemId: parseRealtimeItemId(itemId),
		sequence,
		role: "user",
		status: "final",
		text: `Transcript ${itemId}`,
		...overrides,
	};
}

/**
 * A transcript record on a prior session.
 * @param itemId The item id.
 * @param sequence The sequence.
 * @param overrides Fields to change.
 * @returns The record.
 */
function priorRecord(
	itemId: string,
	sequence: number,
	overrides: Partial<RealtimeTranscriptRecord> = {},
): RealtimeTranscriptRecord {
	return transcriptRecord(itemId, sequence, {
		sessionId: parseRealtimeSessionId("session-prior"),
		correlationId: parseRealtimeCorrelationId("correlation-prior"),
		...overrides,
	});
}

export { CROSS_LINK_IDS, priorRecord, transcriptRecord, voiceSession };
