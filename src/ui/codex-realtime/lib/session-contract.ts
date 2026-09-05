// The session contract and the pure helpers over one run that the session
// factory composes: refusal errors, host stop confirmation, the stop_failed
// state, the mute toggle target, and stoppability.

import type {
	RealtimeHost,
	RealtimeState,
	RealtimeUnsubscribe,
	RealtimeCorrelation,
} from "@/ui/codex-realtime/lib/contract";
import type { RealtimeMediaEnvironment } from "@/ui/codex-realtime/lib/environment";
import { isStopFailure } from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import type { VoiceOutputLevelSource } from "@/ui/voice-output-level";

const REALTIME_MEDIA_FEATURE = "webrtc-audio" as const;

/** Receives every published snapshot. */
type RealtimeMediaListener = (snapshot: RealtimeMediaSnapshot) => void;

/** The session. There is one per media owner and no second voice backend. */
interface RealtimeMediaSession {
	readonly getSnapshot: () => RealtimeMediaSnapshot;
	readonly subscribe: (listener: RealtimeMediaListener) => RealtimeUnsubscribe;
	readonly start: (correlation: RealtimeCorrelation) => Promise<RealtimeMediaSnapshot>;
	/**
	 * Silences the captured microphone without touching the negotiated
	 * connection: every local audio track is disabled and the run publishes
	 * `muted`. The host receives nothing. A run that is not `listening` is left
	 * exactly as it is.
	 */
	readonly mute: () => Promise<RealtimeMediaSnapshot>;
	/** The exact inverse of `mute`, from `muted` only. */
	readonly unmute: () => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
	readonly dispose: () => Promise<void>;
	/** The measured model output level, on its own channel. Never the microphone. */
	readonly outputLevel: VoiceOutputLevelSource;
}

/** Construction options; the browser environment is the default. */
interface RealtimeMediaSessionOptions {
	readonly environment?: RealtimeMediaEnvironment;
}

/** An error state a run can fail into. */
type FailureState = Extract<
	RealtimeState,
	{ readonly phase: "recoverable_error" | "terminal_error" }
>;

/**
 * The refusal raised when a start cannot supersede a run that never confirmed stop.
 * @param run The refused run.
 * @param previous The run still holding the session.
 * @returns The error.
 */
function restartRefusal(run: Run, previous: Run): Error {
	return new Error(
		`Realtime media start ${run.correlation.sessionId}/${run.correlation.correlationId} was refused because active ${previous.correlation.sessionId}/${previous.correlation.correlationId} did not confirm stop.`,
	);
}

/**
 * Whether a host stop outcome confirms exactly this run stopped.
 * @param run The run.
 * @param outcome What the host answered.
 * @returns True on an exact delivered confirmation.
 */
function stopConfirmed(run: Run, outcome: Awaited<ReturnType<RealtimeHost["stop"]>>): boolean {
	return (
		outcome.outcome === "delivered" &&
		outcome.sessionId === run.correlation.sessionId &&
		outcome.correlationId === run.correlation.correlationId
	);
}

/**
 * The stop_failed state for one run.
 * @param run The run.
 * @returns The state.
 */
function stopFailedState(run: Run): FailureState {
	return {
		phase: "recoverable_error",
		reason: "stop_failed",
		message: `The realtime host did not confirm that ${run.correlation.sessionId}/${run.correlation.correlationId} stopped.`,
	};
}

/**
 * The mute toggle's target state.
 * @param muted Whether muting.
 * @returns The state to publish.
 */
function muteTarget(muted: boolean): RealtimeState {
	return muted
		? { phase: "muted", reason: "mute_requested" }
		: { phase: "listening", reason: "unmute_requested" };
}

/**
 * Whether a run is still open: not closed, and not a stop the host refused.
 * @param run The run, or null.
 * @returns True when a stop should still act on it.
 */
function stoppable(run: Run | null): run is Run {
	return run !== null && run.state.phase !== "closed" && !isStopFailure(run);
}

export {
	REALTIME_MEDIA_FEATURE,
	muteTarget,
	restartRefusal,
	stopConfirmed,
	stopFailedState,
	stoppable,
	type FailureState,
	type RealtimeMediaListener,
	type RealtimeMediaSession,
	type RealtimeMediaSessionOptions,
};
