import { describe, expect, test } from "bun:test";

import type { RealtimeMediaSnapshot } from "../../codex-realtime/index.js";
import { createVoiceSession, type VoiceSession } from "../index.js";
import {
	capabilities,
	connectedState,
	coordinator,
	correlation,
	mediaSnapshot,
	reconnectingState,
	realtimeFake,
	snapshot,
	transportFake,
	type RealtimeFake,
	type TransportFake,
} from "./support/fakes.js";

type ExecutableLink = Extract<
	ReturnType<typeof snapshot>["threadLink"],
	{ readonly state: "executable" }
>;

interface Harness {
	readonly session: VoiceSession;
	readonly realtime: RealtimeFake;
	readonly transport: TransportFake;
	readonly notifications: () => number;
}

function harness(): Harness {
	const realtime = realtimeFake();
	const transport = transportFake();
	const session = createVoiceSession({ realtime, transport });
	let notifications = 0;
	session.subscribe(() => {
		notifications += 1;
	});
	return { session, realtime, transport, notifications: () => notifications };
}

const NEVER_RELEASED = (): void => undefined;

function listening(): RealtimeMediaSnapshot {
	return mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" });
}

function relinked(childId: string, epoch: string, threadId: string) {
	return snapshot({
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: childId as ExecutableLink["childId"],
			epoch: epoch as ExecutableLink["epoch"],
			threadId: threadId as ExecutableLink["threadId"],
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	});
}

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
		expect(transport.captureCalls()).toBeGreaterThan(0);
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
			["pane", (t: TransportFake) => t.setPaneId("pane-b")],
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

		session.close();
		expect(session.view().binding).toBeNull();
		expect(session.view().status).toBe("ready");
		expect(session.view().controls.canStart).toBe(true);
	});

	test("close() is refused while the session is usable", async () => {
		const { session } = harness();
		await session.start();
		expect(session.view().controls.canClose).toBe(false);
		session.close();
		expect(session.view().status).toBe("listening");
		expect(session.view().binding).not.toBeNull();
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

describe("voice session ordering and disposal", () => {
	test("discards a superseded control's late resolution", async () => {
		const { session, realtime } = harness();
		let release: (value: RealtimeMediaSnapshot) => void = NEVER_RELEASED;
		realtime.onStart(
			() =>
				new Promise<RealtimeMediaSnapshot>((resolve) => {
					release = resolve;
				}),
		);

		const pending = session.start();
		expect(session.view().controls.canStart).toBe(false);

		// A replacement lands, and the person closes the session, before the
		// in-flight start resolves.
		realtime.set(listening());
		session.dispose();
		const settled = session.view();
		release(listening());
		const late = await pending;

		expect(late).toBe(settled);
		expect(session.view()).toBe(settled);
		expect(session.view().status).not.toBe("listening");
	});

	test("a late resolution cannot revive a session close() retired", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		transport.set(connectedState(relinked("child-b", "epoch-b", "workhorse-b")));
		session.close();

		realtime.set(mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }));
		expect(session.refresh().status).toBe("ready");

		// A run the media owner starts afterwards is a new session, not the
		// retired one, and shows normally.
		realtime.set(
			mediaSnapshot(
				{ phase: "listening", reason: "negotiation_succeeded" },
				{
					correlation: correlation("session-2"),
				},
			),
		);
		expect(session.refresh().status).toBe("listening");
	});

	test("publishes to subscribers only when the projected view changed", async () => {
		const { session, transport, notifications } = harness();
		const before = notifications();
		transport.set(connectedState());
		expect(notifications()).toBe(before);

		await session.start();
		expect(notifications()).toBeGreaterThan(before);
	});

	test("disposal releases the transport subscription and refuses further controls", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		const settled = session.view();
		expect(transport.listenerCount()).toBe(1);

		session.dispose();

		expect(transport.listenerCount()).toBe(0);
		expect(await session.stop()).toBe(settled);
		expect(await session.restart()).toBe(settled);
		expect(await session.start()).toBe(settled);
		expect(session.close()).toBe(settled);
		expect(session.refresh()).toBe(settled);
		// The adapter reads the media owner; it never stops or disposes one.
		expect(realtime.calls()).toEqual(["start"]);
		session.dispose();
		expect(transport.listenerCount()).toBe(0);
	});
});
