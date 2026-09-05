import { describe, expect, test } from "bun:test";

import { INITIAL_REALTIME_STATE, REALTIME_PHASES, REALTIME_TRANSITIONS } from "@/ui/codex-realtime";
import type { RealtimeState } from "@/ui/codex-realtime";
import {
	projectVoiceSession,
	VOICE_SESSION_FAILURE_CODES,
	VOICE_SESSION_STATUSES,
} from "@/ui/voice-session";
import type {
	VoiceSessionProjectionInput,
	VoiceSessionStatus,
	VoiceSessionView,
} from "@/ui/voice-session";
import {
	capabilities,
	connectedState,
	mediaSnapshot,
	reconnectingState,
} from "@/ui/voice-session/tests/support/fakes";

/**
 * Every state the neutral host contract declares, spelled out so the test
 * asserts nothing into the union.
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
	{
		phase: "recoverable_error",
		reason: "permission_denied",
		message: "recoverable_error for permission_denied",
	},
	{
		phase: "recoverable_error",
		reason: "device_unavailable",
		message: "recoverable_error for device_unavailable",
	},
	{
		phase: "recoverable_error",
		reason: "device_lost",
		message: "recoverable_error for device_lost",
	},
	{ phase: "recoverable_error", reason: "sdp_failed", message: "recoverable_error for sdp_failed" },
	{
		phase: "recoverable_error",
		reason: "ice_disconnected",
		message: "recoverable_error for ice_disconnected",
	},
	{
		phase: "recoverable_error",
		reason: "data_channel_closed",
		message: "recoverable_error for data_channel_closed",
	},
	{
		phase: "recoverable_error",
		reason: "remote_media_failed",
		message: "recoverable_error for remote_media_failed",
	},
	{
		phase: "recoverable_error",
		reason: "autoplay_suspended",
		message: "recoverable_error for autoplay_suspended",
	},
	{
		phase: "recoverable_error",
		reason: "realtime_unavailable",
		message: "recoverable_error for realtime_unavailable",
	},
	{
		phase: "recoverable_error",
		reason: "app_server_unavailable",
		message: "recoverable_error for app_server_unavailable",
	},
	{
		phase: "recoverable_error",
		reason: "coordinator_unavailable",
		message: "recoverable_error for coordinator_unavailable",
	},
	{
		phase: "recoverable_error",
		reason: "append_failed",
		message: "recoverable_error for append_failed",
	},
	{
		phase: "recoverable_error",
		reason: "recovery_failed",
		message: "recoverable_error for recovery_failed",
	},
	{
		phase: "recoverable_error",
		reason: "stop_failed",
		message: "recoverable_error for stop_failed",
	},
	{
		phase: "terminal_error",
		reason: "unsupported_browser",
		message: "terminal_error for unsupported_browser",
	},
	{
		phase: "terminal_error",
		reason: "invalid_session",
		message: "terminal_error for invalid_session",
	},
	{
		phase: "terminal_error",
		reason: "protocol_error",
		message: "terminal_error for protocol_error",
	},
	{ phase: "terminal_error", reason: "fatal_error", message: "terminal_error for fatal_error" },
	{ phase: "closed", reason: "stopped" },
	{ phase: "closed", reason: "disposed" },
];

/**
 * Every state the transition table can actually reach: the initial one plus
 * every (destination, reason) pair it allows. The projection must map all of
 * them, so the table is the exhaustiveness source rather than a hand-kept list.
 * @returns The reachable states.
 */
function reachableStates(): readonly RealtimeState[] {
	const reachable = new Set<string>([
		`${INITIAL_REALTIME_STATE.phase}:${INITIAL_REALTIME_STATE.reason}`,
	]);
	for (const from of REALTIME_PHASES) {
		for (const to of REALTIME_PHASES) {
			for (const reason of REALTIME_TRANSITIONS[from][to] ?? []) {
				reachable.add(`${to}:${reason}`);
			}
		}
	}
	const states = DECLARED_STATES.filter((state) => reachable.has(`${state.phase}:${state.reason}`));
	expect(states).toHaveLength(reachable.size);
	return states;
}

/**
 * A projection input over the default sources.
 * @param overrides Fields to change.
 * @returns The input.
 */
function input(overrides: Partial<VoiceSessionProjectionInput> = {}): VoiceSessionProjectionInput {
	return {
		media: null,
		mediaState: { state: "ready" },
		transportState: connectedState(),
		capabilities: capabilities(),
		binding: null,
		replaced: false,
		busy: false,
		closed: false,
		closedSessionId: null,
		controlFailure: null,
		...overrides,
	};
}

/**
 * Projects one realtime state over the default sources.
 * @param state The realtime state.
 * @returns The view.
 */
function project(state: RealtimeState): VoiceSessionView {
	return projectVoiceSession(input({ media: mediaSnapshot(state) }));
}

/**
 * Whether a state is an error state.
 * @param state The realtime state.
 * @returns True for either error phase.
 */
function isError(state: RealtimeState): boolean {
	return state.phase === "recoverable_error" || state.phase === "terminal_error";
}

/**
 * Sorts names.
 * @param left One name.
 * @param right Another name.
 * @returns The comparison.
 */
function byName(left: string, right: string): number {
	return left.localeCompare(right);
}

/**
 * Sorts reason and code pairs.
 * @param left One pair.
 * @param right Another pair.
 * @returns The comparison.
 */
function byPair(left: [string, string], right: [string, string]): number {
	return byName(left[0], right[0]);
}

const REACHABLE = reachableStates();

describe("voice session status mapping", () => {
	test("maps every reachable realtime state to a defined status and sentence", () => {
		const seen = new Set<VoiceSessionStatus>();
		for (const state of REACHABLE) {
			const view = project(state);
			const where = `${state.phase}/${state.reason}`;
			expect(VOICE_SESSION_STATUSES, where).toContain(view.status);
			expect(view.label.length, where).toBeGreaterThan(0);
			expect(view.detail.length, where).toBeGreaterThan(0);
			// A failure detail carries the module's authoritative message and is
			// not repunctuated; narrated sentences are this module's own words.
			const ending = "message" in state ? state.message : ".";
			expect(view.detail.endsWith(ending), where).toBe(true);
			expect(view.accessibleStatus.startsWith(`${view.label}. ${view.detail}`), where).toBe(true);
			expect(Object.isFrozen(view), where).toBe(true);
			seen.add(view.status);
		}
		// Every status but `unavailable` is reachable from the realtime state
		// machine alone; `unavailable` belongs to the transport and host gates.
		expect([...seen].toSorted(byName)).toEqual(
			VOICE_SESSION_STATUSES.filter((status) => status !== "unavailable").toSorted(byName),
		);
	});

	test("gives every realtime error reason its own presentation failure code", () => {
		const codes = new Map<string, string>();
		for (const state of REACHABLE.filter(isError)) {
			const view = project(state);
			const failure = view.failure;
			expect(view.status, state.reason).toBe("failed");
			expect(failure, state.reason).not.toBeNull();
			if (failure === null || !("message" in state)) {
				throw new Error(`No failure for ${state.reason}`);
			}
			expect(VOICE_SESSION_FAILURE_CODES, state.reason).toContain(failure.code);
			expect(failure.message, state.reason).toBe(state.message);
			expect(failure.recoverable, state.reason).toBe(state.phase === "recoverable_error");
			codes.set(state.reason, failure.code);
		}
		const expected: [string, string][] = [
			["append_failed", "append"],
			["app_server_unavailable", "app_server"],
			["autoplay_suspended", "audio_output"],
			["coordinator_unavailable", "coordinator"],
			["data_channel_closed", "channel"],
			["device_lost", "device"],
			["device_unavailable", "device"],
			["fatal_error", "fatal"],
			["ice_disconnected", "ice"],
			["invalid_session", "session"],
			["permission_denied", "permission"],
			["protocol_error", "protocol"],
			["realtime_unavailable", "realtime"],
			["recovery_failed", "recovery"],
			["remote_media_failed", "audio_output"],
			["sdp_failed", "sdp"],
			["stop_failed", "stop"],
			["unsupported_browser", "browser"],
		];
		expect([...codes.entries()].toSorted(byPair)).toEqual(expected.toSorted(byPair));
	});

	test("separates a recovery from a first start by the transition reason alone", () => {
		expect(project({ phase: "requesting_permission", reason: "start_requested" }).status).toBe(
			"requesting_permission",
		);
		expect(project({ phase: "requesting_permission", reason: "recovery_requested" }).status).toBe(
			"recovering",
		);
		expect(project({ phase: "negotiating", reason: "permission_granted" }).status).toBe(
			"negotiating",
		);
		expect(project({ phase: "negotiating", reason: "recovery_requested" }).status).toBe(
			"recovering",
		);
		expect(project({ phase: "speaking", reason: "assistant_started" }).status).toBe(
			"agent_speaking",
		);
		expect(project({ phase: "closed", reason: "stopped" }).status).toBe("stopped");
	});

	test("offers a restart for a recoverable failure and a close for a terminal one", () => {
		const recoverable = project({
			phase: "recoverable_error",
			reason: "ice_disconnected",
			message: "The realtime audio connection was lost.",
		});
		expect(recoverable.outcome).toEqual({
			kind: "retry",
			control: "restart",
			label: "Restart voice",
			recovery: "Restart voice to negotiate a new realtime session on the coordinator.",
		});
		expect(recoverable.controls).toEqual({
			canStart: false,
			canMute: false,
			canUnmute: false,
			canStop: true,
			canRestart: true,
			canClose: true,
		});

		const fatal = project({
			phase: "terminal_error",
			reason: "protocol_error",
			message: "The realtime answer did not match its offer.",
		});
		expect(fatal.outcome.kind).toBe("terminal");
		expect(fatal.controls).toEqual({
			canStart: false,
			canMute: false,
			canUnmute: false,
			canStop: false,
			canRestart: false,
			canClose: true,
		});
	});

	test("presents an unconfirmed stop as terminal, matching module serialization", () => {
		const view = project({
			phase: "recoverable_error",
			reason: "stop_failed",
			message: "The realtime host did not confirm that session-1 stopped.",
		});
		expect(view.failure).toEqual({
			code: "stop",
			recoverable: true,
			message: "The realtime host did not confirm that session-1 stopped.",
		});
		expect(view.outcome).toEqual({
			kind: "terminal",
			label: "Close voice",
			recovery:
				"The realtime host never confirmed the stop, so this session cannot restart. Close it and reconnect this pane.",
		});
		expect(view.controls.canRestart).toBe(false);
		expect(view.controls.canStop).toBe(false);
		expect(view.controls.canClose).toBe(true);
	});

	test("falls back to stop when a recoverable failure cannot currently restart", () => {
		const view = projectVoiceSession(
			input({
				media: mediaSnapshot({
					phase: "recoverable_error",
					reason: "app_server_unavailable",
					message: "The Codex app server is unavailable.",
				}),
				transportState: reconnectingState(),
			}),
		);
		expect(view.outcome).toEqual({
			kind: "retry",
			control: "stop",
			label: "Stop voice",
			recovery:
				"Stop voice to close the failed session; it can be started again once the workbench is ready.",
		});
		expect(view.controls.canRestart).toBe(false);
		expect(view.controls.canStop).toBe(true);
	});

	test("never offers a retry control the projection has disabled", () => {
		const cases: VoiceSessionProjectionInput[] = [
			...REACHABLE.map((state) => input({ media: mediaSnapshot(state) })),
			input({ transportState: reconnectingState() }),
			input({ mediaState: { state: "attaching" } }),
			input({ replaced: true, binding: null }),
			input({ busy: true }),
		];
		for (const candidate of cases) {
			const view = projectVoiceSession(candidate);
			if (view.outcome.kind !== "retry") {
				continue;
			}
			const enabled = {
				start: view.controls.canStart,
				stop: view.controls.canStop,
				restart: view.controls.canRestart,
			}[view.outcome.control];
			expect(enabled, `${view.status} offered ${view.outcome.control}`).toBe(true);
		}
	});
});
