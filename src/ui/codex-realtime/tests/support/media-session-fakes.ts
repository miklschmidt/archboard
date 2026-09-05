// The fake browser behind the media session tests: one environment object
// implementing the session's ports, recording every side effect in order,
// with stage gates that pause, fail, or cost time on demand.

import { expect } from "bun:test";

import type {
	AnswerSdp,
	CommandOutcome,
	RealtimeCorrelation,
	RealtimeHost,
	RealtimeMediaDevices,
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimeTimer,
	RemoteMediaAttachment,
} from "@/ui/codex-realtime";
import {
	FakePeer,
	FakeStream,
	FakeTrack,
	TrackedTarget,
} from "@/ui/codex-realtime/tests/support/fake-media";
import { FakeAudio, FakeMeter } from "@/ui/codex-realtime/tests/support/fake-playback";
import {
	correlation,
	createStopOutcome,
	type StopIdentityMode,
	type StopMode,
} from "@/ui/codex-realtime/tests/support/media-session-stop-fixtures";
import type { VoiceOutputPlayback } from "@/ui/voice-output-level";

type Stage = "getUserMedia" | "createOffer" | "setLocal" | "hostOffer" | "setRemote" | "resume";
type BrowserPromiseMode = "resolved" | "rejected" | "pending";

const PUBLISHED_CHECKPOINTS = [
	["requesting_permission", "start_requested", "getUserMedia"],
	["negotiating", "permission_granted", "peer"],
	["negotiating", "offer_created", "hostOffer"],
	["negotiating", "answer_received", "setRemote"],
	["listening", "negotiation_succeeded", null],
] as const;

const SIDE_EFFECT_CHECKPOINTS = [
	["timer", "createOffer"],
	["getAudioTracks", "peer"],
	["peer", "transceiver"],
	["transceiver", "channel"],
	["channel", "trackListener"],
	["trackListener", "mediaDevicesListener"],
	["mediaDevicesListener", "peerListener"],
	["peerListener", "channelListener"],
	["channelListener", "createOffer"],
	["getReceivers", "remoteStream"],
	["remoteStream", "attachRemote"],
	["attachRemote", "meter"],
	["play", "meter"],
] as const;

/** Samples whose RMS is 0.3535533905932738. */
const AUDIBLE_SAMPLES: readonly number[] = Object.freeze([128, 192, 128, 64]);
/** Samples whose RMS is 0. */
const SILENT_SAMPLES: readonly number[] = Object.freeze([128, 128, 128, 128]);

/** One scheduled timer. */
interface ScheduledTimer {
	readonly due: number;
	readonly callback: () => void;
}

/** The fake browser: media devices, environment, clock, frames and host stop. */
class FakeBrowser extends TrackedTarget implements RealtimeMediaDevices {
	readonly order: string[] = [];
	readonly localTracks: FakeTrack[] = [];
	readonly localStreams: FakeStream[] = [];
	readonly peers: FakePeer[] = [];
	readonly meters: FakeMeter[] = [];
	readonly audios: FakeAudio[] = [];
	readonly elements = new WeakMap<HTMLMediaElement, FakeAudio>();
	readonly frames = new Map<number, () => void>();
	readonly timers = new Map<RealtimeTimer, ScheduledTimer>();
	readonly stopRequests: RealtimeCorrelation[] = [];
	readonly costs = new Map<Stage, number>();
	attachment?: RemoteMediaAttachment;
	pause?: Stage;
	fail?: Stage;
	stopMode: StopMode = "delivered";
	stopIdentity: StopIdentityMode = "exact";
	replaceTrackMode: BrowserPromiseMode = "resolved";
	senderCount = 1;
	noTrack = false;
	noMediaDevices = false;
	unsupported = false;
	autoplayDenied = false;
	deferPlay = false;
	throwAttachment = false;
	/** The meter's context never leaves suspended, whatever resume says. */
	staySuspended = false;
	samples: readonly number[] = AUDIBLE_SAMPLES;
	stopCount = 0;
	now = 0;
	onStep?: (step: string) => void;
	#nextFrame = 0;
	#releaseGate?: () => void;
	#releaseStopGate?: (outcome: CommandOutcome) => void;

	/**
	 * Builds a browser.
	 */
	constructor() {
		super();
		/**
		 * Records a devices listener registration when a hook is watching.
		 */
		this.onListenerAdded = () => {
			if (this.onStep !== undefined) {
				this.record("mediaDevicesListener");
			}
		};
	}

	/**
	 * The most recently captured microphone track.
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
	 * Records one step and tells the hook.
	 * @param step The step name.
	 */
	record(step: string): void {
		this.order.push(step);
		this.onStep?.(step);
	}

	/**
	 * Passes one stage: record, cost, fail or pause as configured.
	 * @param stage The stage.
	 * @param value The value the stage yields.
	 * @returns The value.
	 */
	async stage<T>(stage: Stage, value: T): Promise<T> {
		this.record(stage);
		const cost = this.costs.get(stage);
		if (cost !== undefined) {
			this.advance(cost);
		}
		if (this.fail === stage) {
			throw new Error(`${stage} failed`);
		}
		if (this.pause === stage) {
			await new Promise<void>((resolve) => {
				this.#releaseGate = resolve;
			});
		}
		return value;
	}

	/**
	 * Captures a microphone through the getUserMedia stage gate.
	 * @returns The captured stream.
	 */
	getUserMedia(): Promise<RealtimeMediaStream> {
		const tracks = this.noTrack ? [] : [new FakeTrack()];
		for (const track of tracks) {
			/**
			 * Records a track listener registration when a hook is watching.
			 */
			track.onListenerAdded = () => {
				if (this.onStep !== undefined) {
					this.record("trackListener");
				}
			};
		}
		this.localTracks.push(...tracks);
		const stream = new FakeStream(this, tracks, false);
		this.localStreams.push(stream);
		return this.stage("getUserMedia", stream);
	}

	/**
	 * The host stop, answering as configured.
	 * @param request The stop request.
	 * @returns The outcome.
	 */
	stop(request: RealtimeCorrelation): Promise<CommandOutcome> {
		this.stopCount += 1;
		this.stopRequests.push(request);
		if (this.stopMode === "rejected") {
			return Promise.reject(new Error("stop rejected"));
		}
		if (this.stopMode === "paused") {
			return new Promise<CommandOutcome>((resolve) => {
				this.#releaseStopGate = resolve;
			});
		}
		return Promise.resolve(createStopOutcome(this.stopMode, request, this.stopIdentity));
	}

	/**
	 * Releases a paused stage.
	 */
	release(): void {
		this.#releaseGate?.();
	}

	/**
	 * Releases a paused host stop.
	 * @param mode How the host answers.
	 */
	releaseStop(mode: Exclude<StopMode, "paused" | "rejected"> = "delivered"): void {
		const request = this.stopRequests.at(-1);
		if (request === undefined) {
			throw new Error("No stop was requested.");
		}
		this.#releaseStopGate?.(createStopOutcome(mode, request, this.stopIdentity));
	}

	/**
	 * Moves the clock and fires every timer that came due.
	 * @param durationMs How far to move.
	 */
	advance(durationMs: number): void {
		this.now += durationMs;
		for (let due = this.nextDue(); due !== undefined; due = this.nextDue()) {
			this.timers.delete(due[0]);
			due[1].callback();
		}
	}

	/**
	 * The earliest due timer.
	 * @returns The timer and its schedule, or undefined.
	 */
	nextDue(): [RealtimeTimer, ScheduledTimer] | undefined {
		return [...this.timers.entries()]
			.filter(([, timer]) => timer.due <= this.now)
			.toSorted((left, right) => left[1].due - right[1].due)[0];
	}

	/**
	 * Runs the earliest pending animation frame.
	 */
	frame(): void {
		const entry = this.frames.entries().next().value;
		if (entry === undefined) {
			return;
		}
		this.frames.delete(entry[0]);
		entry[1]();
	}

	/**
	 * Schedules a timer against the fake clock.
	 * @param callback The callback.
	 * @param delayMs The delay.
	 * @returns The timer.
	 */
	schedule(callback: () => void, delayMs: number): RealtimeTimer {
		if (this.onStep !== undefined) {
			this.record("timer");
		}
		const timer: RealtimeTimer = {
			/**
			 * Cancels this timer.
			 */
			cancel: () => {
				this.timers.delete(timer);
			},
		};
		this.timers.set(timer, { due: this.now + delayMs, callback });
		return timer;
	}

	/**
	 * Schedules an animation frame.
	 * @param callback The frame.
	 * @returns The handle.
	 */
	requestFrame(callback: () => void): number {
		this.#nextFrame += 1;
		this.frames.set(this.#nextFrame, callback);
		return this.#nextFrame;
	}

	/**
	 * A peer, recorded as a step.
	 * @returns The peer.
	 */
	createPeerConnection(): FakePeer {
		this.record("peer");
		const peer = new FakePeer(this);
		this.peers.push(peer);
		return peer;
	}

	/**
	 * The output meter over a playback stream, recorded as a step.
	 * @param playback The stream to measure.
	 * @returns The meter.
	 */
	analysePlayback(playback: VoiceOutputPlayback): FakeMeter {
		this.record("meter");
		const meter = new FakeMeter(this, playback);
		this.meters.push(meter);
		return meter;
	}

	/**
	 * Attaches a stream to the fake element behind an attachment.
	 * @param element The element the host handed over.
	 * @param stream The remote stream.
	 */
	attachPlayback(element: HTMLMediaElement, stream: RealtimeMediaStream): void {
		const audio = this.elements.get(element);
		if (audio === undefined) {
			throw new Error("The element is not a fake audio element.");
		}
		audio.srcObject = stream;
	}

	/**
	 * The session's environment over this fake.
	 * @returns The environment.
	 */
	environment(): RealtimeMediaEnvironment {
		return {
			/**
			 * The media devices.
			 * @returns This browser, or null without microphone support.
			 */
			mediaDevices: () => (this.noMediaDevices ? null : this),
			/**
			 * Realtime support.
			 * @returns False when configured unsupported.
			 */
			realtimeSupported: () => !this.unsupported,
			/**
			 * A peer.
			 * @returns The peer.
			 */
			createPeerConnection: () => this.createPeerConnection(),
			/**
			 * The remote stream over the received tracks.
			 * @param tracks The received tracks.
			 * @returns The stream.
			 */
			createMediaStream: (tracks: readonly RealtimeMediaTrack[]) =>
				new FakeStream(
					this,
					tracks.filter((track): track is FakeTrack => track instanceof FakeTrack),
					true,
				),
			/**
			 * Attaches playback.
			 * @param element The element.
			 * @param stream The stream.
			 */
			attachPlayback: (element: HTMLMediaElement, stream: RealtimeMediaStream) => {
				this.attachPlayback(element, stream);
			},
			/**
			 * The output meter.
			 * @param playback The stream to measure.
			 * @returns The meter.
			 */
			analysePlayback: (playback: VoiceOutputPlayback) => this.analysePlayback(playback),
			frames: {
				/**
				 * Schedules a frame.
				 * @param callback The frame.
				 * @returns The handle.
				 */
				requestFrame: (callback: () => void) => this.requestFrame(callback),
				/**
				 * Cancels a frame.
				 * @param handle The handle.
				 */
				cancelFrame: (handle: number) => {
					this.frames.delete(handle);
				},
			},
			/**
			 * The clock.
			 * @returns Now.
			 */
			now: () => this.now,
			/**
			 * A timer.
			 * @param callback The callback.
			 * @param delayMs The delay.
			 * @returns The timer.
			 */
			schedule: (callback: () => void, delayMs: number) => this.schedule(callback, delayMs),
		};
	}

	/**
	 * A new host media element handed to the session's attachment.
	 * @returns The fake element and its typed handle.
	 */
	newElement(): { readonly audio: FakeAudio; readonly element: HTMLMediaElement } {
		const audio = new FakeAudio(this);
		this.audios.push(audio);
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The neutral host contract hands the session a browser media element; this fake implements exactly the members the session touches, and the WeakMap below is how the fake environment finds it again.
		const element = audio as unknown as HTMLMediaElement;
		this.elements.set(element, audio);
		return { audio, element };
	}

	/**
	 * Asserts every peer, sender and received track was released exactly once.
	 */
	assertPeersReleased(): void {
		for (const peer of this.peers) {
			expect(peer.listenerCount).toBe(0);
			expect(peer.channel.listenerCount).toBe(0);
			expect(peer.connectionState).toBe("closed");
			expect(peer.closeCount).toBe(1);
			expect(peer.removeCount).toBe(peer.senders.length);
			for (const sender of peer.senders) {
				expect(sender.replaceCount).toBe(1);
			}
			expect(peer.remoteTrack.stopCount).toBe(1);
		}
	}

	/**
	 * Asserts every meter, frame, timer, microphone track and element was released.
	 */
	assertPlaybackReleased(): void {
		for (const meter of this.meters) {
			expect(meter.closeCount).toBe(1);
		}
		expect(this.listenerCount).toBe(0);
		expect(this.frames.size).toBe(0);
		expect(this.timers.size).toBe(0);
		for (const track of this.localTracks) {
			expect(track.stopCount).toBe(1);
		}
		for (const audio of this.audios) {
			const detachCount = audio.srcObject === undefined ? 0 : 1;
			expect(audio.pauseCount).toBe(detachCount);
			expect(audio.removeCount).toBe(detachCount);
			expect(audio.loadCount).toBe(detachCount);
		}
	}

	/**
	 * Asserts that every resource was released exactly once.
	 */
	assertReleased(): void {
		this.assertPeersReleased();
		this.assertPlaybackReleased();
	}
}

/**
 * A host over the fake browser.
 * @param env The fake browser.
 * @returns The host.
 */
function host(env: FakeBrowser): RealtimeHost {
	return {
		/**
		 * Answers the offer through the hostOffer stage gate.
		 * @param offer The offer.
		 * @returns The answer.
		 */
		createOffer: (offer) => env.stage<AnswerSdp>("hostOffer", { ...offer, sdp: "remote-answer" }),
		/**
		 * Hands the session a fresh element.
		 * @param attachment The attachment.
		 */
		attachRemoteMedia: (attachment) => {
			env.record("attachRemote");
			if (env.throwAttachment) {
				throw new Error("attachment failed");
			}
			env.attachment = attachment;
			attachment.attachTo(env.newElement().element);
		},
		/**
		 * No semantic events reach the browser.
		 * @returns A no-op unsubscribe.
		 */
		onSemanticEvent: () => () => undefined,
		/**
		 * Delivers text.
		 * @param request The request.
		 * @returns Delivered.
		 */
		appendText: (request) => Promise.resolve({ outcome: "delivered", ...request }),
		/**
		 * Delivers speech.
		 * @param request The request.
		 * @returns Delivered.
		 */
		appendSpeech: (request) => Promise.resolve({ outcome: "delivered", ...request }),
		/**
		 * Stops through the fake browser.
		 * @param request The request.
		 * @returns The configured outcome.
		 */
		stop: (request) => env.stop(request),
		/**
		 * Recovers.
		 * @param request The request.
		 * @returns Delivered.
		 */
		recover: (request) => Promise.resolve({ outcome: "delivered", ...request }),
	};
}

/**
 * Lets pending microtasks settle.
 * @param turns How many microtask turns to yield.
 */
async function settle(turns = 96): Promise<void> {
	let chain = Promise.resolve();
	for (let turn = 0; turn < turns; turn += 1) {
		chain = chain.then(() => undefined);
	}
	await chain;
}

export {
	AUDIBLE_SAMPLES,
	FakeBrowser,
	PUBLISHED_CHECKPOINTS,
	SIDE_EFFECT_CHECKPOINTS,
	SILENT_SAMPLES,
	correlation,
	host,
	settle,
	type Stage,
};
