import { describe, expect, test } from "bun:test";

import { createRealtimeMediaSession } from "@/ui/codex-realtime";
import {
	FakeBrowser,
	correlation,
	host,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";

/**
 * A session over a fresh fake browser.
 * @param env The fake browser.
 * @returns The session.
 */
function session(env: FakeBrowser): ReturnType<typeof createRealtimeMediaSession> {
	return createRealtimeMediaSession(host(env), { environment: env.environment() });
}

// The mute path is deliberately the smallest possible: the captured local
// audio track carries a browser-native `enabled` flag, so silencing the
// microphone sends the realtime host nothing and renegotiates nothing. These
// owners pin that the flag and the published phase move together, that no
// host command is issued, that a press arriving in any other phase is inert
// rather than a failure, and that the model output level never follows the
// microphone.
describe("realtime media mute", () => {
	test("disables the captured track, publishes muted, and sends the host nothing", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const published: string[] = [];
		media.subscribe((snapshot) => published.push(snapshot.state.phase));
		await media.start(correlation());
		expect(media.getSnapshot().state.phase).toBe("listening");
		expect(env.localTrack.enabled).toBe(true);
		const hostCallsBeforeMute = env.order.length;

		const muted = await media.mute();

		expect(muted.state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(media.getSnapshot().state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(env.localTrack.enabled).toBe(false);
		// Nothing reached the wire: no stop, no further negotiation step.
		expect(env.stopCount).toBe(0);
		expect(env.order.length).toBe(hostCallsBeforeMute);
		expect(published.at(-1)).toBe("muted");

		const unmuted = await media.unmute();

		expect(unmuted.state).toEqual({ phase: "listening", reason: "unmute_requested" });
		expect(env.localTrack.enabled).toBe(true);
		expect(env.stopCount).toBe(0);
		expect(published.filter((phase) => phase === "muted")).toHaveLength(1);

		await media.stop();
		env.assertReleased();
	});

	test("keeps metering the model output while muted and releases it through the ordinary stop", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		await media.mute();

		env.frame();

		// The meter is the model's output, not the microphone: a muted run still
		// measures what the model says, and a level frame can never unmute it.
		expect(media.outputLevel.current()).toBeGreaterThan(0);
		expect(media.getSnapshot().state.phase).toBe("muted");
		expect(env.localTrack.enabled).toBe(false);

		const stopped = await media.stop();

		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(media.outputLevel.current()).toBe(0);
		expect(env.stopCount).toBe(1);
		env.assertReleased();
	});

	test("leaves every other phase exactly as it was", async () => {
		const env = new FakeBrowser();
		const media = session(env);

		// No run at all.
		expect((await media.mute()).state).toEqual({ phase: "idle", reason: "created" });
		expect((await media.unmute()).state).toEqual({ phase: "idle", reason: "created" });

		await media.start(correlation());
		// An unmute while listening, and a second mute while already muted, are
		// both transitions the state machine forbids; neither may raise.
		expect((await media.unmute()).state.phase).toBe("listening");
		await media.mute();
		expect((await media.mute()).state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(env.localTrack.enabled).toBe(false);

		await media.stop();
		expect((await media.mute()).state.phase).toBe("closed");
		expect((await media.unmute()).state.phase).toBe("closed");
		env.assertReleased();
	});

	test("re-enables the capture whenever the run leaves muted, not only on unmute", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		await media.mute();
		expect(env.localTrack.enabled).toBe(false);

		// Stopping is a route out of `muted` that is not an unmute. The transition
		// table also admits muted -> processing; the flag must follow the phase
		// either way, so `publish` owns it rather than the mute command.
		await media.stop();

		expect(media.getSnapshot().state).toEqual({ phase: "closed", reason: "stopped" });
		expect(env.localTrack.enabled).toBe(true);
		env.assertReleased();
	});

	test("refuses to mute a failed run and keeps its failure visible", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());

		env.localTrack.lose();
		await Promise.resolve();

		const state = media.getSnapshot().state;
		expect(state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect((await media.mute()).state).toEqual(state);
		expect((await media.unmute()).state).toEqual(state);
	});
});
