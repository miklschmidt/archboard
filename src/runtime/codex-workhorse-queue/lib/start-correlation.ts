import type { SessionQueuedSubmission } from "../../codex-session/index.js";
import type { QueuedSubmissionId } from "../../../shared/codex-workbench-identity/index.js";
import { CodexWorkhorseQueueError, type QueueSnapshot } from "./contract.js";
import { queueMutationTarget } from "./input-validation.js";

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
