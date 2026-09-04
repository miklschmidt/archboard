import { describe, expect, test } from "bun:test";

import type { RealtimeState } from "../../codex-realtime/index.js";
import {
	projectVoiceSession,
	type VoiceSessionProjectionInput,
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

	test("shows a host coordinator failure that arrives while a run is healthy", () => {
		const failed = snapshot({
			coordinator: coordinator({
				state: "failed",
				threadId: null,
				reason: "The coordinator thread ended.",
			}),
		});
		const view = projectVoiceSession(
			input({
				media: mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
				transportState: connectedState(failed),
			}),
		);
		expect(view.status).toBe("listening");
		expect(view.failure).toEqual({
			code: "coordinator",
			recoverable: false,
			message: "The coordinator thread ended.",
		});
		expect(view.detail).toBe(
			"Voice is connected and listening. The voice coordinator failed. The coordinator thread ended.",
		);
		// The coordinator is what voice attaches to, so a restart cannot help.
		expect(view.outcome).toEqual({
			kind: "retry",
			control: "stop",
			label: "Stop voice",
			recovery:
				"Stop voice to close the failed session; it can be started again once the workbench is ready.",
		});
	});

	test("renames a live run to recovering while the host says it is recovering", () => {
		const recovering = snapshot({
			voice: voice({ state: "recovering", reason: "The host is renegotiating realtime audio." }),
		});
		const live = projectVoiceSession(
			input({
				media: mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
				transportState: connectedState(recovering),
			}),
		);
		expect(live.status).toBe("recovering");
		expect(live.label).toBe("Recovering voice");
		expect(live.detail).toBe(
			"Voice is connected and listening. The host is renegotiating realtime audio.",
		);

		// A stop or a closed run is not a recovery, whatever the host is doing.
		const stopping = projectVoiceSession(
			input({
				media: mediaSnapshot({ phase: "stopping", reason: "stop_requested" }),
				transportState: connectedState(recovering),
			}),
		);
		expect(stopping.status).toBe("stopping");
	});

	test("treats a stale snapshot as unable to anchor a start", () => {
		const stale = {
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 7,
			expectedSequence: 8,
			receivedSequence: 12,
			reason: "The Codex workbench stream skipped a sequence.",
		} as const;
		const idle = projectVoiceSession(input({ transportState: stale }));
		expect(idle.status).toBe("unavailable");
		expect(idle.detail).toBe("The Codex workbench stream skipped a sequence.");
		expect(idle.controls.canStart).toBe(false);

		const live = projectVoiceSession(
			input({
				media: mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
				transportState: stale,
			}),
		);
		expect(live.status).toBe("listening");
		expect(live.controls.canStop).toBe(true);
		expect(live.controls.canRestart).toBe(false);
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
