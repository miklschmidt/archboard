class FakeTrack extends EventTarget {
	readyState: MediaStreamTrackState = "live";
	/** A real captured track starts enabled; muting is this flag going false. */
	enabled = true;
	stopCount = 0;

	stop(): void {
		this.stopCount += 1;
		this.readyState = "ended";
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

class FakeChannel extends EventTarget {
	readyState: RTCDataChannelState = "open";

	close(): void {
		this.readyState = "closed";
	}
}

class FakeSender {
	constructor(readonly track: FakeTrack) {}

	replaceTrack(): Promise<void> {
		return Promise.resolve();
	}
}

class FakePeer extends EventTarget {
	readonly channel = new FakeChannel();
	readonly remoteTrack = new FakeTrack();
	readonly senders: FakeSender[] = [];
	connectionState: RTCPeerConnectionState = "new";
	iceConnectionState: RTCIceConnectionState = "new";
	localDescription: RTCSessionDescription | null = null;
	closeCount = 0;

	constructor(readonly environment: FakeBrowser) {
		super();
	}

	addTransceiver(track: MediaStreamTrack): RTCRtpTransceiver {
		this.senders.push(new FakeSender(track as unknown as FakeTrack));
		return {} as RTCRtpTransceiver;
	}

	createDataChannel(): RTCDataChannel {
		return this.channel as unknown as RTCDataChannel;
	}

	createOffer(): Promise<RTCSessionDescriptionInit> {
		if (this.environment.fail === "createOffer")
			return Promise.reject(new Error("createOffer failed"));
		return Promise.resolve({ type: "offer", sdp: "local-offer" });
	}

	setLocalDescription(description: RTCLocalSessionDescriptionInit): Promise<void> {
		this.localDescription = {
			type: description.type ?? "offer",
			sdp: description.sdp ?? "",
		} as RTCSessionDescription;
		return Promise.resolve();
	}

	setRemoteDescription(): Promise<void> {
		return Promise.resolve();
	}

	getSenders(): RTCRtpSender[] {
		return this.senders as unknown as RTCRtpSender[];
	}

	getReceivers(): RTCRtpReceiver[] {
		return [{ track: this.remoteTrack } as unknown as RTCRtpReceiver];
	}

	removeTrack(): void {}

	close(): void {
		this.closeCount += 1;
		this.connectionState = "closed";
	}
}

class FakeAudioNode {
	connect(): void {}
	disconnect(): void {}
}

class FakeAnalyser extends FakeAudioNode {
	readonly fftSize = 4;

	getByteTimeDomainData(samples: Uint8Array): void {
		samples.set([128, 128, 128, 128]);
	}
}

class FakeAudioContext {
	state: AudioContextState = "running";
	readonly source = new FakeAudioNode();
	readonly analyser = new FakeAnalyser();

	resume(): Promise<void> {
		this.state = "running";
		return Promise.resolve();
	}

	createMediaStreamSource(): MediaStreamAudioSourceNode {
		return this.source as unknown as MediaStreamAudioSourceNode;
	}

	createAnalyser(): AnalyserNode {
		return this.analyser as unknown as AnalyserNode;
	}

	close(): Promise<void> {
		this.state = "closed";
		return Promise.resolve();
	}
}

const active: FakeBrowser[] = [];

function currentBrowser(): FakeBrowser {
	const browser = active.at(-1);
	if (browser === undefined) throw new Error("No fake media browser is installed.");
	return browser;
}

export class FakeBrowser extends EventTarget {
	readonly localTracks: FakeTrack[] = [];
	readonly peers: FakePeer[] = [];
	readonly restores: Array<() => void> = [];
	fail?: "createOffer";

	constructor() {
		super();
		this.install("navigator", { mediaDevices: this });
		this.install("MediaStream", FakeStream);
		this.install("RTCPeerConnection", function (this: unknown) {
			const browser = currentBrowser();
			const peer = new FakePeer(browser);
			browser.peers.push(peer);
			return peer;
		});
		this.install("AudioContext", FakeAudioContext);
		let frame = 0;
		const frames = new Set<number>();
		this.install("requestAnimationFrame", () => {
			frames.add(++frame);
			return frame;
		});
		this.install("cancelAnimationFrame", (id: number) => frames.delete(id));
		active.push(this);
	}

	getUserMedia(): Promise<MediaStream> {
		const track = new FakeTrack();
		this.localTracks.push(track);
		return Promise.resolve(new FakeStream([track]) as unknown as MediaStream);
	}

	restore(): void {
		const index = active.lastIndexOf(this);
		if (index >= 0) active.splice(index, 1);
		while (this.restores.length > 0) this.restores.pop()?.();
	}

	assertReleased(): void {
		if (this.localTracks.some((track) => track.stopCount !== 1))
			throw new Error("The fake microphone track was not released exactly once.");
		if (
			this.peers.some(
				(peer) =>
					peer.connectionState !== "closed" ||
					peer.closeCount !== 1 ||
					peer.remoteTrack.stopCount !== 1,
			)
		)
			throw new Error("The fake peer connection was not released exactly once.");
	}

	private install(name: string, value: unknown): void {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
		this.restores.push(() => {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		});
	}
}

export function restoreFakeBrowsers(): void {
	while (active.length > 0) active.at(-1)?.restore();
}
