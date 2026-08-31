import type { SessionQueuedSubmission } from "../../codex-session/index.js";
import {
	CodexWorkhorseQueueError,
	type QueueSnapshot,
	type WorkhorseQueueMutation,
} from "./contract.js";

export function queueMutationTarget(
	queue: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
	operation: WorkhorseQueueMutation,
): SessionQueuedSubmission {
	const target = queue.find((submission) => submission.id === submissionId);
	if (target !== undefined) return target;
	throw new CodexWorkhorseQueueError(
		"invalid_input",
		`Queue ${operation} requires a submission from the current authoritative workhorse queue.`,
		{ operation },
	);
}

export function assertCompleteOrder(
	queue: QueueSnapshot,
	orderedSubmissionIds: readonly SessionQueuedSubmission["id"][],
): void {
	if (orderedSubmissionIds.length === 0 || orderedSubmissionIds.length !== queue.length)
		throw new CodexWorkhorseQueueError(
			"invalid_input",
			"Queue reorder must submit every current queue id exactly once.",
			{ operation: "reorder" },
		);
	const expected = new Set(queue.map((submission) => submission.id));
	const actual = new Set(orderedSubmissionIds);
	if (expected.size !== actual.size || orderedSubmissionIds.some((id) => !expected.has(id)))
		throw new CodexWorkhorseQueueError(
			"invalid_input",
			"Queue reorder must submit every current queue id exactly once.",
			{ operation: "reorder" },
		);
}
