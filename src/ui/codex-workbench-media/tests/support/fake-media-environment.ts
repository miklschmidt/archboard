// A small fake browser for the media owner tests: enough of the realtime
// environment for a session to negotiate, meter, mute and release, plus the
// audio elements the owner mounts.

import type {
	RealtimeDataChannel,
	RealtimeMediaDevices,
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
	RealtimeReceiver,
	RealtimeSender,
	RealtimeTimer,
} from "@/ui/codex-realtime";
import type { BrowserAudioElementPort } from "@/ui/codex-workbench-media";
import type { VoiceOutputMeter, VoiceOutputPlayback } from "@/ui/voice-output-level";

/**
 * Does nothing.
 */
function noop(): void {
	// Nothing to do.
}

/** A captured or received track. */
class FakeTrack extends EventTarget implements RealtimeMediaTrack {
	readyState: MediaStreamTrackState = "live";
	/** A real captured track starts enabled; muting is this flag going false. */
	enabled = true;
	stopCount = 0;

	/**
	 * Stops the track.
	 */
	stop(): void {
		this.stopCount += 1;
		this.readyState = "ended";
	}
}

/** A stream of fake tracks. */
class FakeStream implements RealtimeMediaStream, VoiceOutputPlayback {
	readonly tracks: readonly FakeTrack[];

	/**
	 * Builds a stream.
	 * @param tracks The tracks.
	 */
	constructor(tracks: readonly FakeTrack[]) {
		this.tracks = tracks;
	}

	/**
	 * Every track.
	 * @returns The tracks.
	 */
	getTracks(): readonly FakeTrack[] {
		return this.tracks;
	}

	/**
	 * The audio tracks.
	 * @returns The tracks.
	 */
	getAudioTracks(): readonly FakeTrack[] {
		return this.tracks;
	}
}

/** The events channel. */
class FakeChannel extends EventTarget implements RealtimeDataChannel {
	readyState: RTCDataChannelState = "open";

	/**
	 * Closes.
	 */
	close(): void {
		this.readyState = "closed";
	}
}

/** One sender. */
class FakeSender implements RealtimeSender {
	readonly track: RealtimeMediaTrack;

	/**
	 * Builds a sender.
	 * @param track The track.
	 */
	constructor(track: RealtimeMediaTrack) {
		this.track = track;
	}

	/**
	 * Replaces the track.
	 * @returns Resolved.
	 */
	replaceTrack(): Promise<void> {
		return Promise.resolve();
	}
}

/** The peer connection. */
class FakePeer extends EventTarget implements RealtimePeer {
	readonly channel = new FakeChannel();
	readonly remoteTrack = new FakeTrack();
	readonly senders: FakeSender[] = [];
	readonly browser: FakeMediaBrowser;
	connectionState: RTCPeerConnectionState = "new";
	iceConnectionState: RTCIceConnectionState = "new";
	localDescription: Pick<RTCSessionDescription, "sdp"> | null = null;
	closeCount = 0;

	/**
	 * Builds a peer.
	 * @param browser The fake browser.
	 */
	constructor(browser: FakeMediaBrowser) {
		super();
		this.browser = browser;
	}

	/**
	 * Adds one sender.
	 * @param track The captured track.
	 */
	addTransceiver(track: RealtimeMediaTrack): void {
		this.senders.push(new FakeSender(track));
	}

	/**
	 * The channel.
	 * @returns The channel.
	 */
	createDataChannel(): FakeChannel {
		return this.channel;
	}

	/**
	 * The local offer, or the configured failure.
	 * @returns The offer.
	 */
	createOffer(): Promise<RTCSessionDescriptionInit> {
		if (this.browser.fail === "createOffer") {
			return Promise.reject(new Error("createOffer failed"));
		}
		return Promise.resolve({ type: "offer", sdp: "local-offer" });
	}

	/**
	 * Applies the local description.
	 * @returns Resolved.
	 * @param description The offer.
	 */
	setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
		this.localDescription = { sdp: description.sdp ?? "" };
		return Promise.resolve();
	}

	/**
	 * Applies the remote description.
	 * @returns Resolved.
	 */
	setRemoteDescription(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * The senders.
	 * @returns Every sender.
	 */
	getSenders(): readonly FakeSender[] {
		return this.senders;
	}

	/**
	 * The one receiver.
	 * @returns The receivers.
	 */
	getReceivers(): readonly RealtimeReceiver[] {
		return [{ track: this.remoteTrack }];
	}

	/**
	 * Removes a sender.
	 */
	removeTrack(): void {
		// Nothing to count here.
	}

	/**
	 * Closes.
	 */
	close(): void {
		this.closeCount += 1;
		this.connectionState = "closed";
	}
}

/** A silent, running output meter. */
class FakeMeter implements VoiceOutputMeter {
	closeCount = 0;

	/**
	 * Running.
	 * @returns Running.
	 */
	playback(): "running" {
		return "running";
	}

	/**
	 * Resumes.
	 * @returns Resolved.
	 */
	resume(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Silence.
	 * @returns Zero.
	 */
	read(): number {
		return 0;
	}

	/**
	 * Closes.
	 */
	close(): void {
		this.closeCount += 1;
	}
}

/** The owner's audio element. */
class FakeAudioElement {
	autoplay = false;
	hidden = false;
	srcObject: RealtimeMediaStream | null = null;
	removed = false;
	pauseCount = 0;

	/**
	 * Plays.
	 * @returns Resolved.
	 */
	play(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Pauses.
	 */
	pause(): void {
		this.pauseCount += 1;
	}

	/**
	 * Reloads.
	 */
	load(): void {
		// Nothing to reload.
	}

	/**
	 * Sets an attribute.
	 */
	setAttribute(): void {
		// Attributes are not modelled.
	}

	/**
	 * Removes an attribute.
	 */
	removeAttribute(): void {
		// Attributes are not modelled.
	}

	/**
	 * Removes the element from its document.
	 */
	remove(): void {
		this.removed = true;
	}
}

/** The fake browser: devices, environment and audio elements. */
class FakeMediaBrowser extends EventTarget implements RealtimeMediaDevices {
	readonly localTracks: FakeTrack[] = [];
	readonly peers: FakePeer[] = [];
	readonly meters: FakeMeter[] = [];
	readonly audio: FakeAudioElement[] = [];
	readonly elements = new WeakMap<HTMLMediaElement, FakeAudioElement>();
	fail?: "createOffer" | undefined;
	denyPermission = false;

	/**
	 * Captures a microphone, or refuses it.
	 * @returns The captured stream.
	 */
	getUserMedia(): Promise<RealtimeMediaStream> {
		if (this.denyPermission) {
			return Promise.reject(new DOMException("denied", "NotAllowedError"));
		}
		const track = new FakeTrack();
		this.localTracks.push(track);
		return Promise.resolve(new FakeStream([track]));
	}

	/**
	 * The most recently captured track.
	 * @returns The track.
	 */
	get localTrack(): FakeTrack {
		const track = this.localTracks.at(-1);
		if (track === undefined) {
			throw new Error("No microphone was captured.");
		}
		return track;
	}

	/**
	 * The session's environment over this fake.
	 * @returns The environment.
	 */
	environment(): RealtimeMediaEnvironment {
		return {
			/**
			 * The devices.
			 * @returns This browser.
			 */
			mediaDevices: () => this,
			/**
			 * Supported.
			 * @returns True.
			 */
			realtimeSupported: () => true,
			/**
			 * A peer.
			 * @returns The peer.
			 */
			createPeerConnection: () => {
				const peer = new FakePeer(this);
				this.peers.push(peer);
				return peer;
			},
			/**
			 * The remote stream.
			 * @param tracks The received tracks.
			 * @returns The stream.
			 */
			createMediaStream: (tracks: readonly RealtimeMediaTrack[]) =>
				new FakeStream(tracks.filter((track): track is FakeTrack => track instanceof FakeTrack)),
			/**
			 * Attaches playback to the fake element behind the handle.
			 * @param element The element.
			 * @param stream The stream.
			 */
			attachPlayback: (element: HTMLMediaElement, stream: RealtimeMediaStream) => {
				const audio = this.elements.get(element);
				if (audio === undefined) {
					throw new Error("The element is not a fake audio element.");
				}
				audio.srcObject = stream;
			},
			/**
			 * A silent meter.
			 * @returns The meter.
			 */
			analysePlayback: () => {
				const meter = new FakeMeter();
				this.meters.push(meter);
				return meter;
			},
			frames: {
				/**
				 * Never runs a frame.
				 * @returns A handle.
				 */
				requestFrame: () => 1,
				/**
				 * Cancels nothing.
				 */
				cancelFrame: noop,
			},
			/**
			 * A frozen clock.
			 * @returns Zero.
			 */
			now: () => 0,
			/**
			 * A timer that never fires.
			 * @returns The timer.
			 */
			schedule: (): RealtimeTimer => ({
				/**
				 * Cancels nothing.
				 */
				cancel: noop,
			}),
		};
	}

	/**
	 * The owner's audio element port over this fake.
	 * @returns The port.
	 */
	audioElements(): BrowserAudioElementPort {
		return {
			/**
			 * A fake element and its typed handle.
			 * @returns The handle.
			 */
			create: () => {
				const audio = new FakeAudioElement();
				this.audio.push(audio);
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The owner mounts a browser audio element and hands it to the neutral host contract; this fake implements exactly the members the owner and the session touch, and the WeakMap is how the fake environment finds it again.
				const element = audio as unknown as HTMLAudioElement;
				this.elements.set(element, audio);
				return element;
			},
		};
	}

	/**
	 * Asserts every microphone track was released exactly once.
	 */
	assertTracksReleased(): void {
		for (const track of this.localTracks) {
			if (track.stopCount !== 1) {
				throw new Error("The fake microphone track was not released exactly once.");
			}
		}
	}

	/**
	 * Asserts every peer and received track was released exactly once.
	 */
	assertPeersReleased(): void {
		for (const peer of this.peers) {
			if (peer.connectionState !== "closed" || peer.closeCount !== 1) {
				throw new Error("The fake peer connection was not released exactly once.");
			}
			if (peer.remoteTrack.stopCount !== 1) {
				throw new Error("The fake remote track was not released exactly once.");
			}
		}
	}

	/**
	 * Asserts every resource was released exactly once.
	 */
	assertReleased(): void {
		this.assertTracksReleased();
		this.assertPeersReleased();
	}
}

export { FakeAudioElement, FakeMediaBrowser };
