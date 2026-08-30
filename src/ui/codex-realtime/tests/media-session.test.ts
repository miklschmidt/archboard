import { afterEach, describe, expect, test } from "bun:test";
import {
	createRealtimeMediaSession,
	REALTIME_MEDIA_FEATURE,
	type AnswerSdp,
	type RealtimeCorrelation,
	type RealtimeCorrelationId,
	type RealtimeHost,
	type RealtimeSessionId,
	type RemoteMediaAttachment,
} from "../index.js";

type Stage = "getUserMedia" | "createOffer" | "setLocal" | "hostOffer" | "setRemote" | "resume";

class TrackedTarget extends EventTarget {
	listenerCount = 0;
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void {
		super.addEventListener(type, listener, options);
		if (listener) this.listenerCount += 1;
	}
	override removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	): void {
		super.removeEventListener(type, listener, options);
		if (listener) this.listenerCount -= 1;
	}
}
class FakeTrack extends TrackedTarget {
	readonly kind = "audio";
	readyState: MediaStreamTrackState = "live";
	stopCount = 0;
	stop(): void {
		this.stopCount += 1;
		this.readyState = "ended";
	}
	lose(): void {
		this.readyState = "ended";
		this.dispatchEvent(new Event("ended"));
	}
}
class FakeStream {
	constructor(readonly tracks: FakeTrack[] = []) {}
	getTracks(): FakeTrack[] {
		return this.tracks;
	}
	getAudioTracks(): FakeTrack[] {
		return this.tracks;
	}
}
class FakeChannel extends TrackedTarget {
	readyState: RTCDataChannelState = "open";
	closeCount = 0;
	close(): void {
		this.closeCount += 1;
		this.readyState = "closed";
	}
	remoteClose(): void {
		this.readyState = "closed";
		this.dispatchEvent(new Event("close"));
	}
}
class FakeSender {
	replaceCount = 0;
	constructor(readonly track: FakeTrack) {}
	async replaceTrack(): Promise<void> {
		this.replaceCount += 1;
	}
}
class FakePeer extends TrackedTarget {
	readonly channel = new FakeChannel();
	readonly remoteTrack = new FakeTrack();
	readonly senders: FakeSender[] = [];
	localDescription: RTCSessionDescription | null = null;
	connectionState: RTCPeerConnectionState = "new";
	iceConnectionState: RTCIceConnectionState = "new";
	closeCount = 0;
	removeCount = 0;
	constructor(readonly env: FakeBrowser) {
		super();
	}
	addTransceiver(track: MediaStreamTrack): RTCRtpTransceiver {
		this.env.order.push("transceiver");
		this.senders.push(new FakeSender(track as unknown as FakeTrack));
		return {} as RTCRtpTransceiver;
	}
	createDataChannel(): RTCDataChannel {
		this.env.order.push("channel");
		return this.channel as unknown as RTCDataChannel;
	}
	async createOffer(): Promise<RTCSessionDescriptionInit> {
		return this.env.stage("createOffer", { type: "offer", sdp: "local-offer" });
	}
	async setLocalDescription(description: RTCLocalSessionDescriptionInit): Promise<void> {
		await this.env.stage("setLocal", undefined);
		this.localDescription = {
			type: description.type ?? "offer",
			sdp: description.sdp ?? "",
		} as RTCSessionDescription;
	}
	async setRemoteDescription(): Promise<void> {
		await this.env.stage("setRemote", undefined);
	}
	getSenders(): RTCRtpSender[] {
		return this.senders as unknown as RTCRtpSender[];
	}
	getReceivers(): RTCRtpReceiver[] {
		return [{ track: this.remoteTrack } as unknown as RTCRtpReceiver];
	}
	removeTrack(): void {
		this.removeCount += 1;
	}
	close(): void {
		this.closeCount += 1;
		this.connectionState = "closed";
	}
	loseIce(state: "disconnected" | "failed"): void {
		this.iceConnectionState = state;
		this.dispatchEvent(new Event("iceconnectionstatechange"));
	}
}
class FakeNode {
	disconnectCount = 0;
	connect(): void {}
	disconnect(): void {
		this.disconnectCount += 1;
	}
}
class FakeAnalyser extends FakeNode {
	readonly fftSize = 4;
	getByteTimeDomainData(samples: Uint8Array): void {
		samples.set([128, 192, 128, 64]);
	}
}
class FakeContext {
	state: AudioContextState;
	closeCount = 0;
	readonly source = new FakeNode();
	readonly analyser = new FakeAnalyser();
	constructor(readonly env: FakeBrowser) {
		this.state = env.pause === "resume" || env.suspended ? "suspended" : "running";
	}
	async resume(): Promise<void> {
		await this.env.stage("resume", undefined);
		if (!this.env.suspended) this.state = "running";
	}
	createMediaStreamSource(): MediaStreamAudioSourceNode {
		this.env.order.push("source");
		return this.source as unknown as MediaStreamAudioSourceNode;
	}
	createAnalyser(): AnalyserNode {
		this.env.order.push("analyser");
		return this.analyser as unknown as AnalyserNode;
	}
	async close(): Promise<void> {
		this.closeCount += 1;
		this.state = "closed";
	}
}
class FakeAudio {
	pauseCount = 0;
	loadCount = 0;
	removeCount = 0;
	src = "";
	srcObject?: MediaProvider | null;
	constructor(readonly env: FakeBrowser) {
		if (env.objectUrl) delete this.srcObject;
	}
	async play(): Promise<void> {
		if (this.env.autoplayDenied)
			throw new DOMException("Playback requires activation.", "NotAllowedError");
	}
	pause(): void {
		this.pauseCount += 1;
	}
	removeAttribute(): void {
		this.removeCount += 1;
		this.src = "";
	}
	load(): void {
		this.loadCount += 1;
	}
}
class FakeBrowser extends TrackedTarget {
	readonly order: string[] = [];
	readonly localTracks: FakeTrack[] = [];
	get localTrack(): FakeTrack {
		return this.localTracks.at(-1)!;
	}
	readonly peers: FakePeer[] = [];
	readonly contexts: FakeContext[] = [];
	readonly audios: FakeAudio[] = [];
	readonly frames = new Map<number, FrameRequestCallback>();
	readonly timers = new Set<number>();
	readonly createdUrls: string[] = [];
	readonly revokedUrls: string[] = [];
	readonly restores: Array<() => void> = [];
	pause?: Stage;
	fail?: Stage;
	noTrack = false;
	autoplayDenied = false;
	suspended = false;
	objectUrl = false;
	throwAttachment = false;
	stopCount = 0;
	private releaseGate?: () => void;
	constructor() {
		super();
		this.install("navigator", { mediaDevices: this });
		this.install("MediaStream", FakeStream);
		this.install("RTCPeerConnection", function (this: unknown) {
			const peer = new FakePeer(activeBrowser());
			peer.env.order.push("peer");
			peer.env.peers.push(peer);
			return peer;
		});
		this.install("AudioContext", function (this: unknown) {
			const env = activeBrowser();
			env.order.push("audioContext");
			const context = new FakeContext(env);
			env.contexts.push(context);
			return context;
		});
		let frame = 0;
		this.install("requestAnimationFrame", (callback: FrameRequestCallback) => {
			this.frames.set(++frame, callback);
			return frame;
		});
		this.install("cancelAnimationFrame", (id: number) => this.frames.delete(id));
		let timer = 0;
		this.install("setTimeout", () => {
			this.timers.add(++timer);
			return timer;
		});
		this.install("clearTimeout", (id: number) => this.timers.delete(id));
		const create = URL.createObjectURL.bind(URL);
		const revoke = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = () => {
			const url = `blob:remote-${this.createdUrls.length + 1}`;
			this.createdUrls.push(url);
			return url;
		};
		URL.revokeObjectURL = (url) => this.revokedUrls.push(url);
		this.restores.push(() => {
			URL.createObjectURL = create;
			URL.revokeObjectURL = revoke;
		});
		active.push(this);
	}
	private install(name: string, value: unknown): void {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
		this.restores.push(() => {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		});
	}
	async stage<T>(stage: Stage, value: T): Promise<T> {
		this.order.push(stage);
		if (this.fail === stage) throw new Error(`${stage} failed`);
		if (this.pause === stage) await new Promise<void>((resolve) => (this.releaseGate = resolve));
		return value;
	}
	async getUserMedia(): Promise<MediaStream> {
		const tracks = this.noTrack ? [] : [new FakeTrack()];
		this.localTracks.push(...tracks);
		const stream = new FakeStream(tracks);
		return this.stage("getUserMedia", stream as unknown as MediaStream);
	}
	release(): void {
		this.releaseGate?.();
	}
	frame(): void {
		const entry = this.frames.entries().next().value as [number, FrameRequestCallback] | undefined;
		if (!entry) return;
		this.frames.delete(entry[0]);
		entry[1](0);
	}
	restore(): void {
		while (this.restores.length) this.restores.pop()?.();
	}
	assertReleased(): void {
		for (const peer of this.peers) {
			expect(peer.listenerCount).toBe(0);
			expect(peer.channel.listenerCount).toBe(0);
			expect(peer.connectionState).toBe("closed");
			expect(peer.closeCount).toBe(1);
			expect(peer.removeCount).toBe(peer.senders.length);
			for (const sender of peer.senders) expect(sender.replaceCount).toBe(1);
		}
		for (const context of this.contexts) {
			expect(context.closeCount).toBe(1);
			expect(context.source.disconnectCount).toBe(this.order.includes("source") ? 1 : 0);
			expect(context.analyser.disconnectCount).toBe(this.order.includes("analyser") ? 1 : 0);
		}
		expect(this.listenerCount).toBe(0);
		expect(this.frames.size).toBe(0);
		expect(this.timers.size).toBe(0);
		for (const peer of this.peers) expect(peer.remoteTrack.stopCount).toBe(1);
		for (const track of this.localTracks) expect(track.stopCount).toBe(1);
		for (const audio of this.audios) {
			expect(audio.pauseCount).toBe(1);
			expect(audio.removeCount).toBe(1);
			expect(audio.loadCount).toBe(1);
		}
		expect(this.revokedUrls).toEqual(this.createdUrls);
	}
}
const active: FakeBrowser[] = [];
function activeBrowser(): FakeBrowser {
	const env = active.at(-1);
	if (!env) throw new Error("No fake browser is installed.");
	return env;
}
function correlation(index = 1): RealtimeCorrelation {
	return {
		sessionId: `session-${index}` as RealtimeSessionId,
		correlationId: `correlation-${index}` as RealtimeCorrelationId,
	};
}
function host(env: FakeBrowser): RealtimeHost {
	return {
		createOffer: async (offer) =>
			env.stage<AnswerSdp>("hostOffer", { ...offer, sdp: "remote-answer" }),
		attachRemoteMedia: (attachment: RemoteMediaAttachment) => {
			env.order.push("attachRemote");
			if (env.throwAttachment) throw new Error("attachment failed");
			const audio = new FakeAudio(env);
			env.audios.push(audio);
			attachment.attachTo(audio as unknown as HTMLMediaElement);
		},
		onSemanticEvent: () => () => undefined,
		appendText: async (request) => ({ outcome: "delivered", ...request }),
		appendSpeech: async (request) => ({ outcome: "delivered", ...request }),
		stop: async (request) => {
			env.stopCount += 1;
			return { outcome: "delivered", ...request };
		},
		recover: async (request) => ({ outcome: "delivered", ...request }),
	};
}
async function settle(): Promise<void> {
	for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

afterEach(() => {
	while (active.length) active.pop()?.restore();
});

describe("realtime browser media session", () => {
	test("constructs in the fixed order, meters, and releases every resource once", async () => {
		const env = new FakeBrowser();
		env.objectUrl = true;
		const session = createRealtimeMediaSession(host(env));
		expect(REALTIME_MEDIA_FEATURE).toBe("webrtc-audio");
		await session.start(correlation());
		expect(env.order).toEqual([
			"getUserMedia",
			"peer",
			"transceiver",
			"channel",
			"createOffer",
			"setLocal",
			"hostOffer",
			"setRemote",
			"attachRemote",
			"audioContext",
			"source",
			"analyser",
		]);
		env.frame();
		expect(session.getSnapshot()).toMatchObject({
			state: { phase: "listening", reason: "negotiation_succeeded" },
			inputLevel: 0.3535533905932738,
		});
		expect(Object.isFrozen(session.getSnapshot())).toBe(true);
		await session.stop();
		expect(session.getSnapshot().state).toEqual({ phase: "closed", reason: "stopped" });
		expect(env.stopCount).toBe(1);
		env.assertReleased();
	});
	test.each([
		["getUserMedia", "permission_denied"],
		["createOffer", "sdp_failed"],
		["setLocal", "sdp_failed"],
		["hostOffer", "sdp_failed"],
		["setRemote", "sdp_failed"],
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
	test("reports no device, attachment failure, and suspended playback without leaks", async () => {
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
				reason:
					kind === "no-device"
						? "device_unavailable"
						: kind === "attachment"
							? "remote_media_failed"
							: "autoplay_suspended",
			});
			env.assertReleased();
			env.restore();
		}
	});
	test.each(["disconnected", "failed"] as const)("cleans an ICE %s exactly once", async (ice) => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation());
		env.peers[0]?.loseIce(ice);
		await settle();
		expect(session.getSnapshot().state).toMatchObject({
			phase: "recoverable_error",
			reason: "ice_disconnected",
		});
		env.assertReleased();
	});
	test("handles channel close and device loss as distinct contract states", async () => {
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

	test.each([
		"getUserMedia",
		"createOffer",
		"setLocal",
		"hostOffer",
		"setRemote",
		"resume",
	] as const)("stop is race-safe while %s is pending", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		expect(env.order).toContain(stage);
		await session.stop();
		env.release();
		await starting;
		await settle();
		expect(session.getSnapshot().state).toEqual({ phase: "closed", reason: "stopped" });
		env.assertReleased();
	});

	test("restarts repeatedly and dispose is an idempotent unmount", async () => {
		const env = new FakeBrowser();
		const session = createRealtimeMediaSession(host(env));
		for (let index = 1; index <= 3; index += 1) {
			await session.start(correlation(index));
			expect(session.getSnapshot().correlation).toEqual(correlation(index));
			await session.stop();
		}
		await session.start(correlation(4));
		await session.dispose();
		await session.dispose();
		expect(session.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		expect(env.stopCount).toBe(4);
		env.assertReleased();
		for (const peer of env.peers) expect(peer.closeCount).toBe(1);
	});
});
