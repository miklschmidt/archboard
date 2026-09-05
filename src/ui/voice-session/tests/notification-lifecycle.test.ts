import { describe, expect, test } from "bun:test";

import type { RealtimeMediaSnapshot } from "@/ui/codex-realtime";
import {
	capabilities,
	connectedState,
	correlation,
	mediaSnapshot,
} from "@/ui/voice-session/tests/support/fakes";
import { harness, listening } from "@/ui/voice-session/tests/support/harness";
import { relinked } from "@/ui/voice-session/tests/support/workbench-fixture";

/**
 * Never resolves a start.
 */
function neverReleased(): void {
	// The start stays pending until the test releases it.
}

describe("voice session ordering and disposal", () => {
	test("discards a superseded control's late resolution", async () => {
		const { session, realtime } = harness();
		let release: (value: RealtimeMediaSnapshot) => void = neverReleased;
		realtime.onStart(
			() =>
				new Promise<RealtimeMediaSnapshot>((resolve) => {
					release = resolve;
				}),
		);

		const pending = session.start();
		expect(session.view().controls.canStart).toBe(false);

		// The pane is disposed before the in-flight start resolves.
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
		transport.set(connectedState(relinked("workhorse")));
		await session.close();

		realtime.set(mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }));
		expect(session.view().status).toBe("ready");

		// A run the media owner starts afterwards is a new session, not the
		// retired one, and shows normally.
		realtime.set(
			mediaSnapshot(
				{ phase: "listening", reason: "negotiation_succeeded" },
				{ correlation: correlation("session-2") },
			),
		);
		expect(session.view().status).toBe("listening");
	});

	test("sees a browser-originated realtime change with no transport delta", async () => {
		const { session, realtime, notifications } = harness();
		await session.start();
		expect(session.view().status).toBe("listening");
		const settled = notifications();

		// The microphone is unplugged. Nothing reaches the transport; the media
		// owner's own publication is the whole news, and the view must move.
		realtime.set(
			mediaSnapshot({
				phase: "recoverable_error",
				reason: "device_lost",
				message: "The microphone was removed.",
			}),
		);

		expect(notifications()).toBe(settled + 1);
		expect(session.view().status).toBe("failed");
		expect(session.view().failure?.code).toBe("device");
		expect(session.view().outcome.kind).toBe("retry");
	});

	test("keeps sixty output level frames off every status subscriber", async () => {
		const { session, realtime, transport, notifications, levelNotifications } = harness();
		await session.start();
		const status = notifications();
		const levels = levelNotifications();
		const reads = transport.reads();
		const view = session.view();

		for (let frame = 1; frame <= 60; frame += 1) {
			realtime.levels.set(frame / 60);
		}

		// The level moved sixty times on its own channel; the status view did not
		// move at all, the object React memoizes is the same one it already had,
		// and no frame read the transport.
		expect(levelNotifications()).toBe(levels + 60);
		expect(notifications()).toBe(status);
		expect(session.view()).toBe(view);
		expect(session.level()).toBeCloseTo(1);
		expect(transport.reads()).toBe(reads);
	});

	test("republishes on a capabilities-only transport notification", async () => {
		const { session, transport, notifications } = harness();
		await session.start();
		expect(session.view().controls.canRestart).toBe(true);
		const status = notifications();

		// The transport rebuilds capabilities on every call and moves them on
		// lease claim, renewal, release and expiry without touching the state
		// object, so the transport channel is never gated on state identity.
		transport.setCapabilities(capabilities({ canClaimLease: false }));

		expect(notifications()).toBe(status + 1);
		expect(session.view().controls.canRestart).toBe(false);
		expect(session.view()).toBe(session.refresh());
	});

	test("publishes to subscribers only when the projected view changed", async () => {
		const { session, transport, notifications } = harness();
		const before = notifications();
		transport.set(connectedState());
		expect(notifications()).toBe(before);

		await session.start();
		expect(notifications()).toBeGreaterThan(before);
	});

	test("disposal releases every subscription and refuses further controls", async () => {
		const { session, realtime, transport } = harness();
		await session.start();
		const settled = session.view();
		expect(transport.listenerCount()).toBe(1);
		expect(realtime.listenerCount()).toBe(1);
		expect(realtime.levels.listenerCount()).toBe(1);

		session.dispose();

		expect(transport.listenerCount()).toBe(0);
		expect(realtime.listenerCount()).toBe(0);
		expect(realtime.levels.listenerCount()).toBe(0);
		expect(await session.stop()).toBe(settled);
		expect(await session.restart()).toBe(settled);
		expect(await session.start()).toBe(settled);
		expect(await session.close()).toBe(settled);
		expect(session.refresh()).toBe(settled);
		// The adapter reads the media owner; it never stops or disposes one.
		expect(realtime.calls()).toEqual(["start"]);
		session.dispose();
		expect(transport.listenerCount()).toBe(0);
	});
});
