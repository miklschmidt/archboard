import { describe, expect, test } from "bun:test";

import {
	capabilities,
	connectedState,
	coordinator,
	mediaSnapshot,
	reconnectingState,
	snapshot,
	type TransportFake,
} from "./support/fakes.js";
import { harness, relinked } from "./support/harness.js";

describe("voice session binding", () => {
	test("binds one session to the pane, child epoch, link, and coordinator it started on", async () => {
		const { session, transport } = harness();
		expect(session.view().binding).toBeNull();

		await session.start();

		expect(session.view().binding).toEqual({
			paneId: "pane-a",
			childId: "child-a",
			epoch: "epoch-a",
			workhorseThreadId: "workhorse-a",
			coordinatorThreadId: "coordinator-a",
		});
		expect(session.view().status).toBe("listening");
		// The pane comes from the caller. Nothing here touches the lease surface.
		expect(transport.captureCalls()).toBe(0);
	});

	test("keeps the caller's pane on the binding across start and restart", async () => {
		const right = harness("pane-right");
		await right.session.start();
		expect(right.session.view().binding?.paneId).toBe("pane-right");
		await right.session.restart();
		expect(right.session.view().binding?.paneId).toBe("pane-right");
		expect(right.session.view().status).toBe("listening");

		// Two adapters over one workbench keep their own panes.
		const left = harness("pane-left");
		await left.session.start();
		expect(left.session.view().binding?.paneId).toBe("pane-left");
		expect(right.session.view().binding?.paneId).toBe("pane-right");
	});

	test("never reaches for the lease surface while projecting", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		transport.set(connectedState());
		realtime.set(mediaSnapshot({ phase: "speaking", reason: "assistant_started" }));
		for (let frame = 0; frame < 30; frame += 1) realtime.setLevel(frame / 30);
		session.refresh();
		await session.stop();

		// captureCommandTarget expires and renews the command lease and broadcasts
		// before it can refuse, so a read that called it would write.
		expect(transport.captureCalls()).toBe(0);
	});

	test("a stale snapshot naming another child never condemns the binding", async () => {
		const { session, transport } = harness();
		await session.start();
		const bound = session.view().binding;

		transport.set({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: relinked("child-b", "epoch-b", "workhorse-b"),
			sequence: 7,
			expectedSequence: 8,
			receivedSequence: 12,
			reason: "The Codex workbench stream skipped a sequence.",
		});

		expect(session.view().status).toBe("listening");
		expect(session.view().failure).toBeNull();
		expect(session.view().binding).toEqual(bound);

		// The same identities on a current readiness projection are a replacement.
		transport.set(connectedState(relinked("child-b", "epoch-b", "workhorse-b")));
		expect(session.view().failure?.code).toBe("replaced");
	});

	test("keeps its binding through a reconnect that returns the same child", async () => {
		const { session, transport } = harness();
		await session.start();
		const bound = session.view().binding;

		transport.set(reconnectingState());
		expect(session.view().status).toBe("listening");
		expect(session.view().binding).toEqual(bound);
		expect(session.view().failure).toBeNull();

		transport.set(connectedState());
		expect(session.view().status).toBe("listening");
		expect(session.view().binding).toEqual(bound);
		expect(session.view().controls.canStop).toBe(true);
	});

	test("keeps its binding when a reconnect retains a snapshot with no executable link", async () => {
		const { session, transport } = harness();
		await session.start();

		transport.set(
			reconnectingState(
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
		);

		expect(session.view().status).toBe("listening");
		expect(session.view().failure).toBeNull();
	});

	test("goes terminal when the child epoch, link, coordinator, or pane is replaced", async () => {
		for (const [name, apply] of [
			[
				"child",
				(t: TransportFake) => t.set(connectedState(relinked("child-b", "epoch-a", "workhorse-a"))),
			],
			[
				"epoch",
				(t: TransportFake) => t.set(connectedState(relinked("child-a", "epoch-b", "workhorse-a"))),
			],
			[
				"link",
				(t: TransportFake) => t.set(connectedState(relinked("child-a", "epoch-a", "workhorse-b"))),
			],
			[
				"coordinator",
				(t: TransportFake) =>
					t.set(
						connectedState(
							snapshot({ coordinator: coordinator({ threadId: "coordinator-b" as never }) }),
						),
					),
			],
		] as const) {
			const { session, transport } = harness();
			await session.start();
			apply(transport);

			const view = session.view();
			expect(view.status, name).toBe("failed");
			expect(view.failure?.code, name).toBe("replaced");
			expect(view.outcome.kind, name).toBe("terminal");
			expect(view.controls, name).toEqual({
				canStart: false,
				canMute: false,
				canUnmute: false,
				canStop: false,
				canRestart: false,
				canClose: true,
			});
		}
	});

	test("only close() clears a replacement, and it starts no second session by itself", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		transport.set(connectedState(relinked("child-b", "epoch-b", "workhorse-b")));

		expect(await session.start()).toBe(session.view());
		expect(await session.restart()).toBe(session.view());
		expect(realtime.calls()).toEqual(["start"]);

		await session.close();
		// A replaced session may still hold the microphone, so close stops it.
		expect(realtime.calls()).toEqual(["start", "stop"]);
		expect(session.view().binding).toBeNull();
		expect(session.view().status).toBe("ready");
		expect(session.view().controls.canStart).toBe(true);
	});

	test("close() is refused while the session is usable", async () => {
		const { session, realtime } = harness();
		await session.start();
		expect(session.view().controls.canClose).toBe(false);
		await session.close();
		expect(session.view().status).toBe("listening");
		expect(session.view().binding).not.toBeNull();
		expect(realtime.calls()).toEqual(["start"]);
	});
});

describe("voice session controls", () => {
	test("refuses a second start while a session is live", async () => {
		const { session, realtime } = harness();
		await session.start();
		expect(session.view().controls.canStart).toBe(false);

		await session.start();
		expect(realtime.calls()).toEqual(["start"]);
	});

	test("stops, then starts again on the same pane", async () => {
		const { session, realtime } = harness();
		await session.start();
		await session.stop();

		expect(session.view().status).toBe("stopped");
		expect(session.view().controls.canStart).toBe(true);
		expect(session.view().controls.canStop).toBe(false);

		await session.start();
		expect(session.view().status).toBe("listening");
		expect(realtime.calls()).toEqual(["start", "stop", "start"]);
	});

	test("restart stops before it starts and only starts once the phase is closed", async () => {
		const { session, realtime } = harness();
		await session.start();
		await session.restart();

		expect(realtime.calls()).toEqual(["start", "stop", "start"]);
		expect(session.view().status).toBe("listening");
	});

	test("restart refuses to start when the stop did not confirm closed", async () => {
		const { session, realtime } = harness();
		await session.start();
		const unconfirmed = mediaSnapshot({
			phase: "recoverable_error",
			reason: "stop_failed",
			message: "The realtime host did not confirm that session-1 stopped.",
		});
		realtime.onStop(async () => {
			realtime.set(unconfirmed);
			return unconfirmed;
		});

		await session.restart();

		expect(realtime.calls()).toEqual(["start", "stop"]);
		expect(session.view().status).toBe("failed");
		expect(session.view().failure?.code).toBe("stop");
		expect(session.view().outcome.kind).toBe("terminal");
		expect(session.view().controls.canRestart).toBe(false);
	});

	test("surfaces a rejected control without choosing a recovery of its own", async () => {
		const { session, realtime } = harness();
		realtime.onStart(async () => {
			throw new Error("The Codex browser media owner has no active transport.");
		});

		const view = await session.start();

		expect(view.status).toBe("failed");
		expect(view.failure).toEqual({
			code: "realtime",
			recoverable: false,
			message: "The Codex browser media owner has no active transport.",
		});
		expect(realtime.calls()).toEqual(["start"]);
	});

	test("refuses every control while the workbench cannot start one", async () => {
		const { session, transport } = harness();
		transport.setCapabilities(capabilities({ canClaimLease: false }));

		expect(session.view().controls.canStart).toBe(false);
		await session.start();
		expect(session.view().status).toBe("unavailable");
	});
});
