// The fake WebRTC objects behind the media session tests: tracks, streams,
// channel, senders and the peer, each implementing the session's port and
// counting what the session did to it.

import type {
	RealtimeDataChannel,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
	RealtimeReceiver,
	RealtimeSender,
} from "@/ui/codex-realtime";
import type { VoiceOutputPlayback } from "@/ui/voice-output-level";

/** What the fakes need from the browser that owns them. */
interface FakeMediaHost {
	readonly onStep?: ((step: string) => void) | undefined;
	readonly senderCount: number;
	readonly replaceTrackMode: "resolved" | "rejected" | "pending";
	readonly record: (step: string) => void;
	readonly stage: <T>(stage: NegotiationStage, value: T) => Promise<T>;
}

type NegotiationStage = "createOffer" | "setLocal" | "setRemote";

/** An event target that counts its listeners. */
class TrackedTarget extends EventTarget {
	listenerCount = 0;
	onListenerAdded?: () => void;

	/**
	 * Registers and counts a listener.
	 * @param type The event name.
	 * @param listener The listener.
	 * @param options Listener options.
	 */
	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void {
		super.addEventListener(type, listener, options);
		if (listener !== null) {
			this.listenerCount += 1;
			this.onListenerAdded?.();
		}
	}

	/**
	 * Removes and uncounts a listener.
	 * @param type The event name.
	 * @param listener The listener.
	 * @param options Listener options.
	 */
	override removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	): void {
		super.removeEventListener(type, listener, options);
		if (listener !== null) {
			this.listenerCount -= 1;
		}
	}
}

/** A captured or received track. */
class FakeTrack extends TrackedTarget implements RealtimeMediaTrack {
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

	/**
	 * The device was unplugged.
	 */
	lose(): void {
		this.readyState = "ended";
		this.dispatchEvent(new Event("ended"));
	}
}

/** A stream of fake tracks. */
class FakeStream implements RealtimeMediaStream, VoiceOutputPlayback {
	readonly host: FakeMediaHost;
	readonly tracks: readonly FakeTrack[];

	/**
	 * Builds a stream.
	 * @param host The fake browser.
	 * @param tracks The tracks.
	 * @param remote Whether this is the remote stream, recorded as a step.
	 */
	constructor(host: FakeMediaHost, tracks: readonly FakeTrack[], remote: boolean) {
		this.host = host;
		this.tracks = tracks;
		if (remote && host.onStep !== undefined) {
			this.host.record("remoteStream");
		}
	}

	/**
	 * Every track.
	 * @returns The tracks.
	 */
	getTracks(): readonly FakeTrack[] {
		return this.tracks;
	}

	/**
	 * The audio tracks, recorded as a step when a hook is watching.
	 * @returns The tracks.
	 */
	getAudioTracks(): readonly FakeTrack[] {
		if (this.host.onStep !== undefined) {
			this.host.record("getAudioTracks");
		}
		return this.tracks;
	}
}

/** The events channel. */
class FakeChannel extends TrackedTarget implements RealtimeDataChannel {
	readyState: RTCDataChannelState = "open";
	closeCount = 0;

	/**
	 * Closes locally.
	 */
	close(): void {
		this.closeCount += 1;
		this.readyState = "closed";
	}

	/**
	 * The remote side closed the channel.
	 */
	remoteClose(): void {
		this.readyState = "closed";
		this.dispatchEvent(new Event("close"));
	}
}

/** One sender. */
class FakeSender implements RealtimeSender {
	readonly track: RealtimeMediaTrack;
	readonly host: FakeMediaHost;
	replaceCount = 0;

	/**
	 * Builds a sender.
	 * @param track The track it sends.
	 * @param host The fake browser.
	 */
	constructor(track: RealtimeMediaTrack, host: FakeMediaHost) {
		this.track = track;
		this.host = host;
	}

	/**
	 * Replaces the track, answering as the browser mode says.
	 * @returns Resolves, rejects, or never settles.
	 */
	replaceTrack(): Promise<void> {
		this.replaceCount += 1;
		if (this.host.replaceTrackMode === "rejected") {
			return Promise.reject(new Error("replace failed"));
		}
		if (this.host.replaceTrackMode === "pending") {
			return new Promise(() => undefined);
		}
		return Promise.resolve();
	}
}

/** The peer connection. */
class FakePeer extends TrackedTarget implements RealtimePeer {
	readonly channel = new FakeChannel();
	readonly remoteTrack = new FakeTrack();
	readonly senders: FakeSender[] = [];
	readonly host: FakeMediaHost;
	connectionState: RTCPeerConnectionState = "new";
	iceConnectionState: RTCIceConnectionState = "new";
	closeCount = 0;
	removeCount = 0;
	#localDescription: Pick<RTCSessionDescription, "sdp"> | null = null;

	/**
	 * Builds a peer.
	 * @param host The fake browser.
	 */
	constructor(host: FakeMediaHost) {
		super();
		this.host = host;
		/**
		 * Records a peer listener registration when a hook is watching.
		 */
		this.onListenerAdded = () => {
			if (host.onStep !== undefined) {
				host.record("peerListener");
			}
		};
		/**
		 * Records a channel listener registration when a hook is watching.
		 */
		this.channel.onListenerAdded = () => {
			if (host.onStep !== undefined) {
				host.record("channelListener");
			}
		};
	}

	/**
	 * The applied local description, recorded as a step when a hook is watching.
	 * @returns The description.
	 */
	get localDescription(): Pick<RTCSessionDescription, "sdp"> | null {
		if (this.host.onStep !== undefined) {
			this.host.record("localDescription");
		}
		return this.#localDescription;
	}

	/**
	 * Adds the configured number of senders for one track.
	 * @param track The captured track.
	 */
	addTransceiver(track: RealtimeMediaTrack): void {
		this.host.record("transceiver");
		for (let index = 0; index < this.host.senderCount; index += 1) {
			this.senders.push(new FakeSender(track, this.host));
		}
	}

	/**
	 * The one channel.
	 * @returns The channel.
	 */
	createDataChannel(): FakeChannel {
		this.host.record("channel");
		return this.channel;
	}

	/**
	 * The local offer, through the createOffer stage gate.
	 * @returns The offer.
	 */
	createOffer(): Promise<RTCSessionDescriptionInit> {
		return this.host.stage("createOffer", { type: "offer", sdp: "local-offer" });
	}

	/**
	 * Applies the local description through the setLocal stage gate.
	 * @param description The offer.
	 */
	async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
		await this.host.stage("setLocal", undefined);
		this.#localDescription = { sdp: description.sdp ?? "" };
	}

	/**
	 * Applies the remote description through the setRemote stage gate.
	 */
	async setRemoteDescription(): Promise<void> {
		await this.host.stage("setRemote", undefined);
	}

	/**
	 * The senders.
	 * @returns Every sender.
	 */
	getSenders(): readonly FakeSender[] {
		return this.senders;
	}

	/**
	 * The one receiver, recorded as a step when a hook is watching.
	 * @returns The receivers.
	 */
	getReceivers(): readonly RealtimeReceiver[] {
		if (this.host.onStep !== undefined) {
			this.host.record("getReceivers");
		}
		return [{ track: this.remoteTrack }];
	}

	/**
	 * Removes a sender.
	 */
	removeTrack(): void {
		this.removeCount += 1;
	}

	/**
	 * Closes the connection.
	 */
	close(): void {
		this.closeCount += 1;
		this.connectionState = "closed";
	}

	/**
	 * ICE moved to a lost state.
	 * @param state The lost state.
	 */
	loseIce(state: "disconnected" | "failed"): void {
		this.iceConnectionState = state;
		this.dispatchEvent(new Event("iceconnectionstatechange"));
	}
}

export {
	FakeChannel,
	FakePeer,
	FakeSender,
	FakeStream,
	FakeTrack,
	TrackedTarget,
	type FakeMediaHost,
	type NegotiationStage,
};
