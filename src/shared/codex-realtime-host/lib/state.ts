import type { RealtimePhase, RealtimeState } from "@/shared/codex-realtime-host/lib/contract";

const REALTIME_PHASES = Object.freeze([
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
] as const);
type StateFor<Phase extends RealtimePhase> = Extract<RealtimeState, { readonly phase: Phase }>;
type TransitionTable = Readonly<
	Record<
		RealtimePhase,
		Readonly<
			Partial<{
				[destination in RealtimePhase]: readonly StateFor<destination>["reason"][];
			}>
		>
	>
>;

const REALTIME_TRANSITIONS: TransitionTable = Object.freeze({
	idle: Object.freeze({
		requesting_permission: Object.freeze(["start_requested", "recovery_requested"] as const),
		stopping: Object.freeze(["dispose_requested"] as const),
	}),
	requesting_permission: Object.freeze({
		negotiating: Object.freeze(["permission_granted"] as const),
		recoverable_error: Object.freeze(["permission_denied", "device_unavailable"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	negotiating: Object.freeze({
		negotiating: Object.freeze(["offer_created", "answer_received"] as const),
		listening: Object.freeze(["negotiation_succeeded"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"sdp_failed",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"autoplay_suspended",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze([
			"unsupported_browser",
			"invalid_session",
			"protocol_error",
			"fatal_error",
		] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	listening: Object.freeze({
		muted: Object.freeze(["mute_requested"] as const),
		processing: Object.freeze(["input_completed"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"autoplay_suspended",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	muted: Object.freeze({
		listening: Object.freeze(["unmute_requested"] as const),
		processing: Object.freeze(["input_completed"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	processing: Object.freeze({
		speaking: Object.freeze(["assistant_started"] as const),
		listening: Object.freeze(["processing_complete"] as const),
		recoverable_error: Object.freeze([
			"device_lost",
			"ice_disconnected",
			"data_channel_closed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
			"append_failed",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	speaking: Object.freeze({
		listening: Object.freeze(["assistant_finished"] as const),
		processing: Object.freeze(["user_interrupted"] as const),
		recoverable_error: Object.freeze([
			"ice_disconnected",
			"data_channel_closed",
			"remote_media_failed",
			"realtime_unavailable",
			"app_server_unavailable",
			"coordinator_unavailable",
		] as const),
		terminal_error: Object.freeze(["invalid_session", "protocol_error", "fatal_error"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	stopping: Object.freeze({
		closed: Object.freeze(["stopped", "disposed"] as const),
		recoverable_error: Object.freeze(["stop_failed"] as const),
	}),
	recoverable_error: Object.freeze({
		idle: Object.freeze(["recovered"] as const),
		requesting_permission: Object.freeze(["recovery_requested"] as const),
		negotiating: Object.freeze(["recovery_requested"] as const),
		recoverable_error: Object.freeze(["recovery_failed"] as const),
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	terminal_error: Object.freeze({
		stopping: Object.freeze(["stop_requested", "dispose_requested"] as const),
	}),
	closed: Object.freeze({}),
});

const INITIAL_REALTIME_STATE: RealtimeState = Object.freeze({
	phase: "idle",
	reason: "created",
});
/**
 * Looks up the reasons a phase may move to another.
 *
 * @param from - The phase the session is in.
 * @param to - The phase it would enter.
 * @returns The allowed reasons, empty when the move is never allowed.
 */
function reasons(from: RealtimePhase, to: RealtimePhase): readonly string[] {
	return REALTIME_TRANSITIONS[from][to] ?? [];
}

/**
 * Tells whether the transition table permits moving to `next` for its reason.
 *
 * @param current - The state the session is in.
 * @param next - The state and reason proposed.
 * @returns True when the table lists that reason for that move.
 */
function canTransitionRealtimeState(current: RealtimeState, next: RealtimeState): boolean {
	return reasons(current.phase, next.phase).includes(next.reason);
}

/**
 * Refuses an illegal transition with a message naming what would have been
 * allowed, so a caller learns the table rather than guessing.
 *
 * @param current - The state the session is in.
 * @param next - The state and reason proposed.
 * @throws {TypeError} when the table does not permit the move.
 */
function assertRealtimeTransition(current: RealtimeState, next: RealtimeState): void {
	if (canTransitionRealtimeState(current, next)) {
		return;
	}
	const allowed = reasons(current.phase, next.phase);
	const suffix =
		allowed.length > 0
			? ` Allowed reasons: ${allowed.join(", ")}.`
			: " No such transition is allowed.";
	throw new TypeError(
		`Illegal realtime transition from ${current.phase} to ${next.phase} for reason ${next.reason}.${suffix}`,
	);
}
/**
 * Moves the session to `next` after checking the transition is legal.
 *
 * @param current - The state the session is in.
 * @param next - The state and reason to move to.
 * @returns A frozen copy of `next`.
 */
function transitionRealtimeState(current: RealtimeState, next: RealtimeState): RealtimeState {
	assertRealtimeTransition(current, next);
	return Object.freeze({ ...next });
}

export {
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	INITIAL_REALTIME_STATE,
	canTransitionRealtimeState,
	assertRealtimeTransition,
	transitionRealtimeState,
};
