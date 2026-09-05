import { describe, expect, test } from "bun:test";

import { VOICE_SESSION_STATUSES } from "@/ui/voice-session";
import { projectVoiceTranscript, VOICE_TRANSCRIPT_CROSS_LINK_KINDS } from "@/ui/voice-transcript";
import type { VoiceTranscriptSessionState } from "@/ui/voice-transcript";
import {
	CROSS_LINK_IDS,
	priorRecord,
	transcriptRecord,
	voiceSession,
} from "@/ui/voice-transcript/tests/fixtures";

/** One session status and how the transcript reports it. */
interface SessionStateCase {
	readonly session: ReturnType<typeof voiceSession>;
	readonly expected: VoiceTranscriptSessionState;
	readonly busy: boolean;
}

const SESSION_STATE_CASES: readonly SessionStateCase[] = [
	{ session: voiceSession("unavailable"), expected: "unavailable", busy: false },
	{ session: voiceSession("ready"), expected: "ready", busy: false },
	{
		session: voiceSession("requesting_permission"),
		expected: "requesting_permission",
		busy: false,
	},
	{ session: voiceSession("negotiating"), expected: "negotiating", busy: false },
	{ session: voiceSession("listening"), expected: "listening", busy: false },
	{ session: voiceSession("muted"), expected: "muted", busy: false },
	{ session: voiceSession("processing"), expected: "processing", busy: true },
	{ session: voiceSession("agent_speaking"), expected: "agent_speaking", busy: true },
	{ session: voiceSession("recovering"), expected: "reconnecting", busy: true },
	{ session: voiceSession("stopping"), expected: "stopping", busy: false },
	{ session: voiceSession("stopped"), expected: "completed", busy: false },
	{
		session: voiceSession("failed", {
			accessibleStatus: "Voice failed. Microphone lost. Reconnect the microphone.",
			failure: { code: "device", recoverable: true, message: "Microphone lost." },
			outcome: {
				kind: "retry",
				control: "restart",
				label: "Restart voice",
				recovery: "Reconnect the microphone.",
			},
		}),
		expected: "recoverable_failure",
		busy: false,
	},
	{
		session: voiceSession("failed", {
			accessibleStatus: "Voice failed. Voice stopped. Start a new session.",
			failure: { code: "fatal", recoverable: false, message: "Voice stopped." },
			outcome: { kind: "terminal", label: "Close voice", recovery: "Start a new session." },
		}),
		expected: "terminal_failure",
		busy: false,
	},
];

describe("canonical voice transcript projection", () => {
	test("preserves adapter order and keeps canonical item keys stable across text updates", () => {
		const first = projectVoiceTranscript({
			records: [
				transcriptRecord("later-sequence", 9, { status: "provisional", text: "mov" }),
				transcriptRecord("earlier-sequence", 2),
			],
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});
		const updated = projectVoiceTranscript({
			records: [
				transcriptRecord("later-sequence", 9, { status: "final", text: "move it" }),
				transcriptRecord("earlier-sequence", 2),
			],
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});

		expect(first.records.map((record) => record.itemId)).toEqual([
			"later-sequence",
			"earlier-sequence",
		]);
		expect(first.records.map((record) => record.sequence)).toEqual([9, 2]);
		expect(first.records[0]?.key).toBe(updated.records[0]?.key);
		expect(updated.records[0]?.text).toBe("move it");
		expect(first.busy).toBe(true);
		expect(updated.busy).toBe(false);
	});

	test("retains repeated adapter records instead of merging or deduplicating them", () => {
		const duplicate = transcriptRecord("same-item", 4);
		const view = projectVoiceTranscript({
			records: [duplicate, duplicate],
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});

		expect(view.records).toHaveLength(2);
		expect(view.records[0]?.key).not.toBe(view.records[1]?.key);
		expect(view.records.map((record) => record.itemId)).toEqual(["same-item", "same-item"]);
	});

	test("suppresses prior-session text while retaining its complete inspectable identity", () => {
		const view = projectVoiceTranscript({
			records: [
				priorRecord("prior-item", 17, {
					role: "assistant",
					status: "interrupted",
					text: "private prior text",
				}),
			],
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});

		expect(view.records[0]).toMatchObject({
			sessionId: "session-prior",
			correlationId: "correlation-prior",
			itemId: "prior-item",
			sequence: 17,
			role: "assistant",
			status: "interrupted",
			text: null,
			textSuppressed: true,
		});
		expect(JSON.stringify(view.records)).not.toContain("private prior text");
	});

	test("keeps adapter replay and late prior-session order while reconnecting", () => {
		const view = projectVoiceTranscript({
			records: [
				transcriptRecord("replayed-current", 22),
				priorRecord("late-prior", 8, { text: "late prior copy" }),
				transcriptRecord("next-current", 23, { status: "provisional" }),
			],
			session: voiceSession("recovering"),
			crossLinkIds: CROSS_LINK_IDS,
		});

		expect(view.sessionState).toBe("reconnecting");
		expect(view.records.map((record) => record.itemId)).toEqual([
			"replayed-current",
			"late-prior",
			"next-current",
		]);
		expect(view.records.map((record) => record.sequence)).toEqual([22, 8, 23]);
		expect(view.records[1]).toMatchObject({ text: null, textSuppressed: true });
	});

	test("projects every transcript state", () => {
		const recordStates = ["provisional", "final", "interrupted"] as const;
		const recordView = projectVoiceTranscript({
			records: recordStates.map((status, index) =>
				transcriptRecord(`item-${status}`, index + 1, { status }),
			),
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});
		expect(recordView.records.map((record) => record.status)).toEqual([...recordStates]);
		expect(recordView.records.map((record) => record.statusLabel)).toEqual([
			"Provisional",
			"Final",
			"Interrupted",
		]);
	});

	test("maps every reachable voice-session status and both failure outcomes", () => {
		expect([...new Set(SESSION_STATE_CASES.map(({ session }) => session.status))]).toEqual([
			...VOICE_SESSION_STATUSES,
		]);
		expect(SESSION_STATE_CASES.filter(({ session }) => session.status === "failed")).toHaveLength(
			2,
		);

		for (const { session, expected, busy } of SESSION_STATE_CASES) {
			const view = projectVoiceTranscript({ records: [], session, crossLinkIds: CROSS_LINK_IDS });
			expect(view.sessionState, session.status).toBe(expected);
			expect(view.busy, session.status).toBe(busy);
			expect(view.contentState, session.status).toBe("empty");
		}
	});

	test("exposes six fragment targets and no sibling record content", () => {
		const view = projectVoiceTranscript({
			records: [],
			session: voiceSession(),
			crossLinkIds: CROSS_LINK_IDS,
		});

		expect(view.relationships.map((relationship) => relationship.kind)).toEqual([
			...VOICE_TRANSCRIPT_CROSS_LINK_KINDS,
		]);
		expect(view.relationships.map((relationship) => relationship.targetId)).toEqual([
			"delegation-record",
			"queue-record",
			"steer-record",
			"approval-record",
			"callback-record",
			"workhorse-result-record",
		]);
		expect(Object.keys(view.relationships[0])).toEqual(["kind", "label", "targetId"]);
	});

	test("keeps all relationships ordered while marking individual targets unavailable", () => {
		const view = projectVoiceTranscript({
			records: [],
			session: voiceSession(),
			crossLinkIds: { ...CROSS_LINK_IDS, approvalId: null, callbackId: null },
		});

		expect(view.relationships).toEqual([
			{ kind: "delegation", label: "Delegation", targetId: "delegation-record" },
			{ kind: "queue", label: "Queue", targetId: "queue-record" },
			{ kind: "steer", label: "Steer", targetId: "steer-record" },
			{ kind: "approval", label: "Approval", targetId: null },
			{ kind: "callback", label: "Callback", targetId: null },
			{ kind: "workhorse_result", label: "Workhorse result", targetId: "workhorse-result-record" },
		]);
	});
});
