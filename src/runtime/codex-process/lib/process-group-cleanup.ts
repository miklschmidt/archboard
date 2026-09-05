import { CODEX_TERM_GRACE_MS } from "../../../shared/timing/timing.js";
import type { CodexProcessError } from "./process.js";
import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupInspection,
	CodexProcessGroupOperations,
} from "./process-group.js";

type Timer = ReturnType<typeof setTimeout>;

interface ProcessGroupCleanupClock {
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => Timer;
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Node timer handles are mutable upstream capabilities accepted only by cancellation.
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
		// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Promise is the existing child-close signal capability; this helper never mutates it.
		childClosed: Promise<unknown>,
		deadlineAtMs: number,
	) => Promise<"closed" | "time">;
	readonly settleBeforeDeadline: (
		// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Promise instances are observed, not mutated, and preserve the existing public shutdown contract.
		work: readonly Promise<void>[],
		deadlineAtMs: number,
	) => Promise<PromiseSettledResult<void>[]>;
}

interface ProcessGroupCleanup extends ProcessGroupDeadline {
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Every field is readonly; the branded process-group identity retains its upstream nominal shape.
	readonly cleanup: (input: ProcessGroupCleanupInput) => Promise<void>;
}

function createProcessGroupCleanup(
	operations: CodexProcessGroupOperations,
	clock: ProcessGroupCleanupClock,
	diagnostics: ProcessGroupCleanupDiagnostics,
): ProcessGroupCleanup {
	// oxlint-disable-next-line typescript/promise-function-async -- Adding an async wrapper changes the exact timer/microtask settlement ordering this helper preserves.
	const waitUntil = (deadlineAtMs: number): Promise<void> => {
		const delayMs = Math.max(0, deadlineAtMs - clock.now());
		if (delayMs === 0) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			let timer: Timer | undefined;
			let settled = false;
			const finish = (): void => {
				if (settled) {
					return;
				}
				settled = true;
				if (timer !== undefined) {
					clock.cancel(timer);
				}
				resolve();
			};
			try {
				timer = clock.schedule(finish, delayMs);
				// oxlint-disable-next-line typescript/no-unnecessary-condition -- Injected schedulers may invoke the callback synchronously before returning their timer.
				if (settled) {
					clock.cancel(timer);
				}
			} catch (error) {
				// oxlint-disable-next-line typescript/no-unnecessary-condition -- A synchronous injected scheduler can settle before throwing.
				if (!settled) {
					settled = true;
					// oxlint-disable-next-line typescript/prefer-promise-reject-errors -- The coordinator preserves the original context-specific sanitized wrapping of injected scheduler failures.
					reject(error);
				}
			}
		});
	};

	// oxlint-disable-next-line typescript/promise-function-async -- Adding an async wrapper changes the exact child-close/timer settlement ordering this helper preserves.
	const waitForClosedOrAt = (
		// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Promise is the existing child-close signal capability; this helper never mutates it.
		childClosed: Promise<unknown>,
		deadlineAtMs: number,
	): Promise<"closed" | "time"> => {
		const delayMs = Math.max(0, deadlineAtMs - clock.now());
		if (delayMs === 0) {
			return Promise.resolve("time");
		}
		return new Promise<"closed" | "time">((resolve, reject) => {
			let timer: Timer | undefined;
			let settled = false;
			const finish = (result: "closed" | "time"): void => {
				if (settled) {
					return;
				}
				settled = true;
				if (timer !== undefined) {
					clock.cancel(timer);
				}
				resolve(result);
			};
			void childClosed.then(() => {
				finish("closed");
				return null;
			});
			try {
				timer = clock.schedule(() => {
					finish("time");
				}, delayMs);
				// oxlint-disable-next-line typescript/no-unnecessary-condition -- Injected schedulers may invoke the callback synchronously before returning their timer.
				if (settled) {
					clock.cancel(timer);
				}
			} catch (error) {
				// oxlint-disable-next-line typescript/no-unnecessary-condition -- A synchronous injected scheduler can settle before throwing.
				if (!settled) {
					settled = true;
					// oxlint-disable-next-line typescript/prefer-promise-reject-errors -- The coordinator preserves the original context-specific sanitized wrapping of injected scheduler failures.
					reject(error);
				}
			}
		});
	};

	const settleBeforeDeadline = async (
		// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Promise instances are observed by allSettled and are never mutated.
		work: readonly Promise<void>[],
		deadlineAtMs: number,
	): Promise<PromiseSettledResult<void>[]> => {
		const all = Promise.allSettled(work);
		let timer: Timer | undefined;
		let settled = false;
		const deadline = new Promise<never>((_resolve, reject) => {
			const fail = (): void => {
				if (settled) {
					return;
				}
				settled = true;
				reject(
					diagnostics.failure(
						"The composed Codex shutdown deadline expired. Recovery: inspect retained process ownership and retry stop.",
					),
				);
			};
			try {
				timer = clock.schedule(fail, Math.max(0, deadlineAtMs - clock.now()));
				if (settled) {
					clock.cancel(timer);
				}
			} catch (error) {
				if (!settled) {
					settled = true;
					reject(
						diagnostics.failure(
							`Could not schedule the composed Codex shutdown deadline: ${diagnostics.safeCauseMessage(error)}.`,
						),
					);
				}
			}
		});
		try {
			return await Promise.race([all, deadline]);
		} finally {
			settled = true;
			if (timer !== undefined) {
				clock.cancel(timer);
			}
		}
	};

	const inspect = (identity: CodexProcessGroupIdentity): CodexProcessGroupInspection => {
		try {
			return operations.inspect(identity);
		} catch {
			return "unproven";
		}
	};

	const groupFailure = (status: CodexProcessGroupInspection, action: string): CodexProcessError => {
		const detail =
			status === "reused" ? "its leader identity was reused" : "its ownership could not be proved";
		return diagnostics.failure(
			`Could not ${action}: the Codex process group is ${detail}. Recovery: keep the owner terminal and retry after inspecting the remaining process group.`,
		);
	};

	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Every input field is readonly; the branded identity retains its upstream nominal shape.
	const cleanup = async (input: ProcessGroupCleanupInput): Promise<void> => {
		let status = inspect(input.identity);
		if (status === "quiescent") {
			return;
		}
		if (status !== "owned") {
			throw groupFailure(status, "clean up the Codex process group");
		}
		try {
			operations.signal(input.identity, "SIGTERM");
		} catch (error) {
			throw diagnostics.failure(
				`Could not send TERM to the Codex process group. Recovery: ${diagnostics.safeCauseMessage(error)}.`,
			);
		}

		const termAtMs = Math.min(input.deadlineAtMs, clock.now() + CODEX_TERM_GRACE_MS);
		const firstEvent = await waitForClosedOrAt(input.childClosed, termAtMs);
		status = inspect(input.identity);
		if (status === "quiescent") {
			return;
		}
		if (status !== "owned") {
			throw groupFailure(status, "finish TERM cleanup of the Codex process group");
		}
		if (firstEvent === "closed" && clock.now() < termAtMs) {
			await waitUntil(termAtMs);
		}
		if (clock.now() < termAtMs) {
			await waitUntil(termAtMs);
		}

		status = inspect(input.identity);
		if (status === "quiescent") {
			return;
		}
		if (status !== "owned") {
			throw groupFailure(status, "escalate the Codex process group");
		}
		try {
			operations.signal(input.identity, "SIGKILL");
		} catch (error) {
			throw diagnostics.failure(
				`Could not send KILL to the Codex process group. Recovery: ${diagnostics.safeCauseMessage(error)}.`,
			);
		}
		status = inspect(input.identity);
		if (status === "quiescent") {
			return;
		}
		if (status !== "owned") {
			throw groupFailure(status, "verify KILL cleanup of the Codex process group");
		}
		if (clock.now() < input.deadlineAtMs) {
			const killEvent = await waitForClosedOrAt(input.childClosed, input.deadlineAtMs);
			if (killEvent === "closed") {
				status = inspect(input.identity);
				if (status === "quiescent") {
					return;
				}
				if (status !== "owned") {
					throw groupFailure(status, "verify KILL cleanup of the Codex process group");
				}
			}
			if (clock.now() < input.deadlineAtMs) {
				await waitUntil(input.deadlineAtMs);
			}
		}
		status = inspect(input.identity);
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
