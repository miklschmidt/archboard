// One realtime media run: the record for a single start attempt, its bounded
// operations, and the cleanup that releases every browser resource it took.

import { INITIAL_REALTIME_STATE } from "@/ui/codex-realtime/lib/contract";
import type { RealtimeCorrelation, RealtimeState } from "@/ui/codex-realtime/lib/contract";
import type {
	RealtimeDataChannel,
	RealtimeEventSource,
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
	RealtimeSender,
	RealtimeTimer,
} from "@/ui/codex-realtime/lib/environment";
import type { VoiceOutputMeter } from "@/ui/voice-output-level";

/** The published view of the session: which run, and where it stands. */
interface RealtimeMediaSnapshot {
	readonly correlation: RealtimeCorrelation | null;
	readonly state: RealtimeState;
}

const CANCELLED = Symbol("cancelled");
const TIMED_OUT = Symbol("timed-out");
type Cancelled = typeof CANCELLED;
type TimedOut = typeof TIMED_OUT;

/** Everything one start attempt owns. Mutable by the session alone. */
interface Run {
	readonly correlation: RealtimeCorrelation;
	readonly cancelled: Promise<Cancelled>;
	readonly cancel: () => void;
	readonly removers: Array<() => void>;
	readonly timers: Set<RealtimeTimer>;
	readonly stoppedTracks: Set<RealtimeMediaTrack>;
	state: RealtimeState;
	snapshot: RealtimeMediaSnapshot;
	attachmentGeneration: number;
	cancelledNow: boolean;
	failed: boolean;
	offerSent: boolean;
	/** True once the output level source owns the meter's lifetime. */
	meterFollowed: boolean;
	startDeadline?: number;
	localStream?: RealtimeMediaStream;
	peer?: RealtimePeer;
	channel?: RealtimeDataChannel;
	remoteStream?: RealtimeMediaStream;
	remoteElement?: HTMLMediaElement | undefined;
	meter?: VoiceOutputMeter | undefined;
	cleanup?: Promise<void>;
	hostStop?: Promise<boolean>;
	failure?: Promise<void>;
}

/**
 * A frozen snapshot.
 * @param correlation The run's identity, or null before any run.
 * @param state The realtime state.
 * @returns The snapshot.
 */
function frozenSnapshot(
	correlation: RealtimeCorrelation | null,
	state: RealtimeState,
): RealtimeMediaSnapshot {
	return Object.freeze({ correlation, state });
}

/**
 * The caller's correlation copied into a frozen record, so a later mutation
 * of the caller's object cannot rename the run.
 * @param correlation The caller's correlation.
 * @returns A frozen copy.
 */
function canonicalCorrelation(correlation: RealtimeCorrelation): RealtimeCorrelation {
	return Object.freeze({
		sessionId: correlation.sessionId,
		correlationId: correlation.correlationId,
	});
}

/**
 * The resolver a run holds before its cancellation promise is constructed.
 */
function unresolved(): void {
	// The promise executor replaces this synchronously.
}

/**
 * A fresh run in the initial state.
 * @param correlation The run's identity.
 * @returns The run.
 */
function createRun(correlation: RealtimeCorrelation): Run {
	let resolveCancel: (value: Cancelled) => void = unresolved;
	const cancelled = new Promise<Cancelled>((resolve) => {
		resolveCancel = resolve;
	});
	return {
		correlation,
		cancelled,
		/**
		 * Resolves the cancellation promise.
		 */
		cancel: () => {
			resolveCancel(CANCELLED);
		},
		removers: [],
		timers: new Set(),
		stoppedTracks: new Set(),
		state: INITIAL_REALTIME_STATE,
		snapshot: frozenSnapshot(correlation, INITIAL_REALTIME_STATE),
		attachmentGeneration: 0,
		cancelledNow: false,
		failed: false,
		offerSent: false,
		meterFollowed: false,
	};
}

/**
 * Marks a run cancelled once and wakes whatever raced its cancellation.
 * @param run The run.
 */
function cancelRun(run: Run): void {
	if (run.cancelledNow) {
		return;
	}
	run.cancelledNow = true;
	run.cancel();
}

/**
 * The message of an error, or the fallback for anything else.
 * @param error What was thrown.
 * @param fallback The words to use otherwise.
 * @returns A message.
 */
function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message !== "" ? error.message : fallback;
}

/**
 * Whether a run is a stop the host never confirmed.
 * @param run The run.
 * @returns True for the stop_failed recoverable error.
 */
function isStopFailure(run: Run): boolean {
	return run.state.phase === "recoverable_error" && run.state.reason === "stop_failed";
}

/**
 * Registers a listener that is removed with the run.
 * @param run The run.
 * @param target The event source.
 * @param type The event name.
 * @param listener The listener.
 */
function listen(run: Run, target: RealtimeEventSource, type: string, listener: () => void): void {
	target.addEventListener(type, listener);
	run.removers.push(() => {
		target.removeEventListener(type, listener);
	});
}

/**
 * Clears one of the run's timers.
 * @param run The run.
 * @param timer The timer.
 */
function clearRunTimer(run: Run, timer: RealtimeTimer): void {
	if (!run.timers.delete(timer)) {
		return;
	}
	timer.cancel();
}

/**
 * A timeout promise registered with the run.
 * @param run The run.
 * @param environment The host clock.
 * @param durationMs How long to wait.
 * @returns The timeout and the timer that backs it.
 */
function runTimeout(
	run: Run,
	environment: RealtimeMediaEnvironment,
	durationMs: number,
): { readonly timeout: Promise<TimedOut>; readonly timer: RealtimeTimer } {
	let timer: RealtimeTimer | undefined;
	const timeout = new Promise<TimedOut>((resolve) => {
		timer = environment.schedule(() => {
			if (timer !== undefined) {
				run.timers.delete(timer);
			}
			resolve(TIMED_OUT);
		}, durationMs);
		run.timers.add(timer);
	});
	if (timer === undefined) {
		throw new Error("The host scheduler returned before scheduling.");
	}
	return { timeout, timer };
}

/**
 * Runs one operation against the run's cancellation and a deadline.
 * @param run The run.
 * @param environment The host clock.
 * @param operation The operation to bound.
 * @param durationMs The deadline; zero or less times out at once.
 * @param cancellable Whether cancellation wins the race.
 * @returns The result, or the cancelled or timed-out marker.
 */
async function bounded<T>(
	run: Run,
	environment: RealtimeMediaEnvironment,
	operation: () => Promise<T>,
	durationMs: number,
	cancellable = true,
): Promise<T | Cancelled | TimedOut> {
	if (cancellable && run.cancelledNow) {
		return CANCELLED;
	}
	if (durationMs <= 0) {
		return TIMED_OUT;
	}
	const { timeout, timer } = runTimeout(run, environment, durationMs);
	try {
		return await raceBounded(run, operation, timeout, cancellable);
	} finally {
		clearRunTimer(run, timer);
	}
}

/**
 * Races one operation against cancellation and a timeout.
 * @param run The run.
 * @param operation The operation.
 * @param timeout The timeout promise.
 * @param cancellable Whether cancellation wins the race.
 * @returns The result, or the cancelled or timed-out marker.
 */
async function raceBounded<T>(
	run: Run,
	operation: () => Promise<T>,
	timeout: Promise<TimedOut>,
	cancellable: boolean,
): Promise<T | Cancelled | TimedOut> {
	if (cancellable && run.cancelledNow) {
		return CANCELLED;
	}
	const pending = operation();
	const result = await Promise.race(
		cancellable ? [pending, run.cancelled, timeout] : [pending, timeout],
	);
	return cancellable && run.cancelledNow ? CANCELLED : result;
}

/**
 * Bounds an operation by the remainder of the run's one absolute start deadline.
 * @param run The run.
 * @param environment The host clock.
 * @param operation The operation.
 * @returns The result, or the cancelled or timed-out marker.
 */
function withinStartDeadline<T>(
	run: Run,
	environment: RealtimeMediaEnvironment,
	operation: () => Promise<T>,
): Promise<T | Cancelled | TimedOut> {
	const remaining = (run.startDeadline ?? environment.now()) - environment.now();
	return bounded(run, environment, operation, remaining);
}

/**
 * Stops a track once.
 * @param run The run.
 * @param track The track.
 */
function stopTrack(run: Run, track: RealtimeMediaTrack): void {
	if (run.stoppedTracks.has(track)) {
		return;
	}
	run.stoppedTracks.add(track);
	track.stop();
}

/**
 * Enables or disables every captured microphone track. `muted` is the only
 * phase whose capture is disabled, so this is called on every crossing of that
 * boundary and is the sole writer of the flag.
 * @param run The run.
 * @param enabled Whether the microphone should be heard.
 */
function setLocalCaptureEnabled(run: Run, enabled: boolean): void {
	for (const track of run.localStream?.getAudioTracks() ?? []) {
		track.enabled = enabled;
	}
}

/**
 * Detaches the remote element, invalidating any pending play() on it.
 * @param run The run.
 */
function detachRemote(run: Run): void {
	run.attachmentGeneration += 1;
	const element = run.remoteElement;
	if (element === undefined) {
		return;
	}
	element.pause();
	element.srcObject = null;
	element.removeAttribute("src");
	element.load();
	run.remoteElement = undefined;
}

/**
 * Releases one sender: its track, its replacement, and its registration.
 * @param run The run.
 * @param peer The peer.
 * @param sender The sender.
 */
function releaseSender(run: Run, peer: RealtimePeer, sender: RealtimeSender): void {
	if (sender.track !== null) {
		stopTrack(run, sender.track);
	}
	try {
		void sender.replaceTrack(null).catch(() => undefined);
	} catch {
		// A closed peer may reject replacement synchronously.
	}
	try {
		peer.removeTrack(sender);
	} catch {
		// A closed peer may already have detached the sender.
	}
}

/**
 * Releases the peer connection and every track it carried.
 * @param run The run.
 */
function releasePeer(run: Run): void {
	const peer = run.peer;
	if (peer === undefined) {
		return;
	}
	for (const sender of peer.getSenders()) {
		releaseSender(run, peer, sender);
	}
	for (const receiver of peer.getReceivers()) {
		stopTrack(run, receiver.track);
	}
	if (peer.connectionState !== "closed") {
		peer.close();
	}
}

/**
 * Releases the output meter: through the level source when it owns it.
 * @param run The run.
 * @param settleLevel Settles the level source, closing a followed meter.
 */
function releaseMeter(run: Run, settleLevel: () => void): void {
	settleLevel();
	if (run.meter !== undefined && !run.meterFollowed) {
		run.meter.close();
	}
	run.meter = undefined;
}

/**
 * Stops every captured and received track.
 * @param run The run.
 */
function stopStreams(run: Run): void {
	for (const stream of [run.localStream, run.remoteStream]) {
		for (const track of stream === undefined ? [] : stream.getTracks()) {
			stopTrack(run, track);
		}
	}
}

/**
 * Releases every browser resource the run took, exactly once and synchronously,
 * so nothing the run registered can fire after the release began.
 * @param run The run.
 * @param settleLevel Settles the output level source.
 * @returns Resolves once the release ran; shared by every caller.
 */
function cleanupRun(run: Run, settleLevel: () => void): Promise<void> {
	if (run.cleanup !== undefined) {
		return run.cleanup;
	}
	run.cleanup = Promise.resolve();
	for (const remove of run.removers.splice(0)) {
		remove();
	}
	for (const timer of run.timers) {
		clearRunTimer(run, timer);
	}
	releaseMeter(run, settleLevel);
	detachRemote(run);
	if (run.channel !== undefined && run.channel.readyState !== "closed") {
		run.channel.close();
	}
	releasePeer(run);
	stopStreams(run);
	return run.cleanup;
}

export {
	CANCELLED,
	TIMED_OUT,
	bounded,
	canonicalCorrelation,
	cancelRun,
	cleanupRun,
	createRun,
	detachRemote,
	errorMessage,
	frozenSnapshot,
	isStopFailure,
	listen,
	setLocalCaptureEnabled,
	stopTrack,
	withinStartDeadline,
	type Cancelled,
	type RealtimeMediaSnapshot,
	type Run,
	type TimedOut,
};
