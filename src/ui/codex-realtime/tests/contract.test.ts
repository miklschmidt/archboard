import { describe, expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "@/shared/codex-realtime-host";
import {
	assertRealtimeTransition,
	canTransitionRealtimeState,
	INITIAL_REALTIME_STATE,
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	transitionRealtimeState,
} from "@/ui/codex-realtime";
import type {
	AppendOutcome,
	CommandOutcome,
	RealtimeHost,
	RealtimeItemId,
	RealtimePhase,
	RealtimeSemanticEvent,
	RealtimeSessionId,
	RealtimeState,
	RealtimeTranscriptRecord,
	RemoteMediaAttachment,
} from "@/ui/codex-realtime";

const sessionId = parseRealtimeSessionId("session-from-host");
const correlationId = parseRealtimeCorrelationId("correlation-from-host");
const itemId = parseRealtimeItemId("item-from-host");

/**
 * Every state the neutral contract declares, written out in full so no test
 * asserts a plain record into the union.
 */
const DECLARED_STATES: readonly RealtimeState[] = [
	{ phase: "idle", reason: "created" },
	{ phase: "idle", reason: "recovered" },
	{ phase: "requesting_permission", reason: "start_requested" },
	{ phase: "requesting_permission", reason: "recovery_requested" },
	{ phase: "negotiating", reason: "permission_granted" },
	{ phase: "negotiating", reason: "offer_created" },
	{ phase: "negotiating", reason: "answer_received" },
	{ phase: "negotiating", reason: "recovery_requested" },
	{ phase: "listening", reason: "negotiation_succeeded" },
	{ phase: "listening", reason: "unmute_requested" },
	{ phase: "listening", reason: "processing_complete" },
	{ phase: "listening", reason: "assistant_finished" },
	{ phase: "muted", reason: "mute_requested" },
	{ phase: "processing", reason: "input_completed" },
	{ phase: "processing", reason: "user_interrupted" },
	{ phase: "speaking", reason: "assistant_started" },
	{ phase: "stopping", reason: "stop_requested" },
	{ phase: "stopping", reason: "dispose_requested" },
	{ phase: "recoverable_error", reason: "permission_denied", message: "test" },
	{ phase: "recoverable_error", reason: "device_unavailable", message: "test" },
	{ phase: "recoverable_error", reason: "device_lost", message: "test" },
	{ phase: "recoverable_error", reason: "sdp_failed", message: "test" },
	{ phase: "recoverable_error", reason: "ice_disconnected", message: "test" },
	{ phase: "recoverable_error", reason: "data_channel_closed", message: "test" },
	{ phase: "recoverable_error", reason: "remote_media_failed", message: "test" },
	{ phase: "recoverable_error", reason: "autoplay_suspended", message: "test" },
	{ phase: "recoverable_error", reason: "realtime_unavailable", message: "test" },
	{ phase: "recoverable_error", reason: "app_server_unavailable", message: "test" },
	{ phase: "recoverable_error", reason: "coordinator_unavailable", message: "test" },
	{ phase: "recoverable_error", reason: "append_failed", message: "test" },
	{ phase: "recoverable_error", reason: "recovery_failed", message: "test" },
	{ phase: "recoverable_error", reason: "stop_failed", message: "test" },
	{ phase: "terminal_error", reason: "unsupported_browser", message: "test" },
	{ phase: "terminal_error", reason: "invalid_session", message: "test" },
	{ phase: "terminal_error", reason: "protocol_error", message: "test" },
	{ phase: "terminal_error", reason: "fatal_error", message: "test" },
	{ phase: "closed", reason: "stopped" },
	{ phase: "closed", reason: "disposed" },
];

/**
 * The declared state for one phase and reason.
 * @param phase The phase.
 * @param reason The reason.
 * @returns The state.
 */
function state(phase: RealtimePhase, reason: string): RealtimeState {
	const found = DECLARED_STATES.find((entry) => entry.phase === phase && entry.reason === reason);
	if (found === undefined) {
		throw new Error(`Invalid test state ${phase}:${reason}`);
	}
	return found;
}

/**
 * The first declared state of one phase.
 * @param phase The phase.
 * @returns The state.
 */
function seedState(phase: RealtimePhase): RealtimeState {
	const found = DECLARED_STATES.find((entry) => entry.phase === phase);
	if (found === undefined) {
		throw new Error(`No declared state for ${phase}`);
	}
	return found;
}

/**
 * Every (destination, reason) edge out of one phase, each proven legal.
 * @param from The source phase.
 * @returns The destination phases and the reasons that reach them.
 */
function provenEdges(from: RealtimePhase): readonly [RealtimePhase, string][] {
	const current = seedState(from);
	const edges: [RealtimePhase, string][] = [];
	for (const destination of REALTIME_PHASES) {
		for (const reason of REALTIME_TRANSITIONS[from][destination] ?? []) {
			const next = state(destination, reason);
			expect(canTransitionRealtimeState(current, next)).toBe(true);
			expect(transitionRealtimeState(current, next)).toEqual(next);
			edges.push([destination, reason]);
		}
	}
	return edges;
}

/**
 * Accepts an attachment and does nothing with it.
 * @param element The element.
 */
function ignoreElement(element: HTMLMediaElement): void {
	void element;
}

/**
 * A host that echoes offers and answers every request with a fixed outcome.
 * @returns The host.
 */
function echoHost(): RealtimeHost {
	return {
		/**
		 * Echoes the offer.
		 * @param offer The offer.
		 * @returns The same SDP.
		 */
		createOffer: (offer) =>
			Promise.resolve({
				sessionId: offer.sessionId,
				correlationId: offer.correlationId,
				sdp: offer.sdp,
			}),
		/**
		 * Accepts an attachment.
		 * @param attachment The attachment.
		 */
		attachRemoteMedia: (attachment: RemoteMediaAttachment) => {
			void attachment.attachTo;
		},
		/**
		 * Subscribes nothing.
		 * @returns A no-op.
		 */
		onSemanticEvent: () => () => undefined,
		/**
		 * Delivers text.
		 * @param request The request.
		 * @returns Delivered.
		 */
		appendText: (request) =>
			Promise.resolve({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
		/**
		 * Refuses speech.
		 * @param request The request.
		 * @returns Rejected.
		 */
		appendSpeech: (request) =>
			Promise.resolve({
				outcome: "not_delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "rejected",
			}),
		/**
		 * Loses the stop.
		 * @param request The request.
		 * @returns Unknown.
		 */
		stop: (request) =>
			Promise.resolve({
				outcome: "outcome_unknown",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "response_lost",
			}),
		/**
		 * Recovers.
		 * @param request The request.
		 * @returns Delivered.
		 */
		recover: (request) =>
			Promise.resolve({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
	};
}

describe("codex realtime public contract", () => {
	test("exports one host port and no implementation handles", async () => {
		const host = echoHost();
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
		expect(REALTIME_TRANSITIONS.idle.stopping).toEqual(["dispose_requested"]);
		expect(REALTIME_TRANSITIONS.negotiating.terminal_error).toEqual([
			"unsupported_browser",
			"invalid_session",
			"protocol_error",
			"fatal_error",
		]);
		expect(REALTIME_TRANSITIONS.stopping.closed).toEqual(["stopped", "disposed"]);
		expect(REALTIME_TRANSITIONS.closed).toEqual({});
	});

	test("has one reachable route for every declared phase reason and edge", () => {
		const incoming = new Set(
			REALTIME_PHASES.flatMap(provenEdges).map(([phase, reason]) => `${phase}:${reason}`),
		);
		for (const declared of DECLARED_STATES) {
			const key = `${declared.phase}:${declared.reason}`;
			expect(incoming.has(key) || key === "idle:created", key).toBe(true);
		}
		for (const phase of REALTIME_PHASES) {
			if (phase !== "stopping") {
				expect(REALTIME_TRANSITIONS[phase].closed).toBeUndefined();
			}
		}
	});

	test("accepts legal transitions and rejects illegal or post-close transitions", () => {
		const requesting = state("requesting_permission", "start_requested");
		const negotiating = state("negotiating", "permission_granted");
		const listening = state("listening", "negotiation_succeeded");
		const muted = state("muted", "mute_requested");
		const stopping = state("stopping", "dispose_requested");
		const closed = state("closed", "stopped");
		const disposed = state("closed", "disposed");

		expect(canTransitionRealtimeState(INITIAL_REALTIME_STATE, requesting)).toBe(true);
		expect(canTransitionRealtimeState(requesting, negotiating)).toBe(true);
		expect(canTransitionRealtimeState(negotiating, listening)).toBe(true);
		expect(canTransitionRealtimeState(listening, muted)).toBe(true);
		expect(canTransitionRealtimeState(listening, state("idle", "created"))).toBe(false);
		expect(canTransitionRealtimeState(INITIAL_REALTIME_STATE, stopping)).toBe(true);
		expect(canTransitionRealtimeState(stopping, disposed)).toBe(true);
		expect(canTransitionRealtimeState(listening, disposed)).toBe(false);
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
			for (const reasons of Object.values(transitions)) {
				expect(Object.isFrozen(reasons)).toBe(true);
			}
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
});

// @ts-expect-error A session identity is host-created and cannot come from a plain string.
const callerSession: RealtimeSessionId = "caller-selected";
void callerSession;

// @ts-expect-error An item identity is host-created and cannot come from a plain string.
const callerItem: RealtimeItemId = "caller-selected";
void callerItem;

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
	attachTo: ignoreElement,
};
void callerSelectedRemote;

const impossibleAppendNotDelivered: AppendOutcome = {
	outcome: "not_delivered",
	sessionId,
	correlationId,
	// @ts-expect-error Definite non-delivery cannot use an uncertainty reason.
	reason: "response_lost",
};
void impossibleAppendNotDelivered;

const impossibleAppendUnknown: AppendOutcome = {
	outcome: "outcome_unknown",
	sessionId,
	correlationId,
	// @ts-expect-error Unknown outcome cannot use a definite rejection reason.
	reason: "rejected",
};
void impossibleAppendUnknown;

const impossibleCommandNotDelivered: CommandOutcome = {
	outcome: "not_delivered",
	sessionId,
	correlationId,
	// @ts-expect-error Definite command non-delivery cannot use an uncertainty reason.
	reason: "transport_failure",
};
void impossibleCommandNotDelivered;

const impossibleCommandUnknown: CommandOutcome = {
	outcome: "outcome_unknown",
	sessionId,
	correlationId,
	// @ts-expect-error Unknown command outcome cannot use a definite rejection reason.
	reason: "not_ready",
};
void impossibleCommandUnknown;
