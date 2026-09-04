import { describe, expect, test } from "bun:test";

import { mediaSnapshot } from "./support/fakes.js";
import { harness, listening } from "./support/harness.js";

/**
 * The adapter's half of the TASK-143.04.02 mute path. `muted` is reachable from
 * `listening` alone and `listening` from `muted` alone, so the whole contract is
 * that the offer follows the phase and a command is never sent for an offer that
 * was not made.
 */
describe("voice session mute", () => {
	test("offers mute from listening alone and unmute from muted alone", async () => {
		const { session, realtime } = harness();
		expect(session.view().controls.canMute).toBe(false);
		expect(session.view().controls.canUnmute).toBe(false);

		realtime.set(listening());

		expect(session.view().controls).toMatchObject({ canMute: true, canUnmute: false });

		const muted = await session.mute();

		expect(realtime.calls()).toEqual(["mute"]);
		expect(muted.status).toBe("muted");
		expect(muted.label).toBe("Microphone muted");
		expect(muted.detail).toBe("The microphone is muted, so the coordinator hears nothing.");
		expect(muted.controls).toMatchObject({ canMute: false, canUnmute: true, canStop: true });

		const unmuted = await session.unmute();

		expect(realtime.calls()).toEqual(["mute", "unmute"]);
		expect(unmuted.status).toBe("listening");
		expect(unmuted.detail).toBe("The microphone was unmuted and voice is listening.");
		expect(unmuted.controls).toMatchObject({ canMute: true, canUnmute: false });
	});

	test("sends nothing for a toggle the projection did not offer", async () => {
		const { session, realtime } = harness();

		// Idle: neither is offered.
		await session.mute();
		await session.unmute();
		expect(realtime.calls()).toEqual([]);

		// Listening: the unmute is still not offered.
		realtime.set(listening());
		await session.unmute();
		expect(realtime.calls()).toEqual([]);

		// A run the coordinator is already answering: mute is out of the phase.
		realtime.set(mediaSnapshot({ phase: "processing", reason: "input_completed" }));
		await session.mute();
		expect(realtime.calls()).toEqual([]);

		// And a session this adapter has retired refuses both.
		realtime.set(listening());
		session.dispose();
		await session.mute();
		await session.unmute();
		expect(realtime.calls()).toEqual([]);
	});

	test("keeps the binding and the session identity across a mute", async () => {
		const { session, realtime, transport } = harness("pane-a");
		await session.start();
		const before = session.view();
		expect(before.status).toBe("listening");

		await session.mute();

		const after = session.view();
		expect(after.binding).toEqual(before.binding);
		expect(after.sessionId).toBe(before.sessionId);
		// Muting is a local track toggle, so it must not reach the lease surface.
		expect(transport.captureCalls()).toBe(0);
		expect(realtime.calls()).toEqual(["start", "mute"]);
	});

	test("surfaces a refused mute as a failure the person can act on", async () => {
		const { session, realtime } = harness();
		realtime.set(listening());
		realtime.onMute(async () => {
			throw new Error("The microphone track could not be disabled.");
		});

		const view = await session.mute();

		// The run really is still listening — the refusal is the news, not a new
		// phase — so the failure is attached to the live run rather than replacing
		// it, and the person is offered a control instead of a silent no-op.
		expect(view.status).toBe("listening");
		expect(view.failure).toMatchObject({
			code: "realtime",
			message: "The microphone track could not be disabled.",
		});
		expect(view.detail).toContain("The microphone track could not be disabled.");
		expect(view.accessibleStatus).toContain("The microphone track could not be disabled.");
		expect(view.outcome).toMatchObject({ kind: "retry", control: "restart" });
		expect(view.controls.canMute).toBe(true);
	});
});
