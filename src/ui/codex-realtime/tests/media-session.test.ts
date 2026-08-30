import { afterEach, describe, expect, test } from "bun:test";
import { CODEX_REALTIME_START_MS, CODEX_REALTIME_STOP_MS } from "../../../shared/timing/timing.js";
import {
	createRealtimeMediaSession,
	REALTIME_MEDIA_FEATURE,
	type RealtimeCorrelationId,
	type RealtimeSessionId,
} from "../index.js";
import {
	correlation,
	FakeAudio,
	FakeBrowser,
	host,
	restoreFakeBrowsers,
	settle,
	type Stage,
	type StopMode,
} from "./support/media-session-fakes.js";

const NEGOTIATION_STAGES: Stage[] = ["createOffer", "setLocal", "hostOffer", "setRemote", "resume"];
const PAUSE_STAGES: Stage[] = ["getUserMedia", ...NEGOTIATION_STAGES];

afterEach(restoreFakeBrowsers);

describe("realtime browser media session", () => {
	test("constructs in order, meters, freezes correlation, and releases once", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		const input = { ...correlation() };
		expect(REALTIME_MEDIA_FEATURE).toBe("webrtc-audio");
		const starting = session.start(input);
		input.sessionId = "mutated" as RealtimeSessionId;
		const started = await starting;
		expect(env.order.join(",")).toBe(
			"getUserMedia,peer,transceiver,channel,createOffer,setLocal,hostOffer,setRemote,attachRemote,audioContext,source,analyser",
		);
		expect(started.correlation).toEqual(correlation());
		expect(Object.isFrozen(started.correlation)).toBe(true);
		input.correlationId = "mutated" as RealtimeCorrelationId;
		expect(session.getSnapshot().correlation).toEqual(correlation());
		const first = env.audios[0]!;
		const replacement = new FakeAudio(env);
		env.audios.push(replacement);
		env.attachment?.attachTo(replacement as unknown as HTMLMediaElement);
		expect(first.srcObject).toBeNull();
		env.frame();
		expect(session.getSnapshot().inputLevel).toBe(0.3535533905932738);
		let stopping: ReturnType<typeof session.stop> | undefined;
		session.subscribe((next) => {
			if (next.inputLevel > 0) stopping = session.stop();
		});
		env.frame();
		await stopping;
		expect(session.getSnapshot()).toMatchObject({
			state: { phase: "closed", reason: "stopped" },
			inputLevel: 0,
		});
		expect(env.stopRequests[0]).toEqual(correlation());
		env.assertReleased();
	});

	test("overlapping starts own their snapshots and superseded resources", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		const results = await Promise.all([
			session.start(correlation(1)),
			session.start(correlation(2)),
			session.start(correlation(3)),
		]);
		expect(results.map((result) => result.correlation)).toEqual([1, 2, 3].map(correlation));
		await session.stop();
		await session.start(correlation(4));
		await session.dispose();
		expect(session.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		env.assertReleased();
	});

	test.each([
		["getUserMedia", "permission_denied"],
		["createOffer", "sdp_failed"],
		["setLocal", "sdp_failed"],
		["hostOffer", "sdp_failed"],
		["setRemote", "sdp_failed"],
		["resume", "sdp_failed"],
	] as const)("maps %s failure to one recoverable state", async (stage, reason) => {
		const env = new FakeBrowser();
		env.fail = stage;
		if (stage === "getUserMedia") {
			env.getUserMedia = async () => {
				env.order.push(stage);
				throw new DOMException("denied", "NotAllowedError");
			};
		}
		const session = createRealtimeMediaSession(host(env));
		const states: string[] = [];
		session.subscribe((next) => states.push(`${next.state.phase}:${next.state.reason}`));
		await session.start(correlation());
		expect(session.getSnapshot().state).toMatchObject({ phase: "recoverable_error", reason });
		expect(states.filter((value) => value === `recoverable_error:${reason}`)).toHaveLength(1);
		env.assertReleased();
	});

	test("reports missing devices, attachment failure, and autoplay rejection", async () => {
		for (const kind of ["no-device", "attachment", "autoplay"] as const) {
			const env = new FakeBrowser();
			env.noTrack = kind === "no-device";
			env.throwAttachment = kind === "attachment";
			env.autoplayDenied = kind === "autoplay";
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation());
			await settle();
			expect(session.getSnapshot().state).toMatchObject({
				phase: "recoverable_error",
				reason: {
					"no-device": "device_unavailable",
					attachment: "remote_media_failed",
					autoplay: "autoplay_suspended",
				}[kind],
			});
			env.assertReleased();
			env.restore();
		}
	});

	test.each(["disconnected", "failed"] as const)("cleans an ICE %s once", async (ice) => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		env.frame();
		env.peers[0]?.loseIce(ice);
		await settle();
		expect(session.getSnapshot()).toMatchObject({
			state: { phase: "recoverable_error", reason: "ice_disconnected" },
			inputLevel: 0,
		});
		env.assertReleased();
	});

	test("distinguishes channel close from device loss", async () => {
		for (const kind of ["channel", "device"] as const) {
			const env = new FakeBrowser();
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation());
			if (kind === "channel") env.peers[0]?.channel.remoteClose();
			else env.localTrack.lose();
			await settle();
			expect(session.getSnapshot().state).toMatchObject({
				phase: "recoverable_error",
				reason: kind === "channel" ? "data_channel_closed" : "device_lost",
			});
			env.assertReleased();
			env.restore();
		}
	});

	test.each(PAUSE_STAGES)("stop cancels a pending %s phase", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		expect(env.order).toContain(stage);
		const stopped = await session.stop();
		env.release();
		await starting;
		await settle();
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		env.assertReleased();
	});

	test("immediate stop prevents a queued permission request", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		const stopping = session.stop();
		const [started, stopped] = await Promise.all([starting, stopping]);
		expect(env.order).not.toContain("getUserMedia");
		expect(started.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(stopped).toBe(started);
		env.assertReleased();
	});

	test("A/B/stop settles while A permission never settles and B never starts", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const session = createRealtimeMediaSession(host(env));
		const first = session.start(correlation(1));
		await settle();
		const second = session.start(correlation(2));
		const stopping = session.stop();
		const [a, b, stopped] = await Promise.all([first, second, stopping]);
		expect(env.order.filter((value) => value === "getUserMedia")).toHaveLength(1);
		expect(a.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(b.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(stopped).toBe(b);
		env.release();
		await settle();
		expect(env.localTrack.stopCount).toBe(1);
		env.assertReleased();
	});

	test.each(NEGOTIATION_STAGES)("channel failure aborts pending %s negotiation", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.peers[0]!.channel.remoteClose();
		const failed = await starting;
		expect(failed.state).toMatchObject({
			phase: "recoverable_error",
			reason: "data_channel_closed",
		});
		env.release();
		await settle();
		env.assertReleased();
	});

	test("ICE failure aborts a pending host answer", async () => {
		const env = new FakeBrowser();
		env.pause = "hostOffer";
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.peers[0]!.loseIce("failed");
		expect((await starting).state).toMatchObject({
			phase: "recoverable_error",
			reason: "ice_disconnected",
		});
		env.release();
		await settle();
		env.assertReleased();
	});

	test("a stale play rejection cannot fail or detach its replacement", async () => {
		const env = new FakeBrowser();
		env.deferPlay = true;
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		const first = env.audios[0]!;
		const replacement = new FakeAudio(env);
		env.audios.push(replacement);
		env.attachment!.attachTo(replacement as unknown as HTMLMediaElement);
		first.reject("stale rejection");
		await settle();
		expect(session.getSnapshot().state.phase).toBe("listening");
		expect(replacement.srcObject).not.toBeNull();
		replacement.reject("active rejection");
		await settle();
		expect(session.getSnapshot().state).toMatchObject({
			phase: "recoverable_error",
			reason: "autoplay_suspended",
		});
		env.assertReleased();
	});

	test.each(["stop", "dispose"] as const)("%s invalidates pending play rejection", async (kind) => {
		const env = new FakeBrowser();
		env.deferPlay = true;
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		const audio = env.audios[0]!;
		if (kind === "stop") await session.stop();
		else await session.dispose();
		audio.reject("late rejection");
		await settle();
		expect(session.getSnapshot().state).toEqual({
			phase: "closed",
			reason: kind === "stop" ? "stopped" : "disposed",
		});
		env.assertReleased();
	});

	test("dispose dominates A/B/stop and callers share one completion", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const session = createRealtimeMediaSession(host(env));
		const closed: string[] = [];
		session.subscribe((next) => {
			if (next.state.phase === "closed") closed.push(next.state.reason);
		});
		const first = session.start(correlation(1));
		await settle();
		const second = session.start(correlation(2));
		const stopping = session.stop();
		const disposing = session.dispose();
		expect(session.dispose()).toBe(disposing);
		const [a, b, stopped] = await Promise.all([first, second, stopping, disposing]);
		for (const result of [a, b, stopped])
			expect(result.state).toEqual({ phase: "closed", reason: "disposed" });
		expect(closed).toEqual(["disposed"]);
		env.release();
		await settle();
		env.assertReleased();
	});

	test("reentrant and concurrent dispose calls share completion", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		let reentrant: Promise<void> | undefined;
		session.subscribe((next) => {
			if (next.state.phase === "stopping") reentrant = session.dispose();
		});
		const first = session.dispose();
		expect(session.dispose()).toBe(first);
		await settle();
		expect(reentrant).toBe(first);
		await Promise.all([first, reentrant]);
		expect(session.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		env.assertReleased();
	});

	test.each(NEGOTIATION_STAGES)("one start deadline expires during %s", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.advance(CODEX_REALTIME_START_MS);
		const timedOut = await starting;
		expect(timedOut.state).toMatchObject({ phase: "recoverable_error", reason: "sdp_failed" });
		env.release();
		await settle();
		expect(session.getSnapshot()).toBe(timedOut);
		env.assertReleased();
	});

	test("successive phases share one absolute post-permission deadline", async () => {
		const env = new FakeBrowser();
		env.costs.set("createOffer", 4_000);
		env.costs.set("setLocal", 4_000);
		env.costs.set("hostOffer", 4_000);
		env.pause = "setRemote";
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		expect(env.now).toBe(12_000);
		env.advance(2_999);
		await settle();
		expect(session.getSnapshot().state.phase).toBe("negotiating");
		env.advance(1);
		expect((await starting).state).toMatchObject({
			phase: "recoverable_error",
			reason: "sdp_failed",
		});
		expect(env.now).toBe(CODEX_REALTIME_START_MS);
		env.release();
		await settle();
		env.assertReleased();
	});

	test("negotiation completing before the shared deadline succeeds", async () => {
		const env = new FakeBrowser();
		env.costs.set("createOffer", 4_000);
		env.costs.set("setLocal", 4_000);
		env.costs.set("hostOffer", 4_000);
		env.costs.set("setRemote", 2_999);
		const session = createRealtimeMediaSession(host(env));
		expect((await session.start(correlation())).state.phase).toBe("listening");
		expect(env.now).toBe(CODEX_REALTIME_START_MS - 1);
		await session.stop();
		env.assertReleased();
	});

	test.each(["rejected", "not_delivered", "outcome_unknown"] as StopMode[])(
		"host stop %s settles as one public failure",
		async (mode) => {
			const env = new FakeBrowser();
			env.stopMode = mode;
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation());
			const stopped = await session.stop();
			expect(stopped).toBe(session.getSnapshot());
			expect(stopped).toMatchObject({
				state: { phase: "recoverable_error", reason: "stop_failed" },
				inputLevel: 0,
			});
			expect(env.stopCount).toBe(1);
			env.assertReleased();
		},
	);

	test("an expired host stop settles once with stop_failed", async () => {
		const env = new FakeBrowser();
		env.stopMode = "paused";
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		const stopping = session.stop();
		await settle();
		env.advance(CODEX_REALTIME_STOP_MS);
		const stopped = await stopping;
		expect(stopped.state).toMatchObject({ phase: "recoverable_error", reason: "stop_failed" });
		env.releaseStop();
		await settle();
		expect(session.getSnapshot()).toBe(stopped);
		env.assertReleased();
	});
});
