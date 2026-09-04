import { afterEach, describe, expect, test } from "bun:test";

import { createRealtimeMediaSession } from "../index.js";
import {
	correlation,
	FakeBrowser,
	host,
	restoreFakeBrowsers,
} from "./support/media-session-fakes.js";

afterEach(restoreFakeBrowsers);

// The mute path exists because AC #2 of TASK-143.04.02 needs a real one. It is
// deliberately the smallest possible: the captured local audio track carries a
// browser-native `enabled` flag, so silencing the microphone sends the realtime
// host nothing and renegotiates nothing. These owners pin that the flag and the
// published phase move together, that no host command is issued, and that a
// press arriving in any other phase is inert rather than a failure.
describe("realtime media mute", () => {
	test("disables the captured track, publishes muted, and sends the host nothing", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		const published: string[] = [];
		session.subscribe((snapshot) => published.push(snapshot.state.phase));
		await session.start(correlation());
		expect(session.getSnapshot().state.phase).toBe("listening");
		expect(env.localTrack.enabled).toBe(true);
		const hostCallsBeforeMute = env.order.length;

		const muted = await session.mute();

		expect(muted.state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(session.getSnapshot().state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(env.localTrack.enabled).toBe(false);
		// Nothing reached the wire: no stop, no further negotiation step.
		expect(env.stopCount).toBe(0);
		expect(env.order.length).toBe(hostCallsBeforeMute);
		expect(published.at(-1)).toBe("muted");

		const unmuted = await session.unmute();

		expect(unmuted.state).toEqual({ phase: "listening", reason: "unmute_requested" });
		expect(env.localTrack.enabled).toBe(true);
		expect(env.stopCount).toBe(0);
		expect(published.filter((phase) => phase === "muted")).toHaveLength(1);

		await session.stop();
		env.assertReleased();
	});

	test("keeps metering a muted run and releases it through the ordinary stop", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		await session.mute();

		env.frame();

		// The meter is the level, not the phase: a muted run still publishes and
		// stays muted, so a level frame can never silently unmute a session.
		expect(session.getSnapshot().state.phase).toBe("muted");

		const stopped = await session.stop();

		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(env.stopCount).toBe(1);
		env.assertReleased();
	});

	test("leaves every other phase exactly as it was", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));

		// No run at all.
		expect((await session.mute()).state).toEqual({ phase: "idle", reason: "created" });
		expect((await session.unmute()).state).toEqual({ phase: "idle", reason: "created" });

		await session.start(correlation());
		// An unmute while listening, and a second mute while already muted, are
		// both transitions the state machine forbids; neither may raise.
		expect((await session.unmute()).state.phase).toBe("listening");
		await session.mute();
		expect((await session.mute()).state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(env.localTrack.enabled).toBe(false);

		await session.stop();
		expect((await session.mute()).state.phase).toBe("closed");
		expect((await session.unmute()).state.phase).toBe("closed");
		env.assertReleased();
	});

	test("refuses to mute a failed run and keeps its failure visible", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());

		env.localTrack.lose();
		await Promise.resolve();

		const state = session.getSnapshot().state;
		expect(state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect((await session.mute()).state).toEqual(state);
		expect((await session.unmute()).state).toEqual(state);
	});
});
