import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import type { QueuedSubmissionId } from "@/shared/codex-workbench-identity";
import {
	CodexWorkhorseQueueError,
	type QueueSnapshot,
} from "@/runtime/codex-workhorse-queue/lib/contract";
import { queueMutationTarget } from "@/runtime/codex-workhorse-queue/lib/input-validation";

/**
 * The submission a start names, refused unless it carries a client identity. Without that identity the turn the start produces could not be tied back to the submission that caused it.
 * @param queue - The current authoritative queue.
 * @param submissionId - The submission to start.
 * @returns The target submission.
 * @throws {CodexWorkhorseQueueError} When the target carries no client identity.
 */
function queueStartTarget(
	queue: QueueSnapshot,
	submissionId: QueuedSubmissionId,
): SessionQueuedSubmission {
	const target = queueMutationTarget(queue, submissionId, "start");
	if (typeof target.clientUserMessageId !== "string" || target.clientUserMessageId.length === 0) {
		throw new CodexWorkhorseQueueError(
			"invalid_result",
			"Queue start requires the target's exact client user message identity.",
			{ operation: "start" },
		);
	}
	return target;
}

/**
 * The client identity captured before the start, insisted on afterwards: losing it between validation and settlement means the turn cannot be correlated, which leaves the start's outcome unknown.
 * @param value - The identity captured from the target, or null when it was lost.
 * @returns The identity.
 * @throws {CodexWorkhorseQueueError} When the identity was lost.
 */
function queueStartClientUserMessageId(value: string | null): string {
	if (value !== null) {
		return value;
	}
	throw new CodexWorkhorseQueueError(
		"invalid_result",
		"Queue start lost its validated target identity.",
		{ operation: "start", outcome: "outcome_unknown" },
	);
}

export { queueStartTarget, queueStartClientUserMessageId };
