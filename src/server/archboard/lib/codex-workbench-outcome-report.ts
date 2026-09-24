// Giving the coordinator a workhorse outcome while voice is live (TASK-291): the work ended, or it
// waits on the user, which is not an end (TASK-316).
//
// Asked by voice to do something, the coordinator delegates and answers, and the work ends later.
// In a full-duplex voice session nothing appended as text is ever answered, so telling the voice
// model that the work ended would leave the user waiting until they asked again. The
// coordinator knows whether the work came from a voice request, so it is given the outcome: what
// it replies under [FINAL] the voice model says, and what it replies under [COMMENTARY] stays
// quiet. The outcome goes out the moment it arrives (TASK-321): Codex's turn/start adds it to the
// coordinator's running turn when there is one and starts a turn otherwise (Codex 0.155.1,
// `start_or_steer`), so nothing waits for the coordinator to be idle and nothing lands in its
// history without a turn to act on it. Which outcomes are given is the callback module's.
//
// A recording's voice (TASK-304) is nobody's to report to: whatever the coordinator answered
// would be spoken into the video. While one holds the voice nothing is sent.

import type { CoordinatorCallbackTurnPort } from "@/runtime/codex-coordinator-callbacks";
import { createTurnStartParams, type ArchboardContext } from "@/runtime/codex-instructions";
import { CodexSessionMutationError, type CodexSession } from "@/runtime/codex-session";

/** What the port needs of the workbench around it. */
interface OutcomeReportParts {
	readonly session: Pick<CodexSession, "turnStart">;
	/**
	 * Mint the operation identity the turn runs under.
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
}

/** What every outcome message tells the coordinator to do with it, however it arrives. */
const OUTCOME_HANDLING =
	"If you are answering something else right now, finish that as well and put both in the same [FINAL] message. If this is not the user's to hear about now, keep it to a [COMMENTARY] line. Start no new work because of this news.";

/**
 * What the coordinator is told of workhorse news: one plain sentence and what to do with it. It
 * may start a turn or join one already answering something else, so it reads right either way. A
 * workhorse waiting on the user has not finished, and nothing the coordinator can inspect says
 * what it waits for (TASK-316).
 * @param news What happened, as one sentence with no identities in it.
 * @param waiting Whether the workhorse waits on the user rather than having finished.
 * @returns The message.
 */
function outcomeReportPrompt(news: string, waiting: boolean): string {
	const action = waiting
		? "If the user is waiting on this work, tell them in your [FINAL] message that it is paused until they answer the request on the workbench."
		: "If the user is waiting on this work, whether they asked you for it by voice or started it from the agent bar, inspect the workhorse to read what was done, then say in your [FINAL] message what came of it, or what went wrong and what they can do next.";
	return `Workhorse news: ${news} Nothing has been said to the user about it. ${action} ${OUTCOME_HANDLING}`;
}

/**
 * Build the port that gives the coordinator a workhorse outcome.
 * @param parts The session, the identity mint and the context.
 * @returns The port.
 */
function createOutcomeReportPort(parts: OutcomeReportParts): CoordinatorCallbackTurnPort {
	return {
		/**
		 * Give the coordinator the outcome at once, unless a recording holds the voice.
		 * @param request The coordinator thread and the outcome.
		 * @returns How the message settled, or recording when nothing was sent.
		 */
		report: async (request) => {
			const { threadId, news, waiting } = request;
			if (parts.recording()) {
				return "recording";
			}
			const operationId = parts.issue();
			const params = createTurnStartParams({
				threadId,
				clientUserMessageId: operationId,
				prompt: outcomeReportPrompt(news, waiting),
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
