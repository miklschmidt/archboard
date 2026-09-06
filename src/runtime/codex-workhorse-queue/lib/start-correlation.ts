import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import type { QueuedSubmissionId } from "@/shared/codex-workbench-identity";
import {
	CodexWorkhorseQueueError,
	type QueueSnapshot,
} from "@/runtime/codex-workhorse-queue/lib/contract";
import { queueMutationTarget } from "@/runtime/codex-workhorse-queue/lib/input-validation";

/**
 *
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
 *
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
