import { CODEX_TERM_GRACE_MS } from "@/shared/timing/timing";
import type { CodexProcessError } from "@/runtime/codex-process/lib/process-contract";
import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupInspection,
	CodexProcessGroupOperations,
} from "@/runtime/codex-process/lib/process-group";

type Timer = ReturnType<typeof setTimeout>;

interface ProcessGroupCleanupClock {
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => Timer;
	readonly cancel: (timer: Timer) => void;
}

interface ProcessGroupCleanupDiagnostics {
	readonly failure: (message: string) => CodexProcessError;
	readonly safeCauseMessage: (cause: unknown) => string;
}

interface ProcessGroupCleanupInput {
	readonly identity: CodexProcessGroupIdentity;
	readonly childClosed: Promise<unknown>;
	readonly deadlineAtMs: number;
}

interface ProcessGroupDeadline {
	readonly waitForClosedOrAt: (
		childClosed: Promise<unknown>,
		deadlineAtMs: number,
	) => Promise<"closed" | "time">;
	readonly settleBeforeDeadline: (
		work: readonly Promise<void>[],
		deadlineAtMs: number,
	) => Promise<PromiseSettledResult<void>[]>;
}

interface ProcessGroupCleanup extends ProcessGroupDeadline {
	readonly cleanup: (input: ProcessGroupCleanupInput) => Promise<void>;
}

/**
 * A one-way latch shared between a scheduled timer and the code that
 * scheduled it. It is an object rather than a local boolean because an
 * injected scheduler may fire the callback synchronously, before the timer
 * handle is even assigned, and the scheduling code must observe that.
 * @returns The latch with its settle and inspection operations.
 */
function createSettleLatch(): { readonly settle: () => boolean; readonly isSettled: () => boolean } {
	const latch = { settled: false };
	return Object.freeze({
		/**
		 * Flip the latch.
		 * @returns True the first time, false once already settled.
		 */
		settle: (): boolean => {
			if (latch.settled) return false;
			latch.settled = true;
			return true;
		},
		/**
		 * Read the latch.
		 * @returns True once settled.
		 */
		isSettled: (): boolean => latch.settled,
	});
}

/**
 * Schedule a callback, cancelling it immediately when the latch settled
 * synchronously during scheduling, and rejecting when scheduling itself fails.
 * @param clock - The injected clock.
 * @param latch - The latch shared with the callback.
 * @param callback - What to run when the delay elapses.
 * @param delayMs - The delay.
 * @param reject - Called with the scheduling failure when the latch is still open.
 * @returns The timer handle, or undefined when scheduling failed.
 */
function scheduleGuarded(
	clock: ProcessGroupCleanupClock,
	latch: ReturnType<typeof createSettleLatch>,
	callback: () => void,
	delayMs: number,
	reject: (error: unknown) => void,
): Timer | undefined {
	try {
		const timer = clock.schedule(callback, delayMs);
		if (latch.isSettled()) clock.cancel(timer);
		return timer;
	} catch (error) {
		if (latch.settle()) reject(error);
		return undefined;
	}
}

/**
 * Own the TERM-then-KILL escalation of one Codex process group against the
 * composed shutdown deadline, using only the injected clock and group
 * operations so tests can drive it deterministically.
 * @param operations - Group capture, inspection and signalling.
 * @param clock - Time source and timer scheduling.
 * @param diagnostics - Failure construction with redaction.
 * @returns The cleanup and deadline-waiting operations.
 */
function createProcessGroupCleanup(
	operations: CodexProcessGroupOperations,
	clock: ProcessGroupCleanupClock,
	diagnostics: ProcessGroupCleanupDiagnostics,
): ProcessGroupCleanup {
	/**
	 * Resolve once the clock reaches the given instant.
	 * @param deadlineAtMs - The instant to wait for.
	 * @returns A promise settled at or after the instant.
	 */
	const waitUntil = (deadlineAtMs: number): Promise<void> => {
		const delayMs = Math.max(0, deadlineAtMs - clock.now());
		if (delayMs === 0) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			const latch = createSettleLatch();
			let timer: Timer | undefined;
			/**
			 * Resolve once and release the timer.
			 */
			const finish = (): void => {
				if (!latch.settle()) return;
				if (timer !== undefined) clock.cancel(timer);
				resolve();
			};
			timer = scheduleGuarded(clock, latch, finish, delayMs, reject);
		});
	};

	/**
	 * Race the child's close against an instant.
	 * @param childClosed - Settles when the child closes.
	 * @param deadlineAtMs - The instant to stop waiting.
	 * @returns Which happened first.
	 */
	const waitForClosedOrAt = (
		childClosed: Promise<unknown>,
		deadlineAtMs: number,
	): Promise<"closed" | "time"> => {
		const delayMs = Math.max(0, deadlineAtMs - clock.now());
		if (delayMs === 0) {
			return Promise.resolve("time");
		}
		return new Promise<"closed" | "time">((resolve, reject) => {
			const latch = createSettleLatch();
			let timer: Timer | undefined;
			/**
			 * Resolve once with whichever event came first and release the timer.
			 * @param result - The winning event.
			 */
			const finish = (result: "closed" | "time"): void => {
				if (!latch.settle()) return;
				if (timer !== undefined) clock.cancel(timer);
				resolve(result);
			};
			void childClosed.then(() => {
				finish("closed");
				return null;
			});
			timer = scheduleGuarded(clock, latch, () => finish("time"), delayMs, reject);
		});
	};

	/**
	 * Await every shutdown task, failing the whole shutdown when the composed
	 * deadline expires first.
	 * @param work - The shutdown tasks.
	 * @param deadlineAtMs - The composed deadline.
	 * @returns The settled results when all finished in time.
	 */
	const settleBeforeDeadline = async (
		work: readonly Promise<void>[],
		deadlineAtMs: number,
	): Promise<PromiseSettledResult<void>[]> => {
		const all = Promise.allSettled(work);
		const latch = createSettleLatch();
		let timer: Timer | undefined;
		const deadline = new Promise<never>((_resolve, reject) => {
			/**
			 * Reject the race once the deadline passes.
			 */
			const fail = (): void => {
				if (!latch.settle()) return;
				reject(
					diagnostics.failure(
						"The composed Codex shutdown deadline expired. Recovery: inspect retained process ownership and retry stop.",
					),
				);
			};
			timer = scheduleGuarded(
				clock,
				latch,
				fail,
				Math.max(0, deadlineAtMs - clock.now()),
				(error) =>
					reject(
						diagnostics.failure(
							`Could not schedule the composed Codex shutdown deadline: ${diagnostics.safeCauseMessage(error)}.`,
						),
					),
			);
		});
		try {
			return await Promise.race([all, deadline]);
		} finally {
			latch.settle();
			if (timer !== undefined) {
				clock.cancel(timer);
			}
		}
	};

	/**
	 * Inspect the group, reading an inspection failure as unproven.
	 * @param identity - The owned group.
	 * @returns The inspection verdict.
	 */
	const inspect = (identity: CodexProcessGroupIdentity): CodexProcessGroupInspection => {
		try {
			return operations.inspect(identity);
		} catch {
			return "unproven";
		}
	};

	/**
	 * Build the terminal failure for a group that is no longer provably owned.
	 * @param status - The verdict that stopped cleanup.
	 * @param action - What cleanup was attempting.
	 * @returns The terminal process error.
	 */
	const groupFailure = (status: CodexProcessGroupInspection, action: string): CodexProcessError => {
		const detail =
			status === "reused" ? "its leader identity was reused" : "its ownership could not be proved";
		return diagnostics.failure(
			`Could not ${action}: the Codex process group is ${detail}. Recovery: keep the owner terminal and retry after inspecting the remaining process group.`,
		);
	};

	/**
	 * Inspect the group and decide whether cleanup may continue.
	 * @param identity - The owned group.
	 * @param action - What cleanup is attempting, for the failure message.
	 * @returns True when members remain and the group is still owned; false when quiescent.
	 */
	const stillOwned = (identity: CodexProcessGroupIdentity, action: string): boolean => {
		const status = inspect(identity);
		if (status === "quiescent") return false;
		if (status !== "owned") throw groupFailure(status, action);
		return true;
	};

	/**
	 * Deliver one signal to the group, converting a signalling failure into a
	 * terminal process error.
	 * @param identity - The owned group.
	 * @param signal - TERM or KILL.
	 */
	const sendSignal = (identity: CodexProcessGroupIdentity, signal: "SIGTERM" | "SIGKILL"): void => {
		try {
			operations.signal(identity, signal);
		} catch (error) {
			throw diagnostics.failure(
				`Could not send ${signal === "SIGTERM" ? "TERM" : "KILL"} to the Codex process group. Recovery: ${diagnostics.safeCauseMessage(error)}.`,
			);
		}
	};

	/**
	 * TERM the group and give it the grace period, but never past the deadline.
	 * @param input - The group, its close promise and the composed deadline.
	 * @returns True when members remain after the grace period.
	 */
	const termPhase = async (input: ProcessGroupCleanupInput): Promise<boolean> => {
		if (!stillOwned(input.identity, "clean up the Codex process group")) return false;
		sendSignal(input.identity, "SIGTERM");
		const termAtMs = Math.min(input.deadlineAtMs, clock.now() + CODEX_TERM_GRACE_MS);
		const firstEvent = await waitForClosedOrAt(input.childClosed, termAtMs);
		if (!stillOwned(input.identity, "finish TERM cleanup of the Codex process group")) return false;
		if (firstEvent === "closed" && clock.now() < termAtMs) {
			await waitUntil(termAtMs);
		}
		if (clock.now() < termAtMs) {
			await waitUntil(termAtMs);
		}
		return true;
	};

	/**
	 * KILL the group and wait for it to drain before the deadline.
	 * @param input - The group, its close promise and the composed deadline.
	 * @returns True when the group must be inspected one final time.
	 */
	const killPhase = async (input: ProcessGroupCleanupInput): Promise<boolean> => {
		if (!stillOwned(input.identity, "escalate the Codex process group")) return false;
		sendSignal(input.identity, "SIGKILL");
		if (!stillOwned(input.identity, "verify KILL cleanup of the Codex process group")) return false;
		if (clock.now() >= input.deadlineAtMs) return true;
		const killEvent = await waitForClosedOrAt(input.childClosed, input.deadlineAtMs);
		if (
			killEvent === "closed" &&
			!stillOwned(input.identity, "verify KILL cleanup of the Codex process group")
		)
			return false;
		if (clock.now() < input.deadlineAtMs) {
			await waitUntil(input.deadlineAtMs);
		}
		return true;
	};

	/**
	 * Run the TERM-then-KILL escalation until the group is quiescent or the
	 * deadline makes the failure terminal.
	 * @param input - The group, its close promise and the composed deadline.
	 */
	const cleanup = async (input: ProcessGroupCleanupInput): Promise<void> => {
		if (!(await termPhase(input))) return;
		if (!(await killPhase(input))) return;
		const status = inspect(input.identity);
		if (status !== "quiescent") {
			throw groupFailure(status, "complete composed Codex shutdown");
		}
	};

	return Object.freeze({ cleanup, settleBeforeDeadline, waitForClosedOrAt });
}

export { createProcessGroupCleanup };
export type {
	ProcessGroupCleanup,
	ProcessGroupCleanupClock,
	ProcessGroupCleanupDiagnostics,
	ProcessGroupCleanupInput,
};
