import { QueuedSubmissionSchema } from "../../codex-protocol/index.js";
import type { SessionQueuedSubmission } from "../../codex-session/index.js";
import type { QueueSnapshot, WorkhorseQueueBinding } from "./contract.js";

export function sameBinding(left: WorkhorseQueueBinding, right: WorkhorseQueueBinding): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.coordinatorThreadId === right.coordinatorThreadId &&
		left.workhorseThreadId === right.workhorseThreadId
	);
}

function sameSubmission(left: SessionQueuedSubmission, right: SessionQueuedSubmission): boolean {
	return (
		left.id === right.id &&
		left.clientUserMessageId === right.clientUserMessageId &&
		JSON.stringify(left.input) === JSON.stringify(right.input)
	);
}

function sameQueue(left: QueueSnapshot, right: QueueSnapshot): boolean {
	return (
		left.length === right.length &&
		left.every((submission, index) => {
			const candidate = right[index];
			return candidate !== undefined && sameSubmission(submission, candidate);
		})
	);
}

function queueWithout(
	queue: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
): QueueSnapshot {
	return queue.filter((submission) => submission.id !== submissionId);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSessionQueuedSubmission(value: unknown): value is SessionQueuedSubmission {
	return QueuedSubmissionSchema.safeParse(value).success;
}

function responseSubmission(value: unknown): SessionQueuedSubmission | null {
	if (!isRecord(value) || !isRecord(value["queuedSubmission"])) return null;
	const candidate = value["queuedSubmission"];
	return isSessionQueuedSubmission(candidate) ? candidate : null;
}

export function snapshot(data: readonly SessionQueuedSubmission[]): QueueSnapshot {
	return Object.freeze(data.slice());
}

export function expectedAdd(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	input: SessionQueuedSubmission["input"][number],
	clientUserMessageId: string,
): boolean {
	const added = responseSubmission(response);
	if (
		added === null ||
		added.id.length === 0 ||
		added.clientUserMessageId !== clientUserMessageId ||
		JSON.stringify(added.input) !== JSON.stringify([input]) ||
		before.some((submission) => submission.id === added.id) ||
		after.length !== before.length + 1
	)
		return false;

	let beforeIndex = 0;
	let addedCount = 0;
	for (const submission of after) {
		if (submission.id === added.id) {
			if (!sameSubmission(submission, added)) return false;
			addedCount += 1;
			continue;
		}
		const prior = before[beforeIndex];
		if (prior === undefined || !sameSubmission(submission, prior)) return false;
		beforeIndex += 1;
	}
	return addedCount === 1 && beforeIndex === before.length;
}

export function expectedUpdate(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	submissionId: SessionQueuedSubmission["id"],
	input: SessionQueuedSubmission["input"][number],
): boolean {
	const updated = responseSubmission(response);
	if (
		updated === null ||
		updated.id !== submissionId ||
		JSON.stringify(updated.input) !== JSON.stringify([input]) ||
		after.length !== before.length
	)
		return false;
	const prior = before.find((submission) => submission.id === submissionId);
	if (prior === undefined || updated.clientUserMessageId !== prior.clientUserMessageId)
		return false;
	return after.every((submission, index) => {
		const priorAtIndex = before[index];
		if (priorAtIndex === undefined) return false;
		return priorAtIndex.id === submissionId
			? sameSubmission(submission, updated)
			: sameSubmission(submission, priorAtIndex);
	});
}

export function expectedDelete(
	before: QueueSnapshot,
	after: QueueSnapshot,
	response: unknown,
	submissionId: SessionQueuedSubmission["id"],
): boolean {
	if (!isRecord(response) || typeof response["deleted"] !== "boolean") return false;
	return response["deleted"]
		? sameQueue(after, queueWithout(before, submissionId))
		: sameQueue(after, before);
}

export function expectedReorder(
	before: QueueSnapshot,
	after: QueueSnapshot,
	orderedSubmissionIds: readonly SessionQueuedSubmission["id"][],
): boolean {
	if (after.length !== before.length || orderedSubmissionIds.length !== before.length) return false;
	const priorById = new Map(before.map((submission) => [submission.id, submission]));
	return after.every((submission, index) => {
		const expectedId = orderedSubmissionIds[index];
		const prior = expectedId === undefined ? undefined : priorById.get(expectedId);
		return expectedId === submission.id && prior !== undefined && sameSubmission(submission, prior);
	});
}

export function expectedStart(
	before: QueueSnapshot,
	after: QueueSnapshot,
	submissionId: SessionQueuedSubmission["id"],
): boolean {
	return sameQueue(after, queueWithout(before, submissionId));
}
