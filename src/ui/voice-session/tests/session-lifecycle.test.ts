import { describe, expect, test } from "bun:test";

import {
	capabilities,
	connectedState,
	mediaSnapshot,
	reconnectingState,
	staleState,
	type TransportFake,
} from "@/ui/voice-session/tests/support/fakes";
import { harness } from "@/ui/voice-session/tests/support/harness";
import {
	DEFAULT_BINDING,
	UNBOUND_LINK,
	coordinator,
	repointed,
	snapshot,
	threadId,
} from "@/ui/voice-session/tests/support/workbench-fixture";

const NO_CONTROLS = {
	canStart: false,
	canMute: false,
	canUnmute: false,
	canStop: false,
	canRestart: false,
	canClose: true,
};

/**
 * Points the transport at a snapshot whose coordinator moved.
 * @param transport The transport fake.
 */
function replaceCoordinator(transport: TransportFake): void {
	transport.set(
		connectedState(snapshot({ coordinator: coordinator({ threadId: threadId("coordinator-b") }) })),
	);
}

describe("voice session binding", () => {
	test("binds one session to the pane, child epoch and link it started on", async () => {
		const { session } = harness();
		expect(session.view().binding).toBeNull();

		await session.start();

		expect(session.view().binding).toEqual({ paneId: "pane-a", ...DEFAULT_BINDING });
		expect(session.view().status).toBe("listening");
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

	test("a stale snapshot naming another child never condemns the binding", async () => {
		const { session, transport } = harness();
		await session.start();
		const bound = session.view().binding;

		transport.set(staleState(repointed("child")));

		expect(session.view().status).toBe("listening");
		expect(session.view().failure).toBeNull();
		expect(session.view().binding).toEqual(bound);

		// The same identities on a current readiness projection are a replacement.
		transport.set(connectedState(repointed("child")));
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

		transport.set(reconnectingState(snapshot({ threadLink: UNBOUND_LINK })));

		expect(session.view().status).toBe("listening");
		expect(session.view().failure).toBeNull();
	});

	test("keeps the session when a voice start replaces the coordinator", async () => {
		const { session, transport } = harness();
		await session.start();

		replaceCoordinator(transport);

		expect(session.view().status).toBe("listening");
		expect(session.view().failure).toBeNull();
	});

	test.each(["child", "workhorse"] as const)(
		"goes terminal when the %s is replaced",
		async (change) => {
			const { session, transport } = harness();
			await session.start();
			transport.set(connectedState(repointed(change)));

			const view = session.view();
			expect(view.status).toBe("failed");
			expect(view.failure?.code).toBe("replaced");
			expect(view.outcome.kind).toBe("terminal");
			expect(view.controls).toEqual(NO_CONTROLS);
		},
	);

	test("only close() clears a replacement, and it starts no second session by itself", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		transport.set(connectedState(repointed("workhorse")));

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
			message: "The realtime server did not confirm that session-1 stopped.",
		});
		realtime.onStop(() => {
			realtime.set(unconfirmed);
			return Promise.resolve(unconfirmed);
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
		realtime.onStart(() =>
			Promise.reject(new Error("The Codex browser media owner has no active transport.")),
		);

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

	test("keeps the model's level while muted", async () => {
		const { session, realtime } = harness();
		await session.start();

		realtime.levels.set(0.4);
		await session.mute();
		expect(session.view().status).toBe("muted");
		// The model's output still reaches the level while the microphone is muted.
		expect(session.level()).toBe(0.4);
	});
});
