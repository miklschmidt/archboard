// What every start stage shares: the session's controller port, the
// settled-or-value step shape, deadline-bounded steps, and the run's
// required resources.

import type {
	RealtimeHost,
	RealtimeRecoverableErrorReason,
	RealtimeState,
	RealtimeTerminalErrorReason,
} from "@/ui/codex-realtime/types/contract";
import type {
	RealtimeMediaEnvironment,
	RealtimeMediaStream,
	RealtimeMediaTrack,
	RealtimePeer,
} from "@/ui/codex-realtime/lib/environment";
import {
	CANCELLED,
	TIMED_OUT,
	errorMessage,
	withinStartDeadline,
} from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import type { VoiceOutputLevelSource } from "@/ui/voice-output-level";

/** What the start stages need from the session that owns the run. */
interface RunController {
	readonly host: RealtimeHost;
	readonly environment: RealtimeMediaEnvironment;
	readonly outputLevel: VoiceOutputLevelSource;
	/** True once the run is no longer the current, live one. */
	readonly inactive: (run: Run) => boolean;
	readonly publish: (run: Run, state: RealtimeState) => void;
	readonly fail: (
		run: Run,
		reason: RealtimeRecoverableErrorReason,
		message: string,
	) => Promise<void>;
	readonly terminal: (
		run: Run,
		reason: RealtimeTerminalErrorReason,
		message: string,
	) => Promise<void>;
	/** Settles a cancelled run and returns its final snapshot. */
	readonly settleCancelled: (run: Run) => Promise<RealtimeMediaSnapshot>;
}

/** A stage either settles the run with a final snapshot or lets the next stage run. */
type Stage = (controller: RunController, run: Run) => Promise<RealtimeMediaSnapshot | null>;

/** A sub-step either settles the run or yields a value for the next step. */
type Step<T> = { readonly settled: RealtimeMediaSnapshot } | { readonly value: T };

/** How a refused microphone request presents. */
interface PermissionFailure {
	readonly reason: "permission_denied" | "device_unavailable";
	readonly message: string;
}

/**
 * Classifies a getUserMedia rejection.
 * @param error What the browser threw.
 * @returns The recoverable reason and its message.
 */
function permissionFailure(error: unknown): PermissionFailure {
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError") {
		return { reason: "permission_denied", message: "Microphone permission was denied." };
	}
	return {
		reason: "device_unavailable",
		message: errorMessage(error, "No microphone is available."),
	};
}

/**
 * The run's peer, which every stage after the peer stage may assume.
 * @param run The run.
 * @returns The peer.
 */
function requirePeer(run: Run): RealtimePeer {
	if (run.peer === undefined) {
		throw new Error("The peer connection is absent.");
	}
	return run.peer;
}

/**
 * The run's captured microphone, which every stage after the permission may assume.
 * @param run The run.
 * @returns The stream and its first audio track.
 */
function requireMicrophone(run: Run): {
	readonly stream: RealtimeMediaStream;
	readonly track: RealtimeMediaTrack;
} {
	const stream = run.localStream;
	const track = stream?.getAudioTracks()[0];
	if (stream === undefined || track === undefined) {
		throw new Error("The microphone stream is absent.");
	}
	return { stream, track };
}

/**
 * Settles the run when it went inactive, else continues.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
function settledIfInactive(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot> | null {
	return controller.inactive(run) ? controller.settleCancelled(run) : null;
}

/**
 * Runs one operation under the start deadline.
 * @param controller The session.
 * @param run The run.
 * @param operation The operation.
 * @param timeoutMessage The error raised when the deadline passes.
 * @returns The value, or the settled snapshot when the run was cancelled.
 */
async function deadlineStep<T>(
	controller: RunController,
	run: Run,
	operation: () => Promise<T>,
	timeoutMessage: string,
): Promise<Step<T>> {
	const result = await withinStartDeadline(run, controller.environment, operation);
	if (result === CANCELLED) {
		return { settled: await controller.settleCancelled(run) };
	}
	if (result === TIMED_OUT) {
		throw new Error(timeoutMessage);
	}
	return { value: result };
}

export {
	deadlineStep,
	permissionFailure,
	requireMicrophone,
	requirePeer,
	settledIfInactive,
	type PermissionFailure,
	type RunController,
	type Stage,
	type Step,
};
