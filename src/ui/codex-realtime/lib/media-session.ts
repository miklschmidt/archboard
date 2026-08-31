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
	attachmentGeneration: number;
	cancelledNow: boolean;
	failed: boolean;
	offerSent: boolean;
	deviceLost: boolean;
	startDeadline?: number;
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
	failure?: Promise<void>;
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
		attachmentGeneration: 0,
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
	operation: () => Promise<T>,
	durationMs: number,
	cancellable = true,
): Promise<T | typeof CANCELLED | typeof TIMED_OUT> {
	if (cancellable && run.cancelledNow) return CANCELLED;
	if (durationMs <= 0) return TIMED_OUT;
	let timer: RunTimer | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = globalThis.setTimeout(() => {
			if (timer !== undefined) run.timers.delete(timer);
			resolve(TIMED_OUT);
		}, durationMs);
		run.timers.add(timer);
	});
	try {
		const pending = operation();
		const result = await Promise.race(
			cancellable ? [pending, run.cancelled, timeout] : [pending, timeout],
		);
		return cancellable && run.cancelledNow ? CANCELLED : result;
	} finally {
		if (timer !== undefined) clearRunTimer(run, timer);
	}
}

function monotonicNow(): number {
	return globalThis.performance.now();
}

function withinStartDeadline<T>(
	run: Run,
	operation: () => Promise<T>,
): Promise<T | typeof CANCELLED | typeof TIMED_OUT> {
	const remaining = (run.startDeadline ?? monotonicNow()) - monotonicNow();
	return bounded(run, operation, remaining);
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

function isStopFailure(run: Run): boolean {
	return run.state.phase === "recoverable_error" && run.state.reason === "stop_failed";
}

function removeListeners(run: Run): void {
	for (const remove of run.removers.splice(0)) remove();
}

function detachRemote(run: Run): void {
	run.attachmentGeneration += 1;
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
		if (run.audioContext) {
			try {
				void run.audioContext.close().catch(() => undefined);
			} catch {
				// Browser cleanup is best effort; local resource release must continue.
			}
		}
		detachRemote(run);
		if (run.channel && run.channel.readyState !== "closed") run.channel.close();
		if (run.peer) {
			for (const sender of run.peer.getSenders()) {
				if (sender.track) stopTrack(run, sender.track);
				try {
					void sender.replaceTrack(null).catch(() => undefined);
				} catch {
					// A closed peer may reject replacement synchronously.
				}
				try {
					run.peer.removeTrack(sender);
				} catch {
					// A closed peer may already have detached the sender.
				}
			}
			for (const receiver of run.peer.getReceivers()) stopTrack(run, receiver.track);
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
	let latestRun: Run | null = null;
	let publicOutcomeOwner: Run | null = null;
	let disposed = false;
	let disposalPromise: Promise<void> | null = null;
	let lifecycleQueue = Promise.resolve();
	const pendingRuns = new Set<Run>();
	const listeners = new Set<RealtimeMediaListener>();
	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const pending = lifecycleQueue.then(operation);
		lifecycleQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};
	const notify = (): void => {
		for (const listener of listeners) listener(snapshot);
	};
	const inactive = (run: Run): boolean => current !== run || run.cancelledNow || run.failed;
	const adoptRun = (run: Run): void => {
		if (snapshot === run.snapshot) return;
		snapshot = run.snapshot;
		notify();
	};
	const settleDormantRun = (run: Run): void => {
		if (run.state.phase === "closed") return;
		const stopping = transitionRealtimeState(run.state, {
			phase: "stopping",
			reason: "dispose_requested",
		});
		run.state = stopping;
		run.snapshot = frozenSnapshot(run.correlation, stopping, 0);
		const closed = transitionRealtimeState(stopping, {
			phase: "closed",
			reason: disposed ? "disposed" : "stopped",
		});
		run.state = closed;
		run.snapshot = frozenSnapshot(run.correlation, closed, 0);
		if ((publicOutcomeOwner ?? latestRun) === run) adoptRun(run);
	};

	const publish = (
		run: Run,
		state: RealtimeState,
		inputLevel = run.snapshot.inputLevel,
		visible = true,
	): void => {
		if (current !== run) return;
		run.state = transitionRealtimeState(run.state, state);
		run.snapshot = frozenSnapshot(run.correlation, run.state, inputLevel);
		if (!visible) return;
		snapshot = run.snapshot;
		notify();
	};

	const publishLevel = (run: Run, inputLevel: number): void => {
		if (current !== run || run.cancelledNow || run.failed) return;
		run.snapshot = frozenSnapshot(run.correlation, run.state, inputLevel);
		snapshot = run.snapshot;
		notify();
	};

	const stopHost = async (run: Run): Promise<boolean> => {
		if (!run.offerSent) return true;
		if (!run.hostStop) {
			run.hostStop = (async () => {
				const result = await bounded(
					run,
					() =>
						host.stop(run.correlation).then(
							(outcome) => outcome.outcome === "delivered",
							() => false,
						),
					CODEX_REALTIME_STOP_MS,
					false,
				);
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
		if (run.failure) return run.failure;
		if (current !== run || run.cancelledNow || run.failed) return;
		run.failure = (async () => {
			run.failed = true;
			publish(run, { phase: "recoverable_error", reason, message }, 0);
			cancelRun(run);
			await cleanupRun(run);
			await stopHost(run);
		})();
		return run.failure;
	};

	const terminal = async (
		run: Run,
		reason: RealtimeTerminalErrorReason,
		message: string,
	): Promise<void> => {
		if (run.failure) return run.failure;
		if (current !== run || run.cancelledNow || run.failed) return;
		run.failure = (async () => {
			run.failed = true;
			publish(run, { phase: "terminal_error", reason, message }, 0);
			cancelRun(run);
			await cleanupRun(run);
			await stopHost(run);
		})();
		return run.failure;
	};

	const stopRun = async (run: Run, dispose: boolean): Promise<void> => {
		if (run.state.phase === "closed") return;
		const visible = (publicOutcomeOwner ?? latestRun) === run;
		cancelRun(run);
		if (run.state.phase !== "stopping") {
			publish(
				run,
				{
					phase: "stopping",
					reason: dispose || disposed ? "dispose_requested" : "stop_requested",
				},
				0,
				visible,
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
				visible,
			);
			return;
		}
		publish(
			run,
			{ phase: "closed", reason: dispose || disposed ? "disposed" : "stopped" },
			0,
			visible,
		);
	};
	const settleCancelledRun = async (run: Run): Promise<RealtimeMediaSnapshot> => {
		if (run.failure) await run.failure;
		else if (current === run && run.state.phase !== "closed") await stopRun(run, disposed);
		return run.snapshot;
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
				const attachmentGeneration = run.attachmentGeneration;
				try {
					element.srcObject = run.remoteStream;
					void element.play().catch((error) => {
						if (
							current !== run ||
							run.remoteElement !== element ||
							run.attachmentGeneration !== attachmentGeneration ||
							run.cancelledNow ||
							run.failed
						)
							return;
						return fail(
							run,
							"autoplay_suspended",
							errorMessage(error, "Remote audio is suspended."),
						);
					});
				} catch (error) {
					void fail(run, "remote_media_failed", errorMessage(error, "Remote audio failed."));
				}
			},
		});
	};

	const setupMeter = async (run: Run): Promise<void> => {
		if (!run.localStream) throw new Error("The microphone stream is absent.");
		if (inactive(run)) return;
		run.audioContext = new AudioContext();
		if (inactive(run)) return;
		if (run.audioContext.state === "suspended") await run.audioContext.resume();
		if (inactive(run)) return;
		if (run.audioContext.state === "suspended") {
			throw new DOMException("Audio playback remains suspended.", "NotAllowedError");
		}
		run.audioSource = run.audioContext.createMediaStreamSource(run.localStream);
		if (inactive(run)) return;
		run.analyser = run.audioContext.createAnalyser();
		if (inactive(run)) return;
		run.audioSource.connect(run.analyser);
		if (inactive(run)) return;
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

	const startRun = async (run: Run): Promise<RealtimeMediaSnapshot> => {
		if (disposed) throw new Error("The realtime media session is disposed.");
		if (current && current.state.phase !== "closed") {
			const previous = current;
			await stopRun(previous, false);
			if ((previous.state as RealtimeState).phase !== "closed") {
				throw new Error("The previous realtime session did not stop cleanly.");
			}
		}
		if (disposed) throw new Error("The realtime media session is disposed.");

		publicOutcomeOwner = null;
		current = run;
		snapshot = run.snapshot;
		publish(run, { phase: "requesting_permission", reason: "start_requested" });
		if (inactive(run)) return settleCancelledRun(run);

		const mediaDevices = globalThis.navigator?.mediaDevices;
		if (!mediaDevices?.getUserMedia) {
			await fail(run, "device_unavailable", "This browser cannot request a microphone.");
			return run.snapshot;
		}

		let microphone: Promise<MediaStream>;
		try {
			if (inactive(run)) return settleCancelledRun(run);
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
		if (stream === CANCELLED || inactive(run)) return settleCancelledRun(run);
		run.localStream = stream;
		run.startDeadline = monotonicNow() + CODEX_REALTIME_START_MS;
		const localTrack = stream.getAudioTracks()[0];
		if (!localTrack) {
			await fail(run, "device_unavailable", "No audio track was captured.");
			return run.snapshot;
		}
		publish(run, { phase: "negotiating", reason: "permission_granted" });
		if (inactive(run)) return settleCancelledRun(run);

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
			if (inactive(run)) return settleCancelledRun(run);
			run.peer.addTransceiver(localTrack, { direction: "sendrecv", streams: [stream] });
			if (inactive(run)) return settleCancelledRun(run);
			run.channel = run.peer.createDataChannel("realtime-events");
			if (inactive(run)) return settleCancelledRun(run);

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

			const offer = await withinStartDeadline(run, () => run.peer!.createOffer());
			if (offer === CANCELLED) return settleCancelledRun(run);
			if (offer === TIMED_OUT) throw new Error("Creating the realtime offer timed out.");
			const localSet = await withinStartDeadline(run, () => run.peer!.setLocalDescription(offer));
			if (localSet === CANCELLED) return settleCancelledRun(run);
			if (localSet === TIMED_OUT) throw new Error("Setting the realtime offer timed out.");
			publish(run, { phase: "negotiating", reason: "offer_created" });
			if (inactive(run)) return settleCancelledRun(run);
			run.offerSent = true;
			const answer = await withinStartDeadline(run, () =>
				host.createOffer({
					...run.correlation,
					sdp: run.peer!.localDescription?.sdp ?? offer.sdp ?? "",
				}),
			);
			if (answer === CANCELLED) return settleCancelledRun(run);
			if (answer === TIMED_OUT) throw new Error("The realtime answer timed out.");
			if (
				answer.sessionId !== run.correlation.sessionId ||
				answer.correlationId !== run.correlation.correlationId
			) {
				await terminal(run, "protocol_error", "The realtime answer did not match its offer.");
				return run.snapshot;
			}
			publish(run, { phase: "negotiating", reason: "answer_received" });
			if (inactive(run)) return settleCancelledRun(run);
			const remoteSet = await withinStartDeadline(run, () =>
				run.peer!.setRemoteDescription({ type: "answer", sdp: answer.sdp }),
			);
			if (remoteSet === CANCELLED) return settleCancelledRun(run);
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
			if (inactive(run)) return settleCancelledRun(run);
			const metered = await withinStartDeadline(run, () => setupMeter(run));
			if (metered === CANCELLED) return settleCancelledRun(run);
			if (metered === TIMED_OUT) throw new Error("Starting the audio meter timed out.");
			if (run.cancelledNow || run.failed) return settleCancelledRun(run);
			publish(run, { phase: "listening", reason: "negotiation_succeeded" });
			if (inactive(run)) return settleCancelledRun(run);
			if (run.deviceLost) await fail(run, "device_lost", "The microphone was removed.");
		} catch (error) {
			if (run.cancelledNow || run.failed) return settleCancelledRun(run);
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
		if (disposed) return Promise.reject(new Error("The realtime media session is disposed."));
		const run = createRun(correlation);
		latestRun = run;
		pendingRuns.add(run);
		return enqueue(async () => {
			pendingRuns.delete(run);
			if (run.cancelledNow || disposed) {
				settleDormantRun(run);
				return run.snapshot;
			}
			return startRun(run);
		});
	};
	const stop = (): Promise<RealtimeMediaSnapshot> => {
		const active = current?.state.phase === "closed" ? null : current;
		const owner = active ?? latestRun;
		if (owner) publicOutcomeOwner = owner;
		for (const run of pendingRuns) cancelRun(run);
		if (current) cancelRun(current);
		return enqueue(async () => {
			if (active && active.state.phase !== "closed" && !isStopFailure(active))
				await stopRun(active, false);
			if (owner) adoptRun(owner);
			return owner?.snapshot ?? snapshot;
		});
	};
	const dispose = (): Promise<void> => {
		if (disposalPromise) return disposalPromise;
		const active = current?.state.phase === "closed" ? null : current;
		const owner = publicOutcomeOwner ?? active ?? latestRun;
		if (owner) publicOutcomeOwner = owner;
		disposed = true;
		for (const run of pendingRuns) cancelRun(run);
		if (current) cancelRun(current);
		disposalPromise = enqueue(async () => {
			if (active && active.state.phase !== "closed" && !isStopFailure(active))
				await stopRun(active, true);
			if (owner) {
				adoptRun(owner);
			} else {
				const stopping = transitionRealtimeState(INITIAL_REALTIME_STATE, {
					phase: "stopping",
					reason: "dispose_requested",
				});
				snapshot = frozenSnapshot(null, stopping, 0);
				notify();
				const closed = transitionRealtimeState(stopping, {
					phase: "closed",
					reason: "disposed",
				});
				snapshot = frozenSnapshot(null, closed, 0);
				notify();
			}
			listeners.clear();
		});
		return disposalPromise;
	};

	return Object.freeze({
		getSnapshot: () => snapshot,
		subscribe: (listener: RealtimeMediaListener) => {
			if (disposed) return () => undefined;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start,
		stop,
		dispose,
	});
}
