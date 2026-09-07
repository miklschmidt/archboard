import { QueuedSubmissionSchema } from "@/runtime/codex-protocol";
import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import type {
	QueueSnapshot,
	WorkhorseQueueBinding,
} from "@/runtime/codex-workhorse-queue/lib/contract";

/**
 * Whether two bindings name the same coordinator and workhorse on the same child epoch.
 * @param left - One binding.
 * @param right - The other binding.
 * @returns True when every field matches.
 */
function sameBinding(left: WorkhorseQueueBinding, right: WorkhorseQueueBinding): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.coordinatorThreadId === right.coordinatorThreadId &&
		left.workhorseThreadId === right.workhorseThreadId
	);
}

/**
 * Whether two queued submissions are the same submission carrying the same input.
 * @param left - One submission.
 * @param right - The other submission, or undefined where the queue has no entry at all.
 * @returns True when identity, client identity and input all match.
 */
function sameSubmission(
	left: SessionQueuedSubmission,
	right: SessionQueuedSubmission | undefined,
): boolean {
	if (right === undefined) {
		return false;
	}
	const checks = [
		left.id === right.id,
		left.clientUserMessageId === right.clientUserMessageId,
		JSON.stringify(left.input) === JSON.stringify(right.input),
	];
	return checks.every((matched) => matched);
}

/**
 * Whether two queues hold the same submissions in the same order.
 * @param left - One queue.
 * @param right - The other queue.
 * @returns True when both agree submission for submission.
 */
function sameQueue(left: QueueSnapshot, right: QueueSnapshot): boolean {
	return (
		left.length === right.length &&
		left.every((submission, index) => {
			const candidate = right[index];
			return candidate !== undefined && sameSubmission(submission, candidate);
		})
	);
}

/**
 * The queue with one submission removed, which is what a delivered delete or start should leave behind.
 * @param queue - The queue before the mutation.
 * @param submissionId - The submission that should be gone.
 * @returns The expected queue.
 */
function queueWithout(
	queue: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
): QueueSnapshot {
	return queue.filter((submission) => submission.id !== submissionId);
}

/**
 * Whether a value is a plain object whose fields can be read by key.
 * @param value - Any value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether a value is a queued submission by the protocol's own schema, rather than by shape alone.
 * @param value - The candidate submission.
 * @returns True when the schema accepts it.
 */
function isSessionQueuedSubmission(value: unknown): value is SessionQueuedSubmission {
	return QueuedSubmissionSchema.safeParse(value).success;
}

/**
 * The queued submission a mutation response carried, if it carried a valid one.
 * @param value - The raw response.
 * @returns The submission, or null when the response carries none.
 */
function responseSubmission(value: unknown): SessionQueuedSubmission | null {
	if (!isRecord(value) || !isRecord(value["queuedSubmission"])) {
		return null;
	}
	const candidate = value["queuedSubmission"];
	return isSessionQueuedSubmission(candidate) ? candidate : null;
}

/**
 * Freeze a copy of the submissions as the queue snapshot callers see.
 * @param data - The submissions in queue order.
 * @returns The frozen snapshot.
 */
function snapshot(data: readonly SessionQueuedSubmission[]): QueueSnapshot {
	return Object.freeze(data.slice());
}

/**
 * Whether the submission a queue add returned is the one Archboard asked for: our exact client
 * identity, our exact input, and an identity the queue did not already hold.
 * @param added - The submission the response carried, or null when it carried none.
 * @param before - The queue as it was before the add.
 * @param after - The queue as the app-server reports it now.
 * @param input - The single input item that was queued.
 * @param clientUserMessageId - The client identity the add was made under.
 * @returns True when the returned submission is ours.
 */
function isOurAddedSubmission(
	added: SessionQueuedSubmission | null,
	before: QueueSnapshot,
	after: QueueSnapshot,
	input: SessionQueuedSubmission["input"][number],
	clientUserMessageId: string,
): added is SessionQueuedSubmission {
	if (added === null) {
		return false;
	}
	const checks = [
		added.id.length > 0,
		added.clientUserMessageId === clientUserMessageId,
		JSON.stringify(added.input) === JSON.stringify([input]),
		!before.some((submission) => submission.id === added.id),
		after.length === before.length + 1,
	];
	return checks.every((matched) => matched);
}

/**
 * Whether the queue after an add is the queue before it with exactly one new submission inserted
 * and every prior submission still in its original order.
 * @param before - The queue as it was before the add.
 * @param after - The queue as the app-server reports it now.
 * @param added - The submission that should be the only new one.
 * @returns True when nothing but that one insertion happened.
 */
function isSingleInsertion(
	before: QueueSnapshot,
	after: QueueSnapshot,
	added: SessionQueuedSubmission,
): boolean {
	let beforeIndex = 0;
	let addedCount = 0;
	for (const submission of after) {
		if (submission.id === added.id) {
			if (!sameSubmission(submission, added)) {
				return false;
			}
			addedCount += 1;
			continue;
		}
		if (!sameSubmission(submission, before[beforeIndex])) {
			return false;
		}
		beforeIndex += 1;
	}
	return addedCount === 1 && beforeIndex === before.length;
}

/**
 * Whether a queue add did exactly what was asked: it is the reconciliation that lets an add be
 * reported as delivered rather than merely attempted.
 * @param before - The queue as it was before the add.
 * @param after - The queue as the app-server reports it now.
 * @param response - The raw add response.
 * @param input - The single input item that was queued.
 * @param clientUserMessageId - The client identity the add was made under.
 * @returns True when the add is exactly accounted for.
 */
function expectedAdd(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	input: SessionQueuedSubmission["input"][number],
	clientUserMessageId: string,
): boolean {
	const added = responseSubmission(response);
	if (!isOurAddedSubmission(added, before, after, input, clientUserMessageId)) {
		return false;
	}
	return isSingleInsertion(before, after, added);
}

/**
 * Whether the submission a queue update returned is the one that was asked for: the same
 * submission, now carrying our input, still under its own client identity.
 * @param updated - The submission the response carried.
 * @param before - The queue as it was before the update.
 * @param after - The queue as the app-server reports it now.
 * @param submissionId - The submission that was updated.
 * @param input - The single input item it should now carry.
 * @returns True when the returned submission is the expected one.
 */
function isOurUpdatedSubmission(
	updated: SessionQueuedSubmission,
	before: QueueSnapshot,
	after: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
	input: SessionQueuedSubmission["input"][number],
): boolean {
	const prior = before.find((submission) => submission.id === submissionId);
	const checks = [
		updated.id === submissionId,
		JSON.stringify(updated.input) === JSON.stringify([input]),
		after.length === before.length,
		prior !== undefined,
		updated.clientUserMessageId === prior?.clientUserMessageId,
	];
	return checks.every((matched) => matched);
}

/**
 * Whether a queue update did exactly what was asked: the named submission now carries our input,
 * keeps its own client identity, and nothing else in the queue moved or changed.
 * @param before - The queue as it was before the update.
 * @param after - The queue as the app-server reports it now.
 * @param response - The raw update response.
 * @param submissionId - The submission that was updated.
 * @param input - The single input item it should now carry.
 * @returns True when the update is exactly accounted for.
 */
function expectedUpdate(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	submissionId: SessionQueuedSubmission["id"],
	input: SessionQueuedSubmission["input"][number],
): boolean {
	const updated = responseSubmission(response);
	if (updated === null || !isOurUpdatedSubmission(updated, before, after, submissionId, input)) {
		return false;
	}
	return after.every((submission, index) => {
		const priorAtIndex = before[index];
		return sameSubmission(submission, priorAtIndex?.id === submissionId ? updated : priorAtIndex);
	});
}

/**
 * Whether a queue delete did exactly what was asked: the submission is gone when the response says it was deleted, and the queue is untouched when it says it was not.
 * @param before - The queue as it was before the delete.
 * @param after - The queue as the app-server reports it now.
 * @param response - The raw delete response.
 * @param submissionId - The submission that was deleted.
 * @returns True when the delete is exactly accounted for.
 */
function expectedDelete(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	submissionId: SessionQueuedSubmission["id"],
): boolean {
	if (!isRecord(response) || typeof response["deleted"] !== "boolean") {
		return false;
	}
	return response["deleted"]
		? sameQueue(after, queueWithout(before, submissionId))
		: sameQueue(after, before);
}

/**
 * Whether a queue reorder produced exactly the requested order, with every submission otherwise unchanged.
 * @param before - The queue as it was before the reorder.
 * @param after - The queue as the app-server reports it now.
 * @param orderedSubmissionIds - The order that was asked for.
 * @returns True when the reorder is exactly accounted for.
 */
function expectedReorder(
	before: QueueSnapshot,
	after: QueueSnapshot,
	orderedSubmissionIds: readonly SessionQueuedSubmission["id"][],
): boolean {
	if (after.length !== before.length || orderedSubmissionIds.length !== before.length) {
		return false;
	}
	const priorById = new Map(before.map((submission) => [submission.id, submission]));
	return after.every((submission, index) => {
		const expectedId = orderedSubmissionIds[index];
		const prior = expectedId === undefined ? undefined : priorById.get(expectedId);
		return expectedId === submission.id && prior !== undefined && sameSubmission(submission, prior);
	});
}

/**
 * Whether a queue start removed exactly the started submission and left the rest in place.
 * @param before - The queue as it was before the start.
 * @param after - The queue as the app-server reports it now.
 * @param submissionId - The submission that was started.
 * @returns True when the start is exactly accounted for.
 */
function expectedStart(
	before: QueueSnapshot,
	after: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
): boolean {
	return sameQueue(after, queueWithout(before, submissionId));
}

export {
	sameBinding,
	snapshot,
	expectedAdd,
	expectedUpdate,
	expectedDelete,
	expectedReorder,
	expectedStart,
};
