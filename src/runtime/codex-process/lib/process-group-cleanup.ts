import { CODEX_TERM_GRACE_MS } from "@/shared/timing/timing";
import type { CodexProcessError } from "@/runtime/codex-process/lib/process";
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

function createProcessGroupCleanup(
	operations: CodexProcessGroupOperations,
	clock: ProcessGroupCleanupClock,
	diagnostics: ProcessGroupCleanupDiagnostics,
): ProcessGroupCleanup {
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
				if (settled) {
					clock.cancel(timer);
				}
			} catch (error) {
				if (!settled) {
					settled = true;
					reject(error);
				}
			}
		});
	};

	const waitForClosedOrAt = (
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
				if (settled) {
					clock.cancel(timer);
				}
			} catch (error) {
				if (!settled) {
					settled = true;
					reject(error);
				}
			}
		});
	};

	const settleBeforeDeadline = async (
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
