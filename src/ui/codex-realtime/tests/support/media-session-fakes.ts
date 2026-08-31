import { expect } from "bun:test";
import type {
	AnswerSdp,
	CommandOutcome,
	RealtimeCorrelation,
	RealtimeCorrelationId,
	RealtimeHost,
	RealtimeSessionId,
	RemoteMediaAttachment,
} from "../../index.js";

export type Stage =
	| "getUserMedia"
	| "createOffer"
	| "setLocal"
	| "hostOffer"
	| "setRemote"
	| "resume";
export type StopMode = "delivered" | "rejected" | "not_delivered" | "outcome_unknown" | "paused";
export type BrowserPromiseMode = "resolved" | "rejected" | "pending";

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

export class FakeTrack extends TrackedTarget {
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

export class FakeChannel extends TrackedTarget {
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
	constructor(
		readonly track: FakeTrack,
		readonly env: FakeBrowser,
	) {}
	replaceTrack(): Promise<void> {
		this.replaceCount += 1;
		if (this.env.replaceTrackMode === "rejected")
			return Promise.reject(new Error("replace failed"));
		if (this.env.replaceTrackMode === "pending") return new Promise(() => undefined);
		return Promise.resolve();
	}
}

export class FakePeer extends TrackedTarget {
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
		this.env.record("transceiver");
		for (let index = 0; index < this.env.senderCount; index += 1)
			this.senders.push(new FakeSender(track as unknown as FakeTrack, this.env));
		return {} as RTCRtpTransceiver;
	}
	createDataChannel(): RTCDataChannel {
		this.env.record("channel");
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
		this.state =
			env.pause === "resume" || env.fail === "resume" || env.costs.has("resume") || env.suspended
				? "suspended"
				: "running";
	}
	async resume(): Promise<void> {
		await this.env.stage("resume", undefined);
		if (!this.env.suspended) this.state = "running";
	}
	createMediaStreamSource(): MediaStreamAudioSourceNode {
		this.env.record("source");
		return this.source as unknown as MediaStreamAudioSourceNode;
	}
	createAnalyser(): AnalyserNode {
		this.env.record("analyser");
		return this.analyser as unknown as AnalyserNode;
	}
	close(): Promise<void> {
		this.closeCount += 1;
		this.state = "closed";
		if (this.env.closeContextMode === "rejected") return Promise.reject(new Error("close failed"));
		if (this.env.closeContextMode === "pending") return new Promise(() => undefined);
		return Promise.resolve();
	}
}

export class FakeAudio {
	pauseCount = 0;
	loadCount = 0;
	removeCount = 0;
	src = "";
	srcObject?: MediaProvider | null;
	private resolvePlay?: () => void;
	private rejectPlay?: (error: unknown) => void;
	constructor(readonly env: FakeBrowser) {}
	play(): Promise<void> {
		if (this.env.autoplayDenied)
			return Promise.reject(new DOMException("Playback requires activation.", "NotAllowedError"));
		if (!this.env.deferPlay) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			this.resolvePlay = resolve;
			this.rejectPlay = reject;
		});
	}
	resolve(): void {
		this.resolvePlay?.();
	}
	reject(message = "Playback requires activation."): void {
		this.rejectPlay?.(new DOMException(message, "NotAllowedError"));
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

interface ScheduledTimer {
	readonly due: number;
	readonly callback: () => void;
}

export class FakeBrowser extends TrackedTarget {
	readonly order: string[] = [];
	readonly localTracks: FakeTrack[] = [];
	readonly peers: FakePeer[] = [];
	readonly contexts: FakeContext[] = [];
	readonly audios: FakeAudio[] = [];
	readonly frames = new Map<number, FrameRequestCallback>();
	readonly timers = new Map<number, ScheduledTimer>();
	readonly restores: Array<() => void> = [];
	readonly stopRequests: RealtimeCorrelation[] = [];
	readonly costs = new Map<Stage, number>();
	attachment?: RemoteMediaAttachment;
	pause?: Stage;
	fail?: Stage;
	stopMode: StopMode = "delivered";
	replaceTrackMode: BrowserPromiseMode = "resolved";
	closeContextMode: BrowserPromiseMode = "resolved";
	senderCount = 1;
	noTrack = false;
	autoplayDenied = false;
	deferPlay = false;
	suspended = false;
	throwAttachment = false;
	stopCount = 0;
	now = 0;
	onStep?: (step: string) => void;
	private releaseGate?: () => void;
	private releaseStopGate?: (outcome: CommandOutcome) => void;
	get localTrack(): FakeTrack {
		return this.localTracks.at(-1)!;
	}
	constructor() {
		super();
		this.install("navigator", { mediaDevices: this });
		this.install("performance", { now: () => this.now });
		this.install("MediaStream", FakeStream);
		this.install("RTCPeerConnection", function (this: unknown) {
			const peer = new FakePeer(activeBrowser());
			peer.env.record("peer");
			peer.env.peers.push(peer);
			return peer;
		});
		this.install("AudioContext", function (this: unknown) {
			const env = activeBrowser();
			env.record("audioContext");
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
		this.install("setTimeout", (callback: () => void, delay = 0) => {
			const id = ++timer;
			this.timers.set(id, { due: this.now + delay, callback });
			return id;
		});
		this.install("clearTimeout", (id: number) => this.timers.delete(id));
		active.push(this);
	}
	record(step: string): void {
		this.order.push(step);
		this.onStep?.(step);
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
		this.record(stage);
		const cost = this.costs.get(stage);
		if (cost) this.advance(cost);
		if (this.fail === stage) throw new Error(`${stage} failed`);
		if (this.pause === stage) await new Promise<void>((resolve) => (this.releaseGate = resolve));
		return value;
	}
	async getUserMedia(): Promise<MediaStream> {
		const tracks = this.noTrack ? [] : [new FakeTrack()];
		this.localTracks.push(...tracks);
		return this.stage("getUserMedia", new FakeStream(tracks) as unknown as MediaStream);
	}
	async stop(request: RealtimeCorrelation): Promise<CommandOutcome> {
		this.stopCount += 1;
		this.stopRequests.push(request);
		if (this.stopMode === "rejected") throw new Error("stop rejected");
		if (this.stopMode === "paused")
			return new Promise<CommandOutcome>((resolve) => (this.releaseStopGate = resolve));
		return stopOutcome(this.stopMode, request);
	}
	release(): void {
		this.releaseGate?.();
	}
	releaseStop(mode: Exclude<StopMode, "paused" | "rejected"> = "delivered"): void {
		this.releaseStopGate?.(stopOutcome(mode, this.stopRequests.at(-1)!));
	}
	advance(durationMs: number): void {
		this.now += durationMs;
		for (;;) {
			const due = [...this.timers.entries()]
				.filter(([, timer]) => timer.due <= this.now)
				.toSorted((left, right) => left[1].due - right[1].due)[0];
			if (!due) return;
			this.timers.delete(due[0]);
			due[1].callback();
		}
	}
	frame(): void {
		const entry = this.frames.entries().next().value as [number, FrameRequestCallback] | undefined;
		if (!entry) return;
		this.frames.delete(entry[0]);
		entry[1](this.now);
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
			const detachCount = audio.srcObject === undefined ? 0 : 1;
			expect(audio.pauseCount).toBe(detachCount);
			expect(audio.removeCount).toBe(detachCount);
			expect(audio.loadCount).toBe(detachCount);
		}
	}
}

const active: FakeBrowser[] = [];
function activeBrowser(): FakeBrowser {
	const env = active.at(-1);
	if (!env) throw new Error("No fake browser is installed.");
	return env;
}

function stopOutcome(
	mode: Exclude<StopMode, "paused" | "rejected">,
	request: RealtimeCorrelation,
): CommandOutcome {
	if (mode === "not_delivered") return { outcome: mode, reason: "rejected", ...request };
	if (mode === "outcome_unknown") return { outcome: mode, reason: "response_lost", ...request };
	return { outcome: "delivered", ...request };
}

export function correlation(index = 1): RealtimeCorrelation {
	return {
		sessionId: `session-${index}` as RealtimeSessionId,
		correlationId: `correlation-${index}` as RealtimeCorrelationId,
	};
}

export function host(env: FakeBrowser): RealtimeHost {
	return {
		createOffer: async (offer) =>
			env.stage<AnswerSdp>("hostOffer", { ...offer, sdp: "remote-answer" }),
		attachRemoteMedia: (attachment) => {
			env.record("attachRemote");
			if (env.throwAttachment) throw new Error("attachment failed");
			env.attachment = attachment;
			const audio = new FakeAudio(env);
			env.audios.push(audio);
			attachment.attachTo(audio as unknown as HTMLMediaElement);
		},
		onSemanticEvent: () => () => undefined,
		appendText: async (request) => ({ outcome: "delivered", ...request }),
		appendSpeech: async (request) => ({ outcome: "delivered", ...request }),
		stop: (request) => env.stop(request),
		recover: async (request) => ({ outcome: "delivered", ...request }),
	};
}

export async function settle(turns = 24): Promise<void> {
	for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

export function restoreFakeBrowsers(): void {
	while (active.length) active.pop()?.restore();
}
