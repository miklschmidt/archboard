import { describe, expect, test } from "bun:test";
import {
	assertRealtimeTransition,
	canTransitionRealtimeState,
	INITIAL_REALTIME_STATE,
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	transitionRealtimeState,
} from "../index.js";
import type {
	AppendOutcome,
	RealtimeHost,
	RealtimeItemId,
	RealtimeCorrelationId,
	RealtimeSemanticEvent,
	RealtimeSessionId,
	RealtimeState,
	RealtimeTranscriptRecord,
	RemoteMediaAttachment,
} from "../index.js";

const sessionId = "session-from-host" as RealtimeSessionId;
const correlationId = "correlation-from-host" as RealtimeCorrelationId;
const itemId = "item-from-host" as RealtimeItemId;

function state(phase: RealtimeState["phase"], reason: string): RealtimeState {
	if (phase === "recoverable_error" || phase === "terminal_error")
		return { phase, reason: reason as never, message: "test" } as RealtimeState;
	return { phase, reason: reason as never } as RealtimeState;
}

describe("codex realtime public contract", () => {
	test("exports one host port and no implementation handles", async () => {
		const host: RealtimeHost = {
			createOffer: async (offer) => ({
				sessionId: offer.sessionId,
				correlationId: offer.correlationId,
				sdp: offer.sdp,
			}),
			attachRemoteMedia: (attachment: RemoteMediaAttachment) => {
				void attachment.attachTo;
			},
			onSemanticEvent: () => () => undefined,
			appendText: async (request) => ({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
			appendSpeech: async (request) => ({
				outcome: "not_delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "rejected",
			}),
			stop: async (request) => ({
				outcome: "outcome_unknown",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "response_lost",
			}),
			recover: async (request) => ({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
		};

		const offer = await host.createOffer({ sessionId, correlationId, sdp: "offer" });
		expect(offer).toEqual({ sessionId, correlationId, sdp: "offer" });
		expect(host.attachRemoteMedia).toBeTypeOf("function");
		expect(host.onSemanticEvent).toBeTypeOf("function");
		expect(host.appendText).toBeTypeOf("function");
		expect(host.appendSpeech).toBeTypeOf("function");
		expect(host.stop).toBeTypeOf("function");
		expect(host.recover).toBeTypeOf("function");
	});

	test("keeps the phase vocabulary and transition reasons closed", () => {
		expect(REALTIME_PHASES).toEqual([
			"idle",
			"requesting_permission",
			"negotiating",
			"listening",
			"muted",
			"processing",
			"speaking",
			"stopping",
			"recoverable_error",
			"terminal_error",
			"closed",
		]);
		expect(REALTIME_TRANSITIONS.idle.requesting_permission).toEqual([
			"start_requested",
			"recovery_requested",
		]);
		expect(REALTIME_TRANSITIONS.negotiating.terminal_error).toEqual([
			"unsupported_browser",
			"invalid_session",
			"protocol_error",
			"fatal_error",
		]);
		expect(REALTIME_TRANSITIONS.stopping.closed).toEqual(["stopped", "disposed"]);
		expect(REALTIME_TRANSITIONS.closed).toEqual({});
	});

	test("accepts legal transitions and rejects illegal or post-close transitions", () => {
		const requesting = state("requesting_permission", "start_requested");
		const negotiating = state("negotiating", "permission_granted");
		const listening = state("listening", "negotiation_succeeded");
		const muted = state("muted", "mute_requested");
		const closed = state("closed", "stopped");

		expect(canTransitionRealtimeState(INITIAL_REALTIME_STATE, requesting)).toBe(true);
		expect(canTransitionRealtimeState(requesting, negotiating)).toBe(true);
		expect(canTransitionRealtimeState(negotiating, listening)).toBe(true);
		expect(canTransitionRealtimeState(listening, muted)).toBe(true);
		expect(canTransitionRealtimeState(listening, state("idle", "created"))).toBe(false);
		expect(canTransitionRealtimeState(closed, requesting)).toBe(false);
		expect(() =>
			assertRealtimeTransition(listening, state("speaking", "assistant_started")),
		).toThrow(/Illegal realtime transition/);
		expect(() => transitionRealtimeState(closed, requesting)).toThrow(
			/No such transition is allowed/,
		);
		expect(transitionRealtimeState(INITIAL_REALTIME_STATE, requesting)).toEqual(requesting);
	});

	test("freezes public contract records and transition data", () => {
		expect(Object.isFrozen(REALTIME_PHASES)).toBe(true);
		expect(Object.isFrozen(REALTIME_TRANSITIONS)).toBe(true);
		for (const transitions of Object.values(REALTIME_TRANSITIONS)) {
			expect(Object.isFrozen(transitions)).toBe(true);
			for (const reasons of Object.values(transitions)) expect(Object.isFrozen(reasons)).toBe(true);
		}
		expect(Object.isFrozen(INITIAL_REALTIME_STATE)).toBe(true);
		const next = transitionRealtimeState(
			INITIAL_REALTIME_STATE,
			state("requesting_permission", "start_requested"),
		);
		expect(Object.isFrozen(next)).toBe(true);
	});

	test("exposes item-scoped transcript records and all append delivery outcomes", () => {
		const record: RealtimeTranscriptRecord = {
			sessionId,
			correlationId,
			itemId,
			sequence: 4,
			role: "user",
			status: "provisional",
			text: "move the box",
		};
		const event: RealtimeSemanticEvent = { kind: "transcript", record };
		const outcomes: AppendOutcome[] = [
			{ outcome: "delivered", sessionId, correlationId },
			{ outcome: "not_delivered", sessionId, correlationId, reason: "rejected" },
			{ outcome: "outcome_unknown", sessionId, correlationId, reason: "response_lost" },
		];

		expect(event.record.itemId).toBe(itemId);
		expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
			"delivered",
			"not_delivered",
			"outcome_unknown",
		]);
	});

	test("keeps the public module browser-only and transport-neutral", async () => {
		const indexSource = await Bun.file(new URL("../index.ts", import.meta.url)).text();
		const contractSource = await Bun.file(new URL("../lib/contract.ts", import.meta.url)).text();
		const source = `${indexSource}\n${contractSource}`;

		expect(source).not.toMatch(/from\s+["'](?:react|@assistant-ui\/react|node:[^"']+)["']/);
		expect(source).not.toMatch(
			/\b(?:WebSocket|MediaRecorder|RTCPeerConnection|MediaStream|AudioContext|AnalyserNode)\b/,
		);
		expect(source).not.toMatch(/\b(?:appendAudio|outputAudio|audioChunk|audio_chunk)\b/i);
		expect(source).not.toMatch(/\b(?:remoteId|remoteSessionId|remoteIdentity)\b/);
		expect(source).not.toMatch(/\b(?:Codex|Archboard|assistant-ui)\b/);
	});
});

// @ts-expect-error A session identity is host-created and cannot come from a plain string.
const callerSession: RealtimeSessionId = "caller-selected";
void callerSession;

const immutableHost: RealtimeHost = {} as RealtimeHost;
// @ts-expect-error A host has no mutable public ports.
immutableHost.stop = async () => ({
	outcome: "delivered",
	sessionId,
	correlationId,
});

const immutableRecord: RealtimeTranscriptRecord = {
	sessionId,
	correlationId,
	itemId,
	sequence: 1,
	role: "assistant",
	status: "final",
	text: "done",
};
// @ts-expect-error A transcript record is immutable after delivery.
immutableRecord.text = "changed";

const callerSelectedRemote: RemoteMediaAttachment = {
	sessionId,
	correlationId,
	// @ts-expect-error Remote media has no caller-selected remote identity field.
	remoteId: "remote",
	attachTo: () => undefined,
};
void callerSelectedRemote;
