// The browser ports the media session drives. Each is the narrow view of one
// DOM object the session actually uses, so a test can stand in a small fake
// and the real browser adapter can wrap the real objects without assertions.

import type { VoiceOutputFrameScheduler, VoiceOutputMeterFactory } from "@/ui/voice-output-level";

/** Something that raises named events; the DOM's EventTarget satisfies it. */
interface RealtimeEventSource {
	addEventListener(type: string, listener: () => void): void;
	removeEventListener(type: string, listener: () => void): void;
}

/** One captured or received audio track. */
interface RealtimeMediaTrack
	extends Pick<MediaStreamTrack, "enabled" | "readyState" | "stop">, RealtimeEventSource {}

/** A stream of tracks: the captured microphone, or the remote playback. */
interface RealtimeMediaStream {
	getTracks(): readonly RealtimeMediaTrack[];
	getAudioTracks(): readonly RealtimeMediaTrack[];
}

/** The realtime events channel. */
interface RealtimeDataChannel extends RealtimeEventSource {
	readonly readyState: RTCDataChannelState;
	close(): void;
}

/** One outbound sender on the peer. */
interface RealtimeSender {
	readonly track: RealtimeMediaTrack | null;
	replaceTrack(track: null): Promise<void>;
}

/** One inbound receiver on the peer. */
interface RealtimeReceiver {
	readonly track: RealtimeMediaTrack;
}

/** The peer connection. */
interface RealtimePeer extends RealtimeEventSource {
	readonly connectionState: RTCPeerConnectionState;
	readonly iceConnectionState: RTCIceConnectionState;
	readonly localDescription: Pick<RTCSessionDescription, "sdp"> | null;
	addTransceiver(track: RealtimeMediaTrack, stream: RealtimeMediaStream): void;
	createDataChannel(label: string): RealtimeDataChannel;
	createOffer(): Promise<RTCSessionDescriptionInit>;
	setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
	setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
	getSenders(): readonly RealtimeSender[];
	getReceivers(): readonly RealtimeReceiver[];
	removeTrack(sender: RealtimeSender): void;
	close(): void;
}

/** The microphone source. */
interface RealtimeMediaDevices extends RealtimeEventSource {
	getUserMedia(constraints: MediaStreamConstraints): Promise<RealtimeMediaStream>;
}

/** One scheduled timer; cancelling one that already fired is harmless. */
interface RealtimeTimer {
	readonly cancel: () => void;
}

/** Everything the media session needs from the browser. */
interface RealtimeMediaEnvironment {
	/** Null when the browser cannot request a microphone at all. */
	readonly mediaDevices: () => RealtimeMediaDevices | null;
	/** True when WebRTC, MediaStream, Web Audio and animation frames all exist. */
	readonly realtimeSupported: () => boolean;
	readonly createPeerConnection: () => RealtimePeer;
	readonly createMediaStream: (tracks: readonly RealtimeMediaTrack[]) => RealtimeMediaStream;
	/** Makes the remote stream the element's source; the one place a stream meets an element. */
	readonly attachPlayback: (element: HTMLMediaElement, stream: RealtimeMediaStream) => void;
	/** Builds the output meter over the remote playback stream. */
	readonly analysePlayback: VoiceOutputMeterFactory;
	readonly frames: VoiceOutputFrameScheduler;
	/** A monotonic clock in milliseconds. */
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => RealtimeTimer;
}

export type {
	RealtimeDataChannel,
	RealtimeEventSource,
	RealtimeMediaDevices,
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
	RealtimeReceiver,
	RealtimeSender,
	RealtimeTimer,
};
