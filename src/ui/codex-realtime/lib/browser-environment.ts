// The real browser behind the media session's ports. Every DOM object is
// narrowed with instanceof at this one seam; nothing here is asserted.

import type {
	RealtimeMediaDevices,
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
	RealtimeSender,
} from "@/ui/codex-realtime/lib/environment";
import {
	browserFrameScheduler,
	createWebAudioOutputMeter,
	webAudioSupported,
} from "@/ui/voice-output-level";

/**
 * Whether a global names a constructor or function.
 * @param name The global's name.
 * @returns True when it is callable.
 */
function globalFunction(name: string): boolean {
	const candidate: unknown = Reflect.get(globalThis, name);
	return typeof candidate === "function";
}

/**
 * The browser's media devices, when it can request a microphone.
 * @returns The devices, or null.
 */
function browserMediaDevices(): RealtimeMediaDevices | null {
	const navigator: unknown = Reflect.get(globalThis, "navigator");
	if (typeof navigator !== "object" || navigator === null) {
		return null;
	}
	const devices: unknown = Reflect.get(navigator, "mediaDevices");
	if (!(devices instanceof MediaDevices)) {
		return null;
	}
	return typeof Reflect.get(devices, "getUserMedia") === "function" ? devices : null;
}

/**
 * Whether the browser has microphone capture, WebRTC, Web Audio and frames.
 * @returns True when a realtime session can run here.
 */
function browserRealtimeMediaSupported(): boolean {
	return (
		globalFunction("MediaDevices") &&
		browserMediaDevices() !== null &&
		globalFunction("RTCPeerConnection") &&
		webAudioSupported() &&
		globalFunction("requestAnimationFrame")
	);
}

/**
 * A port track that is really a browser track.
 * @param track The port track.
 * @returns The browser track.
 */
function requireTrack(track: RealtimeMediaTrack): MediaStreamTrack {
	if (!(track instanceof MediaStreamTrack)) {
		throw new TypeError("The realtime track is not a browser MediaStreamTrack.");
	}
	return track;
}

/**
 * A port stream that is really a browser stream.
 * @param stream The port stream.
 * @returns The browser stream.
 */
function requireStream(stream: RealtimeMediaStream): MediaStream {
	if (!(stream instanceof MediaStream)) {
		throw new TypeError("The realtime stream is not a browser MediaStream.");
	}
	return stream;
}

/** The peer port over a real RTCPeerConnection. */
class BrowserPeer implements RealtimePeer {
	readonly #peer: RTCPeerConnection;

	/**
	 * Wraps one connection.
	 * @param peer The connection.
	 */
	constructor(peer: RTCPeerConnection) {
		this.#peer = peer;
	}

	/**
	 * The connection state.
	 * @returns The state.
	 */
	get connectionState(): RTCPeerConnectionState {
		return this.#peer.connectionState;
	}

	/**
	 * The ICE connection state.
	 * @returns The state.
	 */
	get iceConnectionState(): RTCIceConnectionState {
		return this.#peer.iceConnectionState;
	}

	/**
	 * The applied local description.
	 * @returns The description, or null.
	 */
	get localDescription(): Pick<RTCSessionDescription, "sdp"> | null {
		return this.#peer.localDescription;
	}

	/**
	 * Adds one send-and-receive audio transceiver.
	 * @param track The captured track.
	 * @param stream The captured stream.
	 */
	addTransceiver(track: RealtimeMediaTrack, stream: RealtimeMediaStream): void {
		this.#peer.addTransceiver(requireTrack(track), {
			direction: "sendrecv",
			streams: [requireStream(stream)],
		});
	}

	/**
	 * Creates the events channel.
	 * @param label The channel label.
	 * @returns The channel.
	 */
	createDataChannel(label: string): RTCDataChannel {
		return this.#peer.createDataChannel(label);
	}

	/**
	 * Creates the local offer.
	 * @returns The offer.
	 */
	createOffer(): Promise<RTCSessionDescriptionInit> {
		return this.#peer.createOffer();
	}

	/**
	 * Applies the local description.
	 * @param description The offer.
	 * @returns Resolves when applied.
	 */
	setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
		return this.#peer.setLocalDescription(description);
	}

	/**
	 * Applies the remote description.
	 * @param description The answer.
	 * @returns Resolves when applied.
	 */
	setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
		return this.#peer.setRemoteDescription(description);
	}

	/**
	 * The senders.
	 * @returns Every sender.
	 */
	getSenders(): readonly RTCRtpSender[] {
		return this.#peer.getSenders();
	}

	/**
	 * The receivers.
	 * @returns Every receiver.
	 */
	getReceivers(): readonly RTCRtpReceiver[] {
		return this.#peer.getReceivers();
	}

	/**
	 * Removes one sender.
	 * @param sender The sender.
	 */
	removeTrack(sender: RealtimeSender): void {
		if (!(sender instanceof RTCRtpSender)) {
			throw new TypeError("The realtime sender is not a browser RTCRtpSender.");
		}
		this.#peer.removeTrack(sender);
	}

	/**
	 * Closes the connection.
	 */
	close(): void {
		this.#peer.close();
	}

	/**
	 * Listens for one event.
	 * @param type The event name.
	 * @param listener The listener.
	 */
	addEventListener(type: string, listener: () => void): void {
		this.#peer.addEventListener(type, listener);
	}

	/**
	 * Stops listening for one event.
	 * @param type The event name.
	 * @param listener The listener.
	 */
	removeEventListener(type: string, listener: () => void): void {
		this.#peer.removeEventListener(type, listener);
	}
}

/**
 * The environment over this browser's globals.
 * @returns The environment.
 */
function browserRealtimeMediaEnvironment(): RealtimeMediaEnvironment {
	return Object.freeze({
		mediaDevices: browserMediaDevices,
		realtimeSupported: browserRealtimeMediaSupported,
		/**
		 * A new peer connection.
		 * @returns The peer port.
		 */
		createPeerConnection: () => new BrowserPeer(new RTCPeerConnection()),
		/**
		 * A stream over browser tracks.
		 * @param tracks The tracks.
		 * @returns The stream.
		 */
		createMediaStream: (tracks: readonly RealtimeMediaTrack[]) =>
			new MediaStream(tracks.map(requireTrack)),
		/**
		 * Makes the stream the element's source.
		 * @param element The element.
		 * @param stream The remote stream.
		 */
		attachPlayback: (element: HTMLMediaElement, stream: RealtimeMediaStream) => {
			element.srcObject = requireStream(stream);
		},
		analysePlayback: createWebAudioOutputMeter,
		frames: browserFrameScheduler(),
		/**
		 * The monotonic clock.
		 * @returns Milliseconds.
		 */
		now: () => globalThis.performance.now(),
		/**
		 * Schedules a timer.
		 * @param callback The callback.
		 * @param delayMs The delay.
		 * @returns The timer.
		 */
		schedule: (callback: () => void, delayMs: number) => {
			const handle = globalThis.setTimeout(callback, delayMs);
			return Object.freeze({
				/**
				 * Clears the timer.
				 */
				cancel: () => {
					globalThis.clearTimeout(handle);
				},
			});
		},
	});
}

export { browserRealtimeMediaEnvironment, browserRealtimeMediaSupported };
