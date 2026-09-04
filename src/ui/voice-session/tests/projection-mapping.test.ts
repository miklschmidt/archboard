import { describe, expect, test } from "bun:test";

import {
	INITIAL_REALTIME_STATE,
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	type RealtimeState,
} from "../../codex-realtime/index.js";
import {
	projectVoiceSession,
	VOICE_SESSION_FAILURE_CODES,
	VOICE_SESSION_STATUSES,
	type VoiceSessionProjectionInput,
	type VoiceSessionStatus,
	type VoiceSessionView,
} from "../index.js";
import {
	capabilities,
	connectedState,
	coordinator,
	mediaSnapshot,
	reconnectingState,
	snapshot,
	voice,
} from "./support/fakes.js";

/**
 * Every state the neutral host contract can actually reach: the initial one plus
 * every (destination phase, reason) pair the transition table allows. The
 * projection must map all of them, so this is the exhaustiveness source rather
 * than a hand-kept list.
 */
function reachableStates(): readonly RealtimeState[] {
	const states: RealtimeState[] = [INITIAL_REALTIME_STATE];
	for (const from of REALTIME_PHASES) {
		const destinations = REALTIME_TRANSITIONS[from];
		for (const to of REALTIME_PHASES) {
			for (const reason of destinations[to] ?? []) {
				const message = `${to} for ${reason}`;
				states.push(
					to === "recoverable_error" || to === "terminal_error"
						? ({ phase: to, reason, message } as RealtimeState)
						: ({ phase: to, reason } as RealtimeState),
				);
			}
		}
	}
	return states;
}

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

function project(state: RealtimeState): VoiceSessionView {
	return projectVoiceSession(input({ media: mediaSnapshot(state) }));
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
			// Narrated sentences are this module's own words; a failure detail
			// carries the module's authoritative message and is not repunctuated.
			if (state.phase === "recoverable_error" || state.phase === "terminal_error")
				expect(view.detail.endsWith(state.message), where).toBe(true);
			else expect(view.detail.endsWith("."), where).toBe(true);
			expect(view.accessibleStatus.startsWith(`${view.label}. ${view.detail}`), where).toBe(true);
			expect(Object.isFrozen(view), where).toBe(true);
			seen.add(view.status);
		}
		// Every status but `unavailable` is reachable from the realtime state
		// machine alone; `unavailable` belongs to the transport and host gates.
		expect([...seen].toSorted()).toEqual(
			VOICE_SESSION_STATUSES.filter((status) => status !== "unavailable").toSorted(),
		);
	});

	test("gives every realtime error reason its own presentation failure code", () => {
		const codes = new Map<string, string>();
		for (const state of REACHABLE) {
			if (state.phase !== "recoverable_error" && state.phase !== "terminal_error") continue;
			const view = project(state);
			expect(view.status, state.reason).toBe("failed");
			expect(view.failure, state.reason).not.toBeNull();
			expect(VOICE_SESSION_FAILURE_CODES, state.reason).toContain(view.failure!.code);
			expect(view.failure!.message, state.reason).toBe(state.message);
			expect(view.failure!.recoverable, state.reason).toBe(state.phase === "recoverable_error");
			codes.set(state.reason, view.failure!.code);
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
		expect([...codes.entries()].toSorted()).toEqual(expected.toSorted());
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
			if (view.outcome.kind !== "retry") continue;
			const control = view.outcome.control;
			const enabled = {
				start: view.controls.canStart,
				stop: view.controls.canStop,
				restart: view.controls.canRestart,
			}[control];
			expect(enabled, `${view.status} offered ${control}`).toBe(true);
		}
	});
});

describe("voice session availability mapping", () => {
	test("names each transport, media, and host gate that blocks a start", () => {
		const gates: readonly [VoiceSessionProjectionInput, string][] = [
			[input({ transportState: reconnectingState() }), "The Codex workbench connection dropped."],
			[
				input({ mediaState: { state: "attaching" } }),
				"Archboard is installing realtime microphone and audio support in this browser.",
			],
			[
				input({
					transportState: connectedState(
						snapshot({ readiness: { kind: "readiness", state: "account_ready" } }),
					),
					capabilities: capabilities({ readiness: "account_ready" }),
				}),
				"The Codex workbench is not ready for thread work yet.",
			],
			[
				input({
					transportState: connectedState(
						snapshot({
							threadLink: {
								kind: "thread_link",
								state: "unbound",
								childId: null,
								epoch: null,
								threadId: null,
								sourcePresentation: null,
								status: "notLoaded",
								loaded: false,
								canAcceptDirectInput: false,
								reason: null,
							},
						}),
					),
				}),
				"This pane has no executable thread link to bind a voice session to.",
			],
			[
				input({ capabilities: capabilities({ canClaimLease: false }) }),
				"This pane cannot claim the command lease a voice session needs.",
			],
			[
				input({
					transportState: connectedState(
						snapshot({
							coordinator: coordinator({ state: "starting", threadId: null, reason: null }),
						}),
					),
				}),
				"The host is still confirming the voice coordinator.",
			],
			[
				input({
					transportState: connectedState(
						snapshot({
							voice: voice({ state: "unavailable", reason: "Voice is off for this pane." }),
						}),
					),
				}),
				"Voice is off for this pane.",
			],
		];
		for (const [candidate, detail] of gates) {
			const view = projectVoiceSession(candidate);
			expect(view.status, detail).toBe("unavailable");
			expect(view.detail, detail).toBe(detail);
			expect(view.controls.canStart, detail).toBe(false);
			expect(view.accessibleStatus, detail).toBe(`Voice unavailable. ${detail}`);
		}
	});

	test("presents a host coordinator failure and a host voice failure with their own codes", () => {
		const coordinatorFailed = projectVoiceSession(
			input({
				transportState: connectedState(
					snapshot({
						coordinator: coordinator({
							state: "failed",
							threadId: null,
							reason: "The coordinator thread ended.",
						}),
					}),
				),
			}),
		);
		expect(coordinatorFailed.status).toBe("failed");
		expect(coordinatorFailed.failure).toEqual({
			code: "coordinator",
			recoverable: false,
			message: "The coordinator thread ended.",
		});

		const voiceFailed = projectVoiceSession(
			input({
				transportState: connectedState(
					snapshot({ voice: voice({ state: "failed", reason: "The realtime session ended." }) }),
				),
			}),
		);
		expect(voiceFailed.status).toBe("failed");
		expect(voiceFailed.failure?.code).toBe("host_voice");
	});

	test("presents each media owner unavailability with its own failure code", () => {
		const cases = [
			["media_api_unavailable", "browser"],
			["permission_denied", "permission"],
			["negotiation_failed", "realtime"],
		] as const;
		for (const [reason, code] of cases) {
			const view = projectVoiceSession(
				input({ mediaState: { state: "unavailable", reason, message: `${reason} happened.` } }),
			);
			expect(view.status, reason).toBe("failed");
			expect(view.failure?.code, reason).toBe(code);
		}
		for (const reason of ["detached", "socket_closed"] as const) {
			const view = projectVoiceSession(
				input({ mediaState: { state: "unavailable", reason, message: `${reason} happened.` } }),
			);
			expect(view.status, reason).toBe("unavailable");
			expect(view.failure, reason).toBeNull();
		}
	});

	test("reads ready and every accessible sentence as one announceable string", () => {
		const ready = projectVoiceSession(input());
		expect(ready.status).toBe("ready");
		expect(ready.accessibleStatus).toBe(
			"Voice ready. Voice is ready to start on this pane's linked coordinator.",
		);
		expect(ready.controls.canStart).toBe(true);

		const listening = project({ phase: "listening", reason: "negotiation_succeeded" });
		expect(listening.accessibleStatus).toBe("Listening. Voice is connected and listening.");

		const replaced = projectVoiceSession(input({ replaced: true }));
		expect(replaced.status).toBe("failed");
		expect(replaced.failure?.code).toBe("replaced");
		expect(replaced.accessibleStatus).toBe(
			"Voice failed. This voice session's pane, thread link, or coordinator failed. The pane, child epoch, thread link, or coordinator this voice session was bound to is no longer the current one. Close this session; a new one can then be started on the current thread link.",
		);
	});

	test("disables every control while a control this adapter drove is in flight", () => {
		const view = projectVoiceSession(
			input({
				media: mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
				busy: true,
			}),
		);
		expect(view.controls).toEqual({
			canStart: false,
			canStop: false,
			canRestart: false,
			canClose: false,
		});
	});
});
