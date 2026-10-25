// Giving the coordinator a workhorse outcome while voice is live (TASK-291): the work ended, or it
// waits on the user, which is not an end (TASK-316).
//
// Asked by voice to do something, the coordinator delegates and answers, and the work ends later.
// In a full-duplex voice session nothing appended as text is ever answered, so telling the voice
// model that the work ended would leave the user waiting until they asked again. The
// coordinator knows whether the work came from a voice request, so it is given the outcome: what
// it replies under [FINAL] the voice model says, and what it replies under [COMMENTARY] stays
// quiet. The outcome goes out the moment it arrives (TASK-321): Codex's turn/start adds it to the
// coordinator's running turn when there is one and starts a turn otherwise (Codex 0.160.0,
// `start_or_steer`), so nothing waits for the coordinator to be idle and nothing lands in its
// history without a turn to act on it. Which outcomes are given is the callback module's.
//
// An unattended voice session is nobody's to report to: nobody listens live, and whatever the
// coordinator answered would be spoken to nobody. While one holds the voice nothing is sent.

import type {
	CoordinatorCallbackTurnPort,
	WorkhorseNewsSituation,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { createWorkbenchTurnStartParams } from "#runtime/rules/host/bodies.ts";
import type {
	WorkbenchExecutionContext,
	WorkbenchContextCodec,
} from "#runtime/protocol/host/context.ts";
import { CodexSessionMutationError, type CodexSession } from "@archboard/codex-app-server/session";

/** What the port needs of the workbench around it. */
interface OutcomeReportParts {
	readonly session: Pick<CodexSession, "turnStart">;
	/**
	 * Mint the operation identity the turn runs under.
	 * @returns Its wire spelling, which is also the turn's client message id.
	 */
	readonly issue: () => string;
	/**
	 * The canonical context of the turn, captured against the voice-linked chat.
	 * @param operationId The minted operation identity.
	 * @returns The context.
	 */
	readonly contextCodec: WorkbenchContextCodec;
	readonly contextFor: (operationId: string) => WorkbenchExecutionContext;
	/**
	 * Whether nobody listens live to the voice now.
	 * @returns True while the live voice session is unattended.
	 */
	readonly unattended: () => boolean;
}

/** What every outcome message tells the coordinator to do with it, however it arrives. */
const OUTCOME_HANDLING =
	"If you are answering something else right now, finish that as well and put both in the same [FINAL] message. If this is not the user's to hear about now, keep it to a [COMMENTARY] line. Start no new work because of this news.";

/** What the coordinator is asked to do with each situation of workhorse news. */
const NEWS_ACTIONS: Readonly<Record<WorkhorseNewsSituation, string>> = Object.freeze({
	ended:
		"If the user is waiting on this work, whether they asked you for it by voice or typed it in the conversation, inspect the workhorse to read what was done, then say in your [FINAL] message what came of it, or what went wrong and what they can do next.",
	waiting:
		"If the user is waiting on this work, tell them in your [FINAL] message that it is paused until they answer the request on the workbench.",
	message:
		"If it asks the user something, or is news the user wants to hear, say it in your [FINAL] message. When the user answers a question the workhorse asked, steer the workhorse with the answer.",
});

/**
 * What the coordinator is told of workhorse news: one plain sentence and what to do with it. It
 * may start a turn or join one already answering something else, so it reads right either way. A
 * workhorse waiting on the user has not finished, and nothing the coordinator can inspect says
 * what it waits for (TASK-316). A message is the workhorse's own words (TASK-321).
 * @param news What happened, as one sentence with no identities in it.
 * @param situation Whether work ended, the workhorse waits on the user, or it sent a message.
 * @returns The message.
 */
function outcomeReportPrompt(news: string, situation: WorkhorseNewsSituation): string {
	return `Workhorse news: ${news} Nothing has been said to the user about it. ${NEWS_ACTIONS[situation]} ${OUTCOME_HANDLING}`;
}

/**
 * Build the port that gives the coordinator a workhorse outcome.
 * @param parts The session, the identity mint and the context.
 * @returns The port.
 */
function createOutcomeReportPort(parts: OutcomeReportParts): CoordinatorCallbackTurnPort {
	return {
		/**
		 * Give the coordinator the outcome at once, unless the voice session is unattended.
		 * @param request The coordinator thread and the outcome.
		 * @returns How the message settled, or unattended when nothing was sent.
		 */
		report: async (request) => {
			const { threadId, news, situation } = request;
			if (parts.unattended()) {
				return "unattended";
			}
			const operationId = parts.issue();
			const params = createWorkbenchTurnStartParams(
				{
					threadId,
					clientUserMessageId: operationId,
					prompt: outcomeReportPrompt(news, situation),
					context: parts.contextFor(operationId),
				},
				parts.contextCodec,
			);
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
