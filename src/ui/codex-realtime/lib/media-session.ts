// The one private realtime media session: serialized starts, idempotent stop
// and dispose, a mute that touches only the captured track, and publications
// delivered in order to every subscriber whatever a subscriber does.

import { CODEX_REALTIME_STOP_MS } from "@/shared/timing/timing";
import { browserRealtimeMediaEnvironment } from "@/ui/codex-realtime/lib/browser-environment";
import { INITIAL_REALTIME_STATE, transitionRealtimeState } from "@/ui/codex-realtime/lib/contract";
import type {
	RealtimeCorrelation,
	RealtimeHost,
	RealtimeRecoverableErrorReason,
	RealtimeState,
	RealtimeTerminalErrorReason,
} from "@/ui/codex-realtime/lib/contract";
import { createPublisher } from "@/ui/codex-realtime/lib/publication";
import {
	bounded,
	canonicalCorrelation,
	cancelRun,
	cleanupRun,
	createRun,
	frozenSnapshot,
	isStopFailure,
	setLocalCaptureEnabled,
} from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import { negotiateRun } from "@/ui/codex-realtime/lib/start-sequence";
import type { RunController } from "@/ui/codex-realtime/lib/start-support";
import { createVoiceOutputLevelSource } from "@/ui/voice-output-level";

import {
	REALTIME_MEDIA_FEATURE,
	muteTarget,
	restartRefusal,
	stopConfirmed,
	stopFailedState,
	stoppable,
} from "@/ui/codex-realtime/lib/session-contract";
import type {
	FailureState,
	RealtimeMediaListener,
	RealtimeMediaSession,
	RealtimeMediaSessionOptions,
} from "@/ui/codex-realtime/lib/session-contract";

/**
 * Creates the session.
 * @param host The neutral realtime host.
 * @param options The environment, when not the browser's own.
 * @returns The session.
 */
function createRealtimeMediaSession(
	host: RealtimeHost,
	options: RealtimeMediaSessionOptions = {},
): RealtimeMediaSession {
	const environment = options.environment ?? browserRealtimeMediaEnvironment();
	const outputLevel = createVoiceOutputLevelSource(environment.frames);
	const publisher = createPublisher<RealtimeMediaSnapshot>();
	let snapshot = frozenSnapshot(null, INITIAL_REALTIME_STATE);
	let current: Run | null = null;
	let inFlightStart: Run | null = null;
	let latestRun: Run | null = null;
	let publicOutcomeOwner: Run | null = null;
	let disposed = false;
	let disposalPromise: Promise<void> | null = null;
	let lifecycleQueue: Promise<void> = Promise.resolve();
	const pendingRuns = new Set<Run>();

	/**
	 * Serializes one lifecycle operation after every earlier one.
	 * @param operation The operation.
	 * @returns The operation's result.
	 */
	const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
		const pending = lifecycleQueue.then(operation);
		lifecycleQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};

	/**
	 * Publishes the current public snapshot.
	 */
	const notify = (): void => {
		publisher.publish(snapshot);
	};

	/**
	 * Throws once the session is disposed.
	 */
	const assertOpen = (): void => {
		if (disposed) {
			throw new Error("The realtime media session is disposed.");
		}
	};

	/**
	 * Whether a run is no longer the live one.
	 * @param run The run.
	 * @returns True when superseded, cancelled or failed.
	 */
	const inactive = (run: Run): boolean => current !== run || run.cancelledNow || run.failed;

	/**
	 * Makes a run's snapshot the public one.
	 * @param run The run.
	 */
	const adoptRun = (run: Run): void => {
		if (snapshot === run.snapshot) {
			return;
		}
		snapshot = run.snapshot;
		notify();
	};

	/**
	 * Whether a run owns the public outcome right now.
	 * @param run The run.
	 * @returns True when its snapshot is the one to publish.
	 */
	const ownsOutcome = (run: Run): boolean => (publicOutcomeOwner ?? latestRun) === run;

	/**
	 * Moves a run that never activated straight to closed.
	 * @param run The run.
	 */
	const settleDormantRun = (run: Run): void => {
		if (run.state.phase === "closed") {
			return;
		}
		const stopping = transitionRealtimeState(run.state, {
			phase: "stopping",
			reason: "dispose_requested",
		});
		run.state = stopping;
		run.snapshot = frozenSnapshot(run.correlation, stopping);
		const closed = transitionRealtimeState(stopping, {
			phase: "closed",
			reason: disposed ? "disposed" : "stopped",
		});
		run.state = closed;
		run.snapshot = frozenSnapshot(run.correlation, closed);
		if (ownsOutcome(run)) {
			adoptRun(run);
		}
	};

	/**
	 * Moves a run's state, keeps the captured microphone in step with `muted`,
	 * and publishes when the run is visible.
	 * @param run The run.
	 * @param state The next state.
	 * @param visible Whether the public snapshot follows.
	 */
	const publish = (run: Run, state: RealtimeState, visible = true): void => {
		if (current !== run) {
			return;
		}
		const previous = run.state.phase;
		run.state = transitionRealtimeState(run.state, state);
		// Whatever moved the run, not only an unmute: the table admits muted ->
		// processing, so a run leaving muted by any route must not keep a silent
		// microphone under a UI that says the coordinator is listening.
		const nowMuted = run.state.phase === "muted";
		if (previous === "muted" || nowMuted) {
			setLocalCaptureEnabled(run, !nowMuted);
		}
		run.snapshot = frozenSnapshot(run.correlation, run.state);
		if (!visible) {
			return;
		}
		snapshot = run.snapshot;
		notify();
	};

	/**
	 * Settles the output level for a run leaving its live phases.
	 */
	const settleLevel = (): void => {
		outputLevel.settle();
	};

	/**
	 * Asks the host to stop a run whose offer it saw, once.
	 * @param run The run.
	 * @returns True when the host confirmed the exact stop.
	 */
	const stopHost = (run: Run): Promise<boolean> => {
		if (!run.offerSent) {
			return Promise.resolve(true);
		}
		run.hostStop ??= bounded(
			run,
			environment,
			() =>
				host.stop(run.correlation).then(
					(outcome) => stopConfirmed(run, outcome),
					() => false,
				),
			CODEX_REALTIME_STOP_MS,
			false,
		).then((result) => result === true);
		return run.hostStop;
	};

	/**
	 * Fails a run once: publish, cancel, release, tell the host.
	 * @param run The run.
	 * @param state The error state.
	 * @returns The shared failure completion.
	 */
	const failWith = (run: Run, state: FailureState): Promise<void> => {
		if (run.failure !== undefined) {
			return run.failure;
		}
		if (inactive(run)) {
			return Promise.resolve();
		}
		run.failed = true;
		publish(run, state);
		cancelRun(run);
		run.failure = cleanupRun(run, settleLevel).then(() => stopHost(run).then(() => undefined));
		return run.failure;
	};

	/**
	 * Publishes the end of a stop: closed, or stop_failed when unconfirmed.
	 * @param run The run.
	 * @param hostStopped Whether the host confirmed.
	 * @param disposing Whether this is a disposal.
	 * @param visible Whether the public snapshot follows.
	 */
	const publishStopOutcome = (
		run: Run,
		hostStopped: boolean,
		disposing: boolean,
		visible: boolean,
	): void => {
		if (current !== run || run.state.phase !== "stopping") {
			return;
		}
		const state: RealtimeState = hostStopped
			? { phase: "closed", reason: disposing ? "disposed" : "stopped" }
			: stopFailedState(run);
		publish(run, state, visible);
	};

	/**
	 * Closes a run: stopping, release, host stop, closed or stop_failed.
	 * @param run The run.
	 * @param dispose Whether this is a disposal.
	 */
	const stopRun = async (run: Run, dispose: boolean): Promise<void> => {
		if (run.state.phase === "closed") {
			return;
		}
		const visible = ownsOutcome(run);
		const disposing = dispose || disposed;
		cancelRun(run);
		if (run.state.phase !== "stopping") {
			publish(
				run,
				{ phase: "stopping", reason: disposing ? "dispose_requested" : "stop_requested" },
				visible,
			);
		}
		await cleanupRun(run, settleLevel);
		publishStopOutcome(run, await stopHost(run), dispose || disposed, visible);
	};

	/**
	 * Settles a run that was cancelled mid-start.
	 * @param run The run.
	 * @returns Its final snapshot.
	 */
	const settleCancelled = async (run: Run): Promise<RealtimeMediaSnapshot> => {
		if (run.failure !== undefined) {
			await run.failure;
		} else if (current === run && run.state.phase !== "closed") {
			await stopRun(run, disposed);
		}
		return run.snapshot;
	};

	const controller: RunController = {
		host,
		environment,
		outputLevel,
		inactive,
		/**
		 * Publishes visibly.
		 * @param run The run.
		 * @param state The next state.
		 */
		publish: (run, state) => {
			publish(run, state);
		},
		/**
		 * A recoverable failure.
		 * @param run The run.
		 * @param reason The reason.
		 * @param message The message.
		 * @returns The failure completion.
		 */
		fail: (run: Run, reason: RealtimeRecoverableErrorReason, message: string) =>
			failWith(run, { phase: "recoverable_error", reason, message }),
		/**
		 * A terminal failure.
		 * @param run The run.
		 * @param reason The reason.
		 * @param message The message.
		 * @returns The failure completion.
		 */
		terminal: (run: Run, reason: RealtimeTerminalErrorReason, message: string) =>
			failWith(run, { phase: "terminal_error", reason, message }),
		settleCancelled,
	};

	/**
	 * Whether a new run may activate after its predecessor was stopped.
	 * @param run The new run.
	 * @param previous The stopped predecessor.
	 * @returns "settled" when the new run was closed instead, else "proceed".
	 */
	const afterSupersession = (run: Run, previous: Run): "settled" | "proceed" => {
		if (run.cancelledNow || disposed) {
			settleDormantRun(run);
			return "settled";
		}
		if (previous.state.phase !== "closed") {
			adoptRun(previous);
			throw restartRefusal(run, previous);
		}
		return "proceed";
	};

	/**
	 * Stops the run a new start supersedes.
	 * @param run The new run.
	 * @returns "settled" when the new run cannot proceed, else "proceed".
	 */
	const supersedePrevious = async (run: Run): Promise<"settled" | "proceed"> => {
		const previous = current;
		if (previous === null || previous.state.phase === "closed") {
			return "proceed";
		}
		publicOutcomeOwner = previous;
		if (!isStopFailure(previous)) {
			await stopRun(previous, false);
		}
		return afterSupersession(run, previous);
	};

	/**
	 * Activates and negotiates one run.
	 * @param run The run.
	 * @returns Its snapshot once the start settled.
	 */
	const startRun = async (run: Run): Promise<RealtimeMediaSnapshot> => {
		assertOpen();
		if ((await supersedePrevious(run)) === "settled") {
			return run.snapshot;
		}
		assertOpen();
		publicOutcomeOwner = null;
		current = run;
		snapshot = run.snapshot;
		publish(run, { phase: "requesting_permission", reason: "start_requested" });
		if (inactive(run)) {
			return settleCancelled(run);
		}
		return negotiateRun(controller, run);
	};

	/**
	 * Runs one queued start.
	 * @param run The run.
	 * @returns Its snapshot once the start settled.
	 */
	const queuedStart = async (run: Run): Promise<RealtimeMediaSnapshot> => {
		pendingRuns.delete(run);
		if (run.cancelledNow || disposed) {
			settleDormantRun(run);
			return run.snapshot;
		}
		inFlightStart = run;
		try {
			return await startRun(run);
		} finally {
			if (inFlightStart === run) {
				inFlightStart = null;
			}
		}
	};

	/**
	 * Queues one start.
	 * @param input The caller's correlation.
	 * @returns The run's snapshot once the start settled.
	 */
	const start = (input: RealtimeCorrelation): Promise<RealtimeMediaSnapshot> => {
		const correlation = canonicalCorrelation(input);
		if (disposed) {
			return Promise.reject(new Error("The realtime media session is disposed."));
		}
		const run = createRun(correlation);
		latestRun = run;
		pendingRuns.add(run);
		return enqueue(() => queuedStart(run));
	};

	/**
	 * Cancels every run that has not closed.
	 */
	const cancelEverything = (): void => {
		for (const run of pendingRuns) {
			cancelRun(run);
		}
		if (inFlightStart !== null && inFlightStart !== current) {
			cancelRun(inFlightStart);
		}
		if (current !== null) {
			cancelRun(current);
		}
	};

	/**
	 * The run a stop or dispose acts on, or null when none is open.
	 * @returns The active run.
	 */
	const activeRun = (): Run | null => (current?.state.phase === "closed" ? null : current);

	/**
	 * Names the run whose outcome every concurrent stop or dispose shares.
	 * @param owner The candidate owner.
	 * @returns The owner.
	 */
	const claimOutcome = (owner: Run | null): Run | null => {
		if (owner !== null) {
			publicOutcomeOwner = owner;
		}
		return owner;
	};

	/**
	 * The current run when it can still take a mute toggle.
	 * @returns The run, or null.
	 */
	const toggleableRun = (): Run | null => {
		const run = current;
		return run === null || run.cancelledNow || run.failed ? null : run;
	};

	/**
	 * Toggles the captured microphone. The transition table admits `muted`
	 * from `listening` and `listening` from `muted` and from nowhere else, so
	 * the phase is the whole guard: any other phase leaves the published
	 * snapshot exactly as it is rather than raising a failure over a late press.
	 * @param muted Whether to mute.
	 * @returns The run's snapshot.
	 */
	const setMuted = (muted: boolean): Promise<RealtimeMediaSnapshot> => {
		const run = toggleableRun();
		if (run === null) {
			return Promise.resolve(snapshot);
		}
		if (run.state.phase === (muted ? "listening" : "muted")) {
			publish(run, muteTarget(muted));
		}
		return Promise.resolve(run.snapshot);
	};

	/**
	 * Stops the session; every concurrent caller shares the active run's outcome.
	 * @returns The owning run's snapshot.
	 */
	const stop = (): Promise<RealtimeMediaSnapshot> => {
		const active = activeRun();
		const owner = claimOutcome(active ?? publicOutcomeOwner ?? latestRun);
		cancelEverything();
		return enqueue(async () => {
			if (stoppable(active)) {
				await stopRun(active, false);
			}
			if (owner !== null) {
				adoptRun(owner);
			}
			return owner?.snapshot ?? snapshot;
		});
	};

	/**
	 * Publishes the disposal of a session that never ran.
	 */
	const publishBareDisposal = (): void => {
		const stopping = transitionRealtimeState(INITIAL_REALTIME_STATE, {
			phase: "stopping",
			reason: "dispose_requested",
		});
		snapshot = frozenSnapshot(null, stopping);
		notify();
		snapshot = frozenSnapshot(
			null,
			transitionRealtimeState(stopping, { phase: "closed", reason: "disposed" }),
		);
		notify();
	};

	/**
	 * Disposes the session once; every caller shares one completion.
	 * @returns Resolves when disposed.
	 */
	const dispose = (): Promise<void> => {
		if (disposalPromise !== null) {
			return disposalPromise;
		}
		const active = activeRun();
		const owner = claimOutcome(publicOutcomeOwner ?? active ?? latestRun);
		disposed = true;
		cancelEverything();
		disposalPromise = enqueue(async () => {
			if (stoppable(active)) {
				await stopRun(active, true);
			}
			if (owner === null) {
				publishBareDisposal();
			} else {
				adoptRun(owner);
			}
			outputLevel.dispose();
			publisher.close();
		});
		return disposalPromise;
	};

	return Object.freeze({
		/**
		 * The public snapshot.
		 * @returns The snapshot.
		 */
		getSnapshot: () => snapshot,
		subscribe: publisher.subscribe,
		start,
		/**
		 * Mutes the microphone.
		 * @returns The run's snapshot.
		 */
		mute: () => setMuted(true),
		/**
		 * Unmutes the microphone.
		 * @returns The run's snapshot.
		 */
		unmute: () => setMuted(false),
		stop,
		dispose,
		outputLevel,
	});
}

export {
	REALTIME_MEDIA_FEATURE,
	createRealtimeMediaSession,
	type RealtimeMediaListener,
	type RealtimeMediaSession,
	type RealtimeMediaSessionOptions,
	type RealtimeMediaSnapshot,
};
