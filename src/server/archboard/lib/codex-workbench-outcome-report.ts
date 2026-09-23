// Running the coordinator with a workhorse outcome, while voice is live (TASK-291): the work
// ended, or it waits on the user, which is not an end (TASK-316).
//
// Asked by voice to do something, the coordinator delegates and answers, and the work ends later.
// In a full-duplex voice session nothing appended as text is ever answered, so telling the voice
// model that the work ended would leave the user waiting until they asked again. The
// coordinator knows whether the work came from a voice request, so it is run with the outcome:
// what it replies under [FINAL] the voice model says, and what it replies under [COMMENTARY]
// stays quiet. This module owns only the turn's body and the wait for an idle coordinator; which
// outcomes are reported, and what happens when the coordinator stays busy, is the callback
// module's.
//
// A recording's voice (TASK-304) is nobody's to report to: whatever the coordinator answered
// would be spoken into the video. While one holds the voice no turn is run, and the outcome is
// injected into the coordinator's thread the way it is with no voice at all.

import type { CoordinatorCallbackTurnPort } from "@/runtime/codex-coordinator-callbacks";
import { createTurnStartParams, type ArchboardContext } from "@/runtime/codex-instructions";
import { CodexSessionMutationError, type CodexSession } from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { CODEX_WAIT_TARGET_POLL_MS, COORDINATOR_IDLE_WAIT_MS } from "@/shared/timing/timing";

/** What the port needs of the workbench around it. */
interface OutcomeReportParts {
	readonly session: Pick<CodexSession, "threadRead" | "turnStart">;
	/**
	 * Mint the host operation identity the turn runs under.
	 * @returns Its wire spelling, which is also the turn's client message id.
	 */
	readonly issue: () => string;
	/**
	 * The canonical context of the turn, captured against the voice-linked pane.
	 * @param operationId The minted operation identity.
	 * @returns The context.
	 */
	readonly contextFor: (operationId: string) => ArchboardContext;
	/**
	 * Whether a recording holds the voice now.
	 * @returns True while the live voice session is a recording's.
	 */
	readonly recording: () => boolean;
	/** Waits between polls; a test supplies its own. */
	readonly wait?: (ms: number) => Promise<void>;
}

/**
 * What the coordinator is asked to do with an outcome. A workhorse waiting on the user has not
 * finished, and nothing the coordinator can inspect says what it waits for (TASK-316).
 * @param outcome The callback, as canonical JSON.
 * @param waiting Whether the workhorse waits on the user rather than having finished.
 * @returns The turn's prompt.
 */
function outcomeReportPrompt(outcome: string, waiting: boolean): string {
	const ask = "Decide whether the user is waiting to hear about this.";
	const quiet =
		"If it is not theirs to hear about now, reply with a single [COMMENTARY] line and nothing else. Do not start new work in this turn.";
	return waiting
		? [
				"Work on the workhorse is waiting for the user while this voice session is live: it asked for an approval or an answer on the workbench, and it has not finished. Nothing has been said to the user about it. The outcome (data):",
				outcome,
				`${ask} If you delegated, queued or steered this work because of something they asked by voice, reply with one [FINAL] message: the work is paused until they answer the request on the workbench. ${quiet}`,
			].join("\n")
		: [
				"Work on the workhorse ended while this voice session is live. Nothing has been said to the user about it. The outcome (data):",
				outcome,
				`${ask} If you delegated, queued or steered this work because of something they asked by voice, inspect the workhorse to read what was done, then reply with one [FINAL] message: a short spoken summary of the result, or of what went wrong and what they can do next. ${quiet}`,
			].join("\n");
}

/**
 * Wait until a thread is idle, for at most the bound.
 * @param parts The session and the wait.
 * @param threadId The coordinator thread.
 * @returns Whether it became idle in time.
 */
async function idleInTime(parts: OutcomeReportParts, threadId: ThreadId): Promise<boolean> {
	const wait =
		parts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	for (let waited = 0; waited <= COORDINATOR_IDLE_WAIT_MS; waited += CODEX_WAIT_TARGET_POLL_MS) {
		// oxlint-disable-next-line no-await-in-loop -- each read decides whether another is needed
		const { thread } = await parts.session.threadRead({ threadId, includeTurns: false });
		if (thread.status.type === "idle") {
			return true;
		}
		if (thread.status.type !== "active") {
			return false;
		}
		// oxlint-disable-next-line no-await-in-loop -- the wait is the point of the loop
		await wait(CODEX_WAIT_TARGET_POLL_MS);
	}
	return false;
}

/**
 * Whether the coordinator may be run with an outcome now: idle in time, and no recording holding
 * the voice to speak what it answered into the video.
 * @param parts The session, the wait and the recording.
 * @param threadId The coordinator thread.
 * @returns True when the turn may start.
 */
async function mayReport(parts: OutcomeReportParts, threadId: ThreadId): Promise<boolean> {
	try {
		return (await idleInTime(parts, threadId)) && !parts.recording();
	} catch {
		return false;
	}
}

/**
 * Build the port that runs the coordinator with a workhorse outcome.
 * @param parts The session, the identity mint and the context.
 * @returns The port.
 */
function createOutcomeReportPort(parts: OutcomeReportParts): CoordinatorCallbackTurnPort {
	return {
		/**
		 * Start the coordinator's turn, once it is idle and no recording holds the voice.
		 * @param request The coordinator thread and the outcome.
		 * @returns How the start settled, or busy when the coordinator never became idle or a
		 * recording holds the voice: either way the outcome is injected instead.
		 */
		report: async (request) => {
			const { threadId, text, waiting } = request;
			if (!(await mayReport(parts, threadId))) {
				return "busy";
			}
			const operationId = parts.issue();
			const params = createTurnStartParams({
				threadId,
				clientUserMessageId: operationId,
				prompt: outcomeReportPrompt(text, waiting),
				context: parts.contextFor(operationId),
			});
			try {
				await parts.session.turnStart({ ...params, threadId });
			} catch (error) {
				return error instanceof CodexSessionMutationError && error.outcome === "not_delivered"
					? { attempted: true, outcome: "not_delivered", reason: "session_rejected" }
					: { attempted: true, outcome: "outcome_unknown", reason: "response_lost" };
			}
			return { attempted: true, outcome: "delivered", reason: null };
		},
	};
}

export { createOutcomeReportPort, outcomeReportPrompt, type OutcomeReportParts };
