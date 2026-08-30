import {
	INITIAL_REALTIME_STATE,
	transitionRealtimeState,
	type RealtimeCorrelation,
	type RealtimeHost,
	type RealtimeRecoverableErrorReason,
	type RealtimeState,
	type RealtimeTerminalErrorReason,
	type RealtimeUnsubscribe,
} from "./contract.js";
import { CODEX_REALTIME_START_MS, CODEX_REALTIME_STOP_MS } from "../../../shared/timing/timing.js";

export const REALTIME_MEDIA_FEATURE = "webrtc-audio" as const;

export interface RealtimeMediaSnapshot {
	readonly correlation: RealtimeCorrelation | null;
	readonly state: RealtimeState;
	readonly inputLevel: number;
}

export type RealtimeMediaListener = (snapshot: RealtimeMediaSnapshot) => void;

export interface RealtimeMediaSession {
	readonly getSnapshot: () => RealtimeMediaSnapshot;
	readonly subscribe: (listener: RealtimeMediaListener) => RealtimeUnsubscribe;
	readonly start: (correlation: RealtimeCorrelation) => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
	readonly dispose: () => Promise<void>;
}

const CANCELLED = Symbol("cancelled");
const TIMED_OUT = Symbol("timed-out");
type RunTimer = ReturnType<typeof globalThis.setTimeout>;

interface Run {
	readonly correlation: RealtimeCorrelation;
	readonly cancelled: Promise<typeof CANCELLED>;
	readonly cancel: () => void;
	readonly removers: Array<() => void>;
	readonly timers: Set<RunTimer>;
	readonly stoppedTracks: Set<MediaStreamTrack>;
	state: RealtimeState;
	snapshot: RealtimeMediaSnapshot;
	cancelledNow: boolean;
	failed: boolean;
	offerSent: boolean;
	deviceLost: boolean;
	localStream?: MediaStream;
	peer?: RTCPeerConnection;
	channel?: RTCDataChannel;
	remoteStream?: MediaStream;
	remoteElement?: HTMLMediaElement;
	audioContext?: AudioContext;
	audioSource?: MediaStreamAudioSourceNode;
	analyser?: AnalyserNode;
	animationFrame?: number;
	cleanup?: Promise<void>;
	hostStop?: Promise<boolean>;
}

function frozenSnapshot(
	correlation: RealtimeCorrelation | null,
	state: RealtimeState,
	inputLevel: number,
): RealtimeMediaSnapshot {
	return Object.freeze({ correlation, state, inputLevel });
}

function canonicalCorrelation(correlation: RealtimeCorrelation): RealtimeCorrelation {
	return Object.freeze({
		sessionId: correlation.sessionId,
		correlationId: correlation.correlationId,
	});
}

function createRun(correlation: RealtimeCorrelation): Run {
	let resolveCancel!: (value: typeof CANCELLED) => void;
	const cancelled = new Promise<typeof CANCELLED>((resolve) => {
		resolveCancel = resolve;
	});
	return {
		correlation,
		cancelled,
		cancel: () => resolveCancel(CANCELLED),
		removers: [],
		timers: new Set(),
		stoppedTracks: new Set(),
		state: INITIAL_REALTIME_STATE,
		snapshot: frozenSnapshot(correlation, INITIAL_REALTIME_STATE, 0),
		cancelledNow: false,
		failed: false,
		offerSent: false,
		deviceLost: false,
	};
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

function permissionFailure(error: unknown): {
	readonly reason: "permission_denied" | "device_unavailable";
	readonly message: string;
} {
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError") {
		return { reason: "permission_denied", message: "Microphone permission was denied." };
	}
	return {
		reason: "device_unavailable",
		message: errorMessage(error, "No microphone is available."),
	};
}

function listen(run: Run, target: EventTarget, type: string, listener: EventListener): void {
	target.addEventListener(type, listener);
	run.removers.push(() => target.removeEventListener(type, listener));
}

function clearRunTimer(run: Run, timer: RunTimer): void {
	if (!run.timers.delete(timer)) return;
	globalThis.clearTimeout(timer);
}

async function bounded<T>(
	run: Run,
	operation: Promise<T>,
	durationMs: number,
	cancellable = true,
): Promise<T | typeof CANCELLED | typeof TIMED_OUT> {
	let timer: RunTimer | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = globalThis.setTimeout(() => {
			if (timer !== undefined) run.timers.delete(timer);
			resolve(TIMED_OUT);
		}, durationMs);
		run.timers.add(timer);
	});
	try {
		return await Promise.race(
			cancellable ? [operation, run.cancelled, timeout] : [operation, timeout],
		);
	} finally {
		if (timer !== undefined) clearRunTimer(run, timer);
	}
}

function stopTrack(run: Run, track: MediaStreamTrack): void {
	if (run.stoppedTracks.has(track)) return;
	run.stoppedTracks.add(track);
	track.stop();
}

function cancelRun(run: Run): void {
	if (run.cancelledNow) return;
	run.cancelledNow = true;
	run.cancel();
}

function removeListeners(run: Run): void {
	for (const remove of run.removers.splice(0)) remove();
}

function detachRemote(run: Run): void {
	if (!run.remoteElement) return;
	run.remoteElement.pause();
	run.remoteElement.srcObject = null;
	run.remoteElement.removeAttribute("src");
	run.remoteElement.load();
	run.remoteElement = undefined;
}

async function cleanupRun(run: Run): Promise<void> {
	if (run.cleanup) return run.cleanup;
	run.cleanup = (async () => {
		removeListeners(run);
		for (const timer of run.timers) clearRunTimer(run, timer);
		if (run.animationFrame !== undefined) {
			globalThis.cancelAnimationFrame(run.animationFrame);
			run.animationFrame = undefined;
		}
		run.audioSource?.disconnect();
		run.analyser?.disconnect();
		if (run.audioContext) await run.audioContext.close().catch(() => undefined);
		detachRemote(run);
		if (run.channel && run.channel.readyState !== "closed") run.channel.close();
		if (run.peer) {
			const replacements: Promise<void>[] = [];
			for (const sender of run.peer.getSenders()) {
				if (sender.track) stopTrack(run, sender.track);
				replacements.push(sender.replaceTrack(null).catch(() => undefined));
				try {
					run.peer.removeTrack(sender);
				} catch {
					// A closed peer may already have detached the sender.
				}
			}
			for (const receiver of run.peer.getReceivers()) stopTrack(run, receiver.track);
			await Promise.all(replacements);
			if (run.peer.connectionState !== "closed") run.peer.close();
		}
		for (const track of run.localStream?.getTracks() ?? []) stopTrack(run, track);
		for (const track of run.remoteStream?.getTracks() ?? []) stopTrack(run, track);
	})();
	return run.cleanup;
}

export function createRealtimeMediaSession(host: RealtimeHost): RealtimeMediaSession {
	let snapshot = frozenSnapshot(null, INITIAL_REALTIME_STATE, 0);
	let current: Run | null = null;
	let disposed = false;
	let lifecycleQueue = Promise.resolve();
	const listeners = new Set<RealtimeMediaListener>();
	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const pending = lifecycleQueue.then(operation);
		lifecycleQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};

	const publish = (run: Run, state: RealtimeState, inputLevel = run.snapshot.inputLevel): void => {
		if (current !== run) return;
		run.state = transitionRealtimeState(run.state, state);
		run.snapshot = frozenSnapshot(run.correlation, run.state, inputLevel);
		snapshot = run.snapshot;
		for (const listener of listeners) listener(snapshot);
	};

	const publishLevel = (run: Run, inputLevel: number): void => {
		if (current !== run || run.cancelledNow || run.failed) return;
		run.snapshot = frozenSnapshot(run.correlation, run.state, inputLevel);
		snapshot = run.snapshot;
		for (const listener of listeners) listener(snapshot);
	};

	const stopHost = async (run: Run): Promise<boolean> => {
		if (!run.offerSent) return true;
		if (!run.hostStop) {
			run.hostStop = (async () => {
				const pending = host.stop(run.correlation).then(
					(outcome) => outcome.outcome === "delivered",
					() => false,
				);
				const result = await bounded(run, pending, CODEX_REALTIME_STOP_MS, false);
				return result === true;
			})();
		}
		return run.hostStop;
	};

	const fail = async (
		run: Run,
		reason: RealtimeRecoverableErrorReason,
		message: string,
	): Promise<void> => {
		if (current !== run || run.cancelledNow || run.failed) return;
		run.failed = true;
		publish(run, { phase: "recoverable_error", reason, message }, 0);
		await cleanupRun(run);
		await stopHost(run);
	};

	const terminal = async (
		run: Run,
		reason: RealtimeTerminalErrorReason,
		message: string,
	): Promise<void> => {
		if (current !== run || run.cancelledNow || run.failed) return;
		run.failed = true;
		publish(run, { phase: "terminal_error", reason, message }, 0);
		await cleanupRun(run);
		await stopHost(run);
	};

	const stopRun = async (run: Run, dispose: boolean): Promise<void> => {
		if (run.state.phase === "closed") return;
		cancelRun(run);
		if (run.state.phase !== "stopping") {
			publish(
				run,
				{
					phase: "stopping",
					reason: dispose ? "dispose_requested" : "stop_requested",
				},
				0,
			);
		}
		await cleanupRun(run);
		const hostStopped = await stopHost(run);
		if (current !== run || run.state.phase !== "stopping") return;
		if (!hostStopped) {
			publish(
				run,
				{
					phase: "recoverable_error",
					reason: "stop_failed",
					message: "The realtime host did not confirm that it stopped.",
				},
				0,
			);
			return;
		}
		publish(run, { phase: "closed", reason: dispose ? "disposed" : "stopped" }, 0);
	};

	const attachRemote = (run: Run): void => {
		const receivers = run.peer?.getReceivers() ?? [];
		run.remoteStream = new MediaStream(receivers.map((receiver) => receiver.track));
		host.attachRemoteMedia({
			...run.correlation,
			attachTo: (element) => {
				if (current !== run || run.cancelledNow || run.failed || !run.remoteStream) return;
				detachRemote(run);
				run.remoteElement = element;
				try {
					element.srcObject = run.remoteStream;
					void element
						.play()
						.catch((error) =>
							fail(run, "autoplay_suspended", errorMessage(error, "Remote audio is suspended.")),
						);
				} catch (error) {
					void fail(run, "remote_media_failed", errorMessage(error, "Remote audio failed."));
				}
			},
		});
	};

	const setupMeter = async (run: Run): Promise<void> => {
		if (!run.localStream) throw new Error("The microphone stream is absent.");
		if (run.cancelledNow || run.failed) return;
		run.audioContext = new AudioContext();
		if (run.audioContext.state === "suspended") await run.audioContext.resume();
		if (run.cancelledNow || run.failed) return;
		if (run.audioContext.state === "suspended") {
			throw new DOMException("Audio playback remains suspended.", "NotAllowedError");
		}
		run.audioSource = run.audioContext.createMediaStreamSource(run.localStream);
		run.analyser = run.audioContext.createAnalyser();
		run.audioSource.connect(run.analyser);
		const samples = new Uint8Array(run.analyser.fftSize);
		const tick = (): void => {
			run.animationFrame = undefined;
			if (!run.analyser || run.cancelledNow || run.failed || current !== run) return;
			run.analyser.getByteTimeDomainData(samples);
			let sum = 0;
			for (const sample of samples) {
				const normalized = (sample - 128) / 128;
				sum += normalized * normalized;
			}
			publishLevel(run, Math.min(1, Math.sqrt(sum / samples.length)));
			if (run.cancelledNow || run.failed || current !== run) return;
			run.animationFrame = globalThis.requestAnimationFrame(tick);
		};
		run.animationFrame = globalThis.requestAnimationFrame(tick);
	};

	const startRun = async (correlation: RealtimeCorrelation): Promise<RealtimeMediaSnapshot> => {
		if (disposed) throw new Error("The realtime media session is disposed.");
		if (current && current.state.phase !== "closed") {
			const previous = current;
			await stopRun(previous, false);
			if ((previous.state as RealtimeState).phase !== "closed") {
				throw new Error("The previous realtime session did not stop cleanly.");
			}
		}
		if (disposed) throw new Error("The realtime media session is disposed.");

		const run = createRun(correlation);
		current = run;
		snapshot = run.snapshot;
		publish(run, { phase: "requesting_permission", reason: "start_requested" });

		const mediaDevices = globalThis.navigator?.mediaDevices;
		if (!mediaDevices?.getUserMedia) {
			await fail(run, "device_unavailable", "This browser cannot request a microphone.");
			return run.snapshot;
		}

		let microphone: Promise<MediaStream>;
		try {
			microphone = mediaDevices.getUserMedia({ audio: true, video: false });
		} catch (error) {
			const failure = permissionFailure(error);
			await fail(run, failure.reason, failure.message);
			return run.snapshot;
		}
		void microphone.then(
			(stream) => {
				if (run.cancelledNow) for (const track of stream.getTracks()) stopTrack(run, track);
				return undefined;
			},
			() => undefined,
		);
		let stream: MediaStream | typeof CANCELLED;
		try {
			stream = await Promise.race([microphone, run.cancelled]);
		} catch (error) {
			const failure = permissionFailure(error);
			await fail(run, failure.reason, failure.message);
			return run.snapshot;
		}
		if (stream === CANCELLED) return run.snapshot;
		run.localStream = stream;
		const localTrack = stream.getAudioTracks()[0];
		if (!localTrack) {
			await fail(run, "device_unavailable", "No audio track was captured.");
			return run.snapshot;
		}
		publish(run, { phase: "negotiating", reason: "permission_granted" });

		if (
			typeof globalThis.RTCPeerConnection !== "function" ||
			typeof globalThis.MediaStream !== "function" ||
			typeof globalThis.AudioContext !== "function" ||
			typeof globalThis.requestAnimationFrame !== "function"
		) {
			await terminal(run, "unsupported_browser", "This browser lacks realtime audio support.");
			return run.snapshot;
		}

		try {
			run.peer = new RTCPeerConnection();
			run.peer.addTransceiver(localTrack, { direction: "sendrecv", streams: [stream] });
			run.channel = run.peer.createDataChannel("realtime-events");

			const deviceLost = (): void => {
				run.deviceLost = true;
				if (run.state.phase !== "negotiating")
					void fail(run, "device_lost", "The microphone was removed.");
			};
			listen(run, localTrack, "ended", deviceLost);
			listen(run, mediaDevices, "devicechange", () => {
				if (localTrack.readyState === "ended") deviceLost();
			});
			listen(run, run.peer, "iceconnectionstatechange", () => {
				if (
					run.peer?.iceConnectionState === "disconnected" ||
					run.peer?.iceConnectionState === "failed"
				)
					void fail(run, "ice_disconnected", "The realtime audio connection was lost.");
			});
			listen(
				run,
				run.channel,
				"close",
				() => void fail(run, "data_channel_closed", "The realtime events channel closed."),
			);

			const offer = await bounded(run, run.peer.createOffer(), CODEX_REALTIME_START_MS);
			if (offer === CANCELLED) return run.snapshot;
			if (offer === TIMED_OUT) throw new Error("Creating the realtime offer timed out.");
			const localSet = await bounded(
				run,
				run.peer.setLocalDescription(offer),
				CODEX_REALTIME_START_MS,
			);
			if (localSet === CANCELLED) return run.snapshot;
			if (localSet === TIMED_OUT) throw new Error("Setting the realtime offer timed out.");
			publish(run, { phase: "negotiating", reason: "offer_created" });
			run.offerSent = true;
			const answer = await bounded(
				run,
				host.createOffer({
					...run.correlation,
					sdp: run.peer.localDescription?.sdp ?? offer.sdp ?? "",
				}),
				CODEX_REALTIME_START_MS,
			);
			if (answer === CANCELLED) return run.snapshot;
			if (answer === TIMED_OUT) throw new Error("The realtime answer timed out.");
			if (
				answer.sessionId !== run.correlation.sessionId ||
				answer.correlationId !== run.correlation.correlationId
			) {
				await terminal(run, "protocol_error", "The realtime answer did not match its offer.");
				return run.snapshot;
			}
			publish(run, { phase: "negotiating", reason: "answer_received" });
			const remoteSet = await bounded(
				run,
				run.peer.setRemoteDescription({ type: "answer", sdp: answer.sdp }),
				CODEX_REALTIME_START_MS,
			);
			if (remoteSet === CANCELLED) return run.snapshot;
			if (remoteSet === TIMED_OUT) throw new Error("Setting the realtime answer timed out.");
			try {
				attachRemote(run);
			} catch (error) {
				await fail(
					run,
					"remote_media_failed",
					errorMessage(error, "Remote audio could not be attached."),
				);
				return run.snapshot;
			}
			const metered = await bounded(run, setupMeter(run), CODEX_REALTIME_START_MS);
			if (metered === CANCELLED) return run.snapshot;
			if (metered === TIMED_OUT) throw new Error("Starting the audio meter timed out.");
			if (run.cancelledNow || run.failed) return run.snapshot;
			publish(run, { phase: "listening", reason: "negotiation_succeeded" });
			if (run.deviceLost) await fail(run, "device_lost", "The microphone was removed.");
		} catch (error) {
			if (run.cancelledNow || run.failed) return run.snapshot;
			if (error instanceof DOMException && error.name === "NotAllowedError") {
				await fail(run, "autoplay_suspended", error.message);
			} else {
				await fail(run, "sdp_failed", errorMessage(error, "Realtime negotiation failed."));
			}
		}
		return run.snapshot;
	};

	const start = (input: RealtimeCorrelation): Promise<RealtimeMediaSnapshot> => {
		const correlation = canonicalCorrelation(input);
		return enqueue(() => startRun(correlation));
	};

	return Object.freeze({
		getSnapshot: () => snapshot,
		subscribe: (listener: RealtimeMediaListener) => {
			if (disposed) return () => undefined;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start,
		stop: () => {
			if (current) cancelRun(current);
			return enqueue(async () => {
				if (current && current.state.phase !== "closed") await stopRun(current, false);
				return snapshot;
			});
		},
		dispose: () => {
			if (disposed) return Promise.resolve();
			disposed = true;
			if (current) cancelRun(current);
			return enqueue(async () => {
				if (current && current.state.phase !== "closed") {
					await stopRun(current, true);
				} else if (!current) {
					const stopping = transitionRealtimeState(INITIAL_REALTIME_STATE, {
						phase: "stopping",
						reason: "dispose_requested",
					});
					snapshot = frozenSnapshot(null, stopping, 0);
					for (const listener of listeners) listener(snapshot);
					const closed = transitionRealtimeState(stopping, {
						phase: "closed",
						reason: "disposed",
					});
					snapshot = frozenSnapshot(null, closed, 0);
					for (const listener of listeners) listener(snapshot);
				}
				listeners.clear();
			});
		},
	});
}
