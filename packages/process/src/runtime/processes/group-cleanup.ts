import { awaitFrozenGroup } from "#runtime/processes/observation.ts";
import { pollUntil, TimedOut } from "@archboard/timing";
import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupInspection,
	CodexProcessGroupOperations,
} from "#runtime/processes/codex-group.ts";

interface ProcessGroupCleanupDiagnostics {
	readonly failure: (message: string) => Error;
	readonly safeCauseMessage: (cause: unknown) => string;
}

interface ProcessGroupCleanupInput {
	readonly identity: CodexProcessGroupIdentity;
	/** The composed shutdown: when it aborts, cleanup kills at once and proves what is left. */
	readonly signal: AbortSignal;
}

interface ProcessGroupCleanup {
	readonly cleanup: (input: ProcessGroupCleanupInput) => Promise<void>;
}

/**
 * Wait out one step of cleanup. The step's own bound running out, or the composed shutdown's,
 * only moves cleanup on to its next step: neither proves anything about the group.
 * @param step The step.
 */
async function waitOut(step: Promise<unknown>): Promise<void> {
	try {
		await step;
	} catch (error) {
		if (!(error instanceof TimedOut)) throw error;
	}
}

/**
 * Own the TERM-then-KILL escalation of one Codex process group within the
 * composed shutdown, on the ambient timers, so tests drive it with fake timers.
 * @param operations - Group capture, inspection and signalling.
 * @param diagnostics - Failure construction with redaction.
 * @returns The cleanup.
 */
function createProcessGroupCleanup(
	operations: CodexProcessGroupOperations,
	diagnostics: ProcessGroupCleanupDiagnostics,
): ProcessGroupCleanup {
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
	 * @returns The terminal error the diagnostics build.
	 */
	const groupFailure = (status: CodexProcessGroupInspection, action: string): Error => {
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
	 * Decide whether KILL cleanup still needs to drain. Ownership was proved
	 * immediately before signalling, so a short unproven exit transition can
	 * be polled without sending another signal. Reuse still fails immediately.
	 * @param identity - The owned group.
	 * @param action - What cleanup is attempting, for the failure message.
	 * @returns False when quiescent, true while owned or transiently unproven.
	 */
	const needsKillDrain = (identity: CodexProcessGroupIdentity, action: string): boolean => {
		const status = inspect(identity);
		if (status === "quiescent") return false;
		if (status === "reused") throw groupFailure(status, action);
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
	 * Stop every member of the group so none can fork, waiting for two agreeing censuses.
	 * A freeze that fails or runs out of its own bound only leaves the group
	 * unfrozen: the KILL that follows is the cleanup, and it is sent either way, with the
	 * rest of the composed deadline left to prove the group gone.
	 * @param input - The group, its close promise and the composed deadline.
	 */
	const freezeGroup = async (input: ProcessGroupCleanupInput): Promise<void> => {
		try {
			await awaitFrozenGroup(
				{
					/**
					 * Take one census of the group.
					 * @returns The group's live members.
					 */
					census: () => operations.members(input.identity),
					/** Stop the whole group. */
					stop: () => {
						operations.signal(input.identity, "SIGSTOP");
					},
				},
				"codex.groupFreeze",
				input.signal,
			);
		} catch {
			// KILL still reaches every member the freeze did not.
		}
	};

	/**
	 * Send KILL to the frozen group. A KILL that cannot be sent leaves the group stopped, so
	 * it is resumed before the failure is reported.
	 * @param identity - The owned group.
	 */
	const killFrozenGroup = (identity: CodexProcessGroupIdentity): void => {
		try {
			sendSignal(identity, "SIGKILL");
		} catch (error) {
			try {
				operations.signal(identity, "SIGCONT");
			} catch {
				// The KILL failure is the one to report.
			}
			throw error;
		}
	};

	/**
	 * Signal the group with TERM, unless inspecting it first shows it has already gone. This
	 * is deliberately synchronous: a group that is already quiescent must cost no waiting.
	 * @param input - The group, its close promise and the composed deadline.
	 * @returns True when TERM was sent and the group must be given its grace period.
	 */
	const initiateTerm = (input: ProcessGroupCleanupInput): boolean => {
		if (!stillOwned(input.identity, "clean up the Codex process group")) return false;
		sendSignal(input.identity, "SIGTERM");
		return true;
	};

	/**
	 * Give a TERMed group its grace period, ending early once the group has gone.
	 * @param input - The group and the composed shutdown.
	 * @returns False when the group is already quiescent, so nothing needs escalating.
	 */
	const awaitTermGrace = async (input: ProcessGroupCleanupInput): Promise<boolean> => {
		let gone = false;
		await waitOut(
			pollUntil(
				"codex.termGrace",
				() => {
					gone = !stillOwned(input.identity, "finish TERM cleanup of the Codex process group");
					return gone ? true : undefined;
				},
				{ signal: input.signal },
			),
		);
		return !gone;
	};

	/**
	 * Escalate to KILL: freeze the group, signal it and re-inspect it at once, so a group that dies on the
	 * signal is finished without waiting at all.
	 * @param input - The group, its close promise and the composed deadline.
	 * @returns True when the group is still owned and must be drained.
	 */
	const escalateKill = async (input: ProcessGroupCleanupInput): Promise<boolean> => {
		if (!stillOwned(input.identity, "escalate the Codex process group")) return false;
		await freezeGroup(input);
		killFrozenGroup(input.identity);
		return needsKillDrain(input.identity, "verify KILL cleanup of the Codex process group");
	};

	/**
	 * Poll a killed group until it is quiescent, while the composed shutdown still allows it; one
	 * that has already ended leaves the group to the final inspection.
	 * @param input - The group and the composed shutdown.
	 * @returns False when the group is quiescent, so nothing remains to check.
	 */
	const drainKilledGroup = async (input: ProcessGroupCleanupInput): Promise<boolean> => {
		if (input.signal.aborted) return true;
		let drained = false;
		await waitOut(
			pollUntil(
				"codex.killDrain",
				() => {
					drained = !needsKillDrain(
						input.identity,
						"verify KILL cleanup of the Codex process group",
					);
					return drained ? true : undefined;
				},
				{ signal: input.signal },
			),
		);
		return !drained;
	};

	/**
	 * Run the TERM-then-KILL escalation until the group is quiescent or the
	 * deadline makes the failure terminal.
	 * @param input - The group, its close promise and the composed deadline.
	 */
	const cleanup = async (input: ProcessGroupCleanupInput): Promise<void> => {
		if (!initiateTerm(input)) return;
		if (!(await awaitTermGrace(input))) return;
		if (!(await escalateKill(input))) return;
		if (!(await drainKilledGroup(input))) return;
		const status = inspect(input.identity);
		if (status !== "quiescent") {
			throw groupFailure(status, "complete composed Codex shutdown");
		}
	};

	return Object.freeze({ cleanup });
}

export { createProcessGroupCleanup };
export type { ProcessGroupCleanup };
