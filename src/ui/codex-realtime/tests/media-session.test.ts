import { describe, expect, test } from "bun:test";

import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import { createRealtimeMediaSession, REALTIME_MEDIA_FEATURE } from "@/ui/codex-realtime";
import type {
	RealtimeMediaSnapshot,
	RealtimeCorrelationId,
	RealtimeMediaSession,
	RealtimeSessionId,
} from "@/ui/codex-realtime";
import {
	AUDIBLE_SAMPLES,
	FakeBrowser,
	SILENT_SAMPLES,
	correlation,
	host,
	settle,
	type Stage,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";

const NEGOTIATION_STAGES: Stage[] = ["createOffer", "setLocal", "hostOffer", "setRemote", "resume"];
const PAUSE_STAGES: Stage[] = ["getUserMedia", ...NEGOTIATION_STAGES];
const DEVICE_LOSS_CHECKPOINTS: string[] = ["attachRemote", "play", "meter"];

/**
 * A session over a fresh fake browser.
 * @param env The fake browser.
 * @returns The session.
 */
function session(env: FakeBrowser): RealtimeMediaSession {
	return createRealtimeMediaSession(host(env), { environment: env.environment() });
}

/**
 * Loses the microphone when one step is reached.
 * @param env The fake browser.
 * @param checkpoint The step.
 */
function loseDeviceAt(env: FakeBrowser, checkpoint: string): void {
	/**
	 * Unplugs the microphone at the checkpoint.
	 * @param step The step reached.
	 */
	env.onStep = (step) => {
		if (step === checkpoint) {
			env.localTrack.lose();
		}
	};
}

describe("realtime browser media session", () => {
	test("constructs in order, meters the remote playback, freezes correlation, and releases once", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const input: { sessionId: RealtimeSessionId; correlationId: RealtimeCorrelationId } = {
			...correlation(),
		};
		expect(REALTIME_MEDIA_FEATURE).toBe("webrtc-audio");
		const starting = media.start(input);
		input.sessionId = parseRealtimeSessionId("mutated");
		const started = await starting;
		expect(env.order.join(",")).toBe(
			"getUserMedia,peer,transceiver,channel,createOffer,setLocal,hostOffer,setRemote,attachRemote,meter",
		);
		expect(started.correlation).toEqual(correlation());
		expect(Object.isFrozen(started.correlation)).toBe(true);
		input.correlationId = parseRealtimeCorrelationId("mutated");
		expect(media.getSnapshot().correlation).toEqual(correlation());
		// The meter measures the remote playback stream, never the microphone.
		expect(env.localStreams).not.toContain(env.meters[0]?.source);
		expect(env.meters[0]?.source.getAudioTracks()).toEqual([env.peers[0]!.remoteTrack]);
		const first = env.audios[0]!;
		const replacement = env.newElement();
		env.attachment?.attachTo(replacement.element);
		expect(first.srcObject).toBeNull();
		env.frame();
		expect(media.outputLevel.current()).toBe(0.3535533905932738);
		let stopping: Promise<RealtimeMediaSnapshot> | undefined;
		media.outputLevel.subscribe((level) => {
			if (level > 0 && stopping === undefined) {
				stopping = media.stop();
			}
		});
		env.samples = SILENT_SAMPLES;
		env.frame();
		env.samples = AUDIBLE_SAMPLES;
		env.frame();
		await stopping;
		expect(media.getSnapshot()).toMatchObject({ state: { phase: "closed", reason: "stopped" } });
		expect(media.outputLevel.current()).toBe(0);
		env.assertReleased();
	});

	test("overlapping starts own their snapshots and superseded resources", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const results = await Promise.all([
			media.start(correlation(1)),
			media.start(correlation(2)),
			media.start(correlation(3)),
		]);
		expect(results.map((result) => result.correlation)).toEqual([1, 2, 3].map(correlation));
		await media.stop();
		await media.start(correlation(4));
		await media.dispose();
		expect(media.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
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
			/**
			 * Refuses the microphone.
			 * @returns A NotAllowedError rejection.
			 */
			env.getUserMedia = () => {
				env.order.push(stage);
				return Promise.reject(new DOMException("denied", "NotAllowedError"));
			};
		}
		const media = session(env);
		const states: string[] = [];
		media.subscribe((next) => states.push(`${next.state.phase}:${next.state.reason}`));
		await media.start(correlation());
		expect(media.getSnapshot().state).toMatchObject({ phase: "recoverable_error", reason });
		expect(states.filter((value) => value === `recoverable_error:${reason}`)).toHaveLength(1);
		env.assertReleased();
	});

	test.each([
		["no-device", "device_unavailable"],
		["attachment", "remote_media_failed"],
		["autoplay", "autoplay_suspended"],
	] as const)("reports a %s failure as %s", async (kind, reason) => {
		const env = new FakeBrowser();
		env.noTrack = kind === "no-device";
		env.throwAttachment = kind === "attachment";
		env.autoplayDenied = kind === "autoplay";
		const media = session(env);
		await media.start(correlation());
		await settle();
		expect(media.getSnapshot().state).toMatchObject({ phase: "recoverable_error", reason });
		env.assertReleased();
	});

	test("a browser with no microphone API fails without a run", async () => {
		const env = new FakeBrowser();
		env.noMediaDevices = true;
		const media = session(env);
		expect((await media.start(correlation())).state).toMatchObject({
			phase: "recoverable_error",
			reason: "device_unavailable",
		});
		env.assertReleased();
	});

	test("a browser without realtime support fails terminally before any peer", async () => {
		const env = new FakeBrowser();
		env.unsupported = true;
		const media = session(env);
		expect((await media.start(correlation())).state).toMatchObject({
			phase: "terminal_error",
			reason: "unsupported_browser",
		});
		expect(env.order).not.toContain("peer");
		env.assertReleased();
	});

	test("a meter that stays suspended after resume is blocked autoplay", async () => {
		const env = new FakeBrowser();
		env.costs.set("resume", 0);
		env.staySuspended = true;
		const media = session(env);
		await media.start(correlation());
		expect(env.order).toContain("resume");
		expect(media.getSnapshot().state).toMatchObject({
			phase: "recoverable_error",
			reason: "autoplay_suspended",
		});
		expect(media.outputLevel.current()).toBe(0);
		env.assertReleased();
	});

	test.each(["disconnected", "failed"] as const)("cleans an ICE %s once", async (ice) => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		env.frame();
		expect(media.outputLevel.current()).toBeGreaterThan(0);
		env.peers[0]?.loseIce(ice);
		await settle();
		expect(media.getSnapshot()).toMatchObject({
			state: { phase: "recoverable_error", reason: "ice_disconnected" },
		});
		expect(media.outputLevel.current()).toBe(0);
		env.assertReleased();
	});

	test.each([
		["channel", "data_channel_closed"],
		["device", "device_lost"],
	] as const)("distinguishes a %s loss as %s", async (kind, reason) => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		if (kind === "channel") {
			env.peers[0]?.channel.remoteClose();
		} else {
			env.localTrack.lose();
		}
		await settle();
		expect(media.getSnapshot().state).toMatchObject({ phase: "recoverable_error", reason });
		env.assertReleased();
	});

	test.each(PAUSE_STAGES)("stop cancels a pending %s phase", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const media = session(env);
		const starting = media.start(correlation());
		await settle();
		expect(env.order).toContain(stage);
		const stopped = await media.stop();
		env.release();
		await starting;
		await settle();
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		env.assertReleased();
	});

	test("immediate stop prevents a queued permission request", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const media = session(env);
		const starting = media.start(correlation());
		const stopping = media.stop();
		const [started, stopped] = await Promise.all([starting, stopping]);
		expect(env.order).not.toContain("getUserMedia");
		expect(started.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(stopped).toBe(started);
		env.assertReleased();
	});

	test("A/B/stop settles while A permission never settles and B never starts", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const media = session(env);
		const first = media.start(correlation(1));
		await settle();
		const second = media.start(correlation(2));
		const stopping = media.stop();
		const [a, b, stopped] = await Promise.all([first, second, stopping]);
		expect(env.order.filter((value) => value === "getUserMedia")).toHaveLength(1);
		expect(a.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(b.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(stopped).toBe(a);
		env.release();
		await settle();
		expect(env.localTrack.stopCount).toBe(1);
		env.assertReleased();
	});

	test.each(NEGOTIATION_STAGES)("channel failure aborts pending %s negotiation", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const media = session(env);
		const starting = media.start(correlation());
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
		const media = session(env);
		const starting = media.start(correlation());
		await settle();
		env.peers[0]!.loseIce("failed");
		const failed = await starting;
		expect(failed.state).toMatchObject({
			phase: "recoverable_error",
			reason: "ice_disconnected",
		});
		env.release();
		await settle();
		expect(media.getSnapshot()).toBe(failed);
		env.assertReleased();
	});

	test.each(NEGOTIATION_STAGES)("device loss preempts a pending %s phase", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const media = session(env);
		const failures: string[] = [];
		media.subscribe((next) => {
			if (next.state.phase === "recoverable_error") {
				failures.push(next.state.reason);
			}
		});
		const starting = media.start(correlation());
		await settle();
		env.localTrack.lose();
		const failed = await starting;
		expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect(failures).toEqual(["device_lost"]);
		expect(env.now).toBe(0);
		expect(env.stopRequests).toEqual(
			stage === "createOffer" || stage === "setLocal" ? [] : [correlation()],
		);
		env.release();
		await settle();
		expect(media.getSnapshot()).toBe(failed);
		env.assertReleased();
	});

	test.each(DEVICE_LOSS_CHECKPOINTS)(
		"same-turn device loss during %s settles before listening",
		async (checkpoint) => {
			const env = new FakeBrowser();
			env.deferPlay = checkpoint === "play";
			const media = session(env);
			const failures: string[] = [];
			media.subscribe((next) => {
				if (next.state.phase === "recoverable_error") {
					failures.push(next.state.reason);
				}
			});
			loseDeviceAt(env, checkpoint);
			const failed = await media.start(correlation());
			expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
			expect(failures).toEqual(["device_lost"]);
			expect(env.stopRequests).toEqual([correlation()]);
			expect(env.order).not.toContain("resume");
			expect(env.frames.size).toBe(0);
			env.assertReleased();
		},
	);

	test("listener-triggered device loss wins on the offer-created publication", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const failures: string[] = [];
		media.subscribe((next) => {
			if (next.state.reason === "offer_created") {
				env.localTrack.lose();
			}
			if (next.state.phase === "recoverable_error") {
				failures.push(next.state.reason);
			}
		});
		const failed = await media.start(correlation());
		expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect(failures).toEqual(["device_lost"]);
		expect(env.order).not.toContain("hostOffer");
		expect(env.stopCount).toBe(0);
		env.assertReleased();
	});

	test("subscription changes take effect after the current publication cohort", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const seen: string[] = [];
		let changed = false;
		let unsubscribeSecond: (() => void) | undefined;
		media.subscribe((next) => {
			seen.push(`first:${next.state.phase}:${next.state.reason}`);
			if (changed || next.state.reason !== "start_requested") {
				return;
			}
			changed = true;
			unsubscribeSecond?.();
			media.subscribe((later) => {
				seen.push(`new:${later.state.phase}:${later.state.reason}`);
			});
		});
		unsubscribeSecond = media.subscribe((next) => {
			seen.push(`second:${next.state.phase}:${next.state.reason}`);
		});
		await media.start(correlation());
		expect(seen.slice(0, 4)).toEqual([
			"first:requesting_permission:start_requested",
			"second:requesting_permission:start_requested",
			"first:negotiating:permission_granted",
			"new:negotiating:permission_granted",
		]);
		await media.dispose();
		env.assertReleased();
	});

	test("reentrant device loss preserves publication order for every listener", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const first: string[] = [];
		const second: string[] = [];
		media.subscribe((next) => {
			first.push(`${next.state.phase}:${next.state.reason}`);
			if (next.state.reason === "offer_created") {
				env.localTrack.lose();
			}
		});
		media.subscribe((next) => second.push(`${next.state.phase}:${next.state.reason}`));
		const failed = await media.start(correlation());
		expect(first).toEqual([
			"requesting_permission:start_requested",
			"negotiating:permission_granted",
			"negotiating:offer_created",
			"recoverable_error:device_lost",
		]);
		expect(second).toEqual(first);
		expect(failed).toBe(media.getSnapshot());
		env.assertReleased();
	});

	test.each([
		["localDescription", false],
		["hostOffer", true],
	] as const)("device loss at %s records exact host offer ownership", async (checkpoint, sent) => {
		const env = new FakeBrowser();
		const media = session(env);
		loseDeviceAt(env, checkpoint);
		const failed = await media.start(correlation());
		expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect(env.stopRequests).toEqual(sent ? [correlation()] : []);
		expect(env.order.includes("hostOffer")).toBe(sent);
		env.assertReleased();
	});

	test("a stale play rejection cannot fail or detach its replacement", async () => {
		const env = new FakeBrowser();
		env.deferPlay = true;
		const media = session(env);
		await media.start(correlation());
		const first = env.audios[0]!;
		const replacement = env.newElement();
		env.attachment!.attachTo(replacement.element);
		first.reject("stale rejection");
		await settle();
		expect(media.getSnapshot().state.phase).toBe("listening");
		expect(replacement.audio.srcObject).not.toBeNull();
		replacement.audio.reject("active rejection");
		await settle();
		expect(media.getSnapshot().state).toMatchObject({
			phase: "recoverable_error",
			reason: "autoplay_suspended",
		});
		env.assertReleased();
	});

	test.each(["stop", "dispose"] as const)("%s invalidates pending play rejection", async (kind) => {
		const env = new FakeBrowser();
		env.deferPlay = true;
		const media = session(env);
		await media.start(correlation());
		const audio = env.audios[0]!;
		await (kind === "stop" ? media.stop() : media.dispose());
		audio.reject("late rejection");
		await settle();
		expect(media.getSnapshot().state).toEqual({
			phase: "closed",
			reason: kind === "stop" ? "stopped" : "disposed",
		});
		env.assertReleased();
	});

	test("dispose dominates A/B/stop and callers share one completion", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const media = session(env);
		const closed: string[] = [];
		media.subscribe((next) => {
			if (next.state.phase === "closed") {
				closed.push(next.state.reason);
			}
		});
		const first = media.start(correlation(1));
		await settle();
		const second = media.start(correlation(2));
		const stopping = media.stop();
		const disposing = media.dispose();
		expect(media.dispose()).toBe(disposing);
		const [a, b, stopped] = await Promise.all([first, second, stopping, disposing]);
		for (const result of [a, b, stopped]) {
			expect(result.state).toEqual({ phase: "closed", reason: "disposed" });
		}
		expect(closed).toEqual(["disposed"]);
		env.release();
		await settle();
		env.assertReleased();
	});

	test("reentrant and concurrent dispose calls share completion", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		let reentrant: Promise<void> | undefined;
		media.subscribe((next) => {
			if (next.state.phase === "stopping") {
				reentrant = media.dispose();
			}
		});
		const first = media.dispose();
		expect(media.dispose()).toBe(first);
		await settle();
		expect(reentrant).toBe(first);
		await Promise.all([first, reentrant]);
		expect(media.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		env.assertReleased();
	});

	test.each([
		["stop", "first"],
		["stop", "middle"],
		["stop", "last"],
		["dispose", "first"],
		["dispose", "middle"],
		["dispose", "last"],
	] as const)("a later reentrant %s survives a throwing %s listener", async (action, throwing) => {
		const env = new FakeBrowser();
		const media = session(env);
		const order: string[] = [];
		let ending: Promise<unknown> | undefined;
		for (const label of ["first", "middle", "last"]) {
			media.subscribe((next) => {
				if (next.state.phase !== "listening") {
					return;
				}
				order.push(label);
				if (label === throwing) {
					throw new Error("consumer");
				}
			});
		}
		media.subscribe((next) => {
			if (next.state.phase !== "listening" || ending !== undefined) {
				return;
			}
			order.push(action);
			ending = action === "stop" ? media.stop() : media.dispose();
		});
		media.subscribe((next) => {
			if (next.state.phase === "listening") {
				order.push("later");
			}
		});
		const started = await media.start(correlation());
		await ending;
		expect(order).toEqual(["first", "middle", "last", action, "later"]);
		expect(started.state).toEqual({
			phase: "closed",
			reason: action === "stop" ? "stopped" : "disposed",
		});
		expect(media.getSnapshot()).toBe(started);
		expect(env.stopRequests).toEqual([correlation()]);
		env.assertReleased();
	});
});
