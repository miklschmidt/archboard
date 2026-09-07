import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import {
	CodexWorkhorseQueueError,
	type QueueSnapshot,
	type WorkhorseQueueMutation,
} from "@/runtime/codex-workhorse-queue/lib/contract";

/**
 * The submission a mutation names, taken from the current authoritative queue. A mutation may only ever target a submission the queue actually holds, so a stale id is refused before any effect.
 * @param queue - The current authoritative queue.
 * @param submissionId - The submission the caller named.
 * @param operation - The mutation being made, for the refusal message.
 * @returns The target submission.
 * @throws {CodexWorkhorseQueueError} When the queue holds no such submission.
 */
function queueMutationTarget(
	queue: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
	operation: WorkhorseQueueMutation,
): SessionQueuedSubmission {
	const target = queue.find((submission) => submission.id === submissionId);
	if (target !== undefined) {
		return target;
	}
	throw new CodexWorkhorseQueueError(
		"invalid_input",
		`Queue ${operation} requires a submission from the current authoritative workhorse queue.`,
		{ operation },
	);
}

/**
 * Refuse a reorder that is not exactly the current queue's ids, each once. A partial order would silently drop or duplicate submissions.
 * @param queue - The current authoritative queue.
 * @param orderedSubmissionIds - The order the caller asked for.
 * @throws {CodexWorkhorseQueueError} When the order is not a permutation of the queue.
 */
function assertCompleteOrder(
	queue: QueueSnapshot,
	orderedSubmissionIds: readonly SessionQueuedSubmission["id"][],
): void {
	if (orderedSubmissionIds.length === 0 || orderedSubmissionIds.length !== queue.length) {
		throw new CodexWorkhorseQueueError(
			"invalid_input",
			"Queue reorder must submit every current queue id exactly once.",
			{ operation: "reorder" },
		);
	}
	const expected = new Set(queue.map((submission) => submission.id));
	const actual = new Set(orderedSubmissionIds);
	if (expected.size !== actual.size || orderedSubmissionIds.some((id) => !expected.has(id))) {
		throw new CodexWorkhorseQueueError(
			"invalid_input",
			"Queue reorder must submit every current queue id exactly once.",
			{ operation: "reorder" },
		);
	}
}

export { queueMutationTarget, assertCompleteOrder };
