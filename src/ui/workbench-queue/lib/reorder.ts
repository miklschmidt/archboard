// Planning one reorder. The wire command takes every id in the queue, so the
// plan always names every entry. Only coordinator-owned entries change place:
// each foreign entry keeps the absolute slot it already held, which preserves
// the foreign entries' relative order exactly, and the coordinator-owned
// entries are permuted among the slots they already occupied.

import type {
	WorkbenchQueueEntry,
	WorkbenchQueueReorderMove,
	WorkbenchQueueReorderPlan,
	WorkbenchQueueSubmissionId,
} from "@/ui/workbench-queue/contracts";

const NOT_IN_QUEUE = "That submission is not in the authoritative queue.";
const FOREIGN = "Only a submission this coordinator queued can be reordered.";
const ALONE = "There is no other coordinator-owned submission to move this one past.";
const FIRST = "This submission is already the first coordinator-owned entry.";
const LAST = "This submission is already the last coordinator-owned entry.";
const SAME_PLACE = "This submission is already in that place.";

/**
 * An entry carries the identity of the coordinator dynamic-tool call that
 * queued it. A null identity is a submission Archboard's coordinator did not
 * make, another client's or the workhorse's own, and this pane has no
 * authority to move it.
 * @param entry The queue entry.
 * @returns True when the coordinator queued it.
 */
function isCoordinatorOwned(entry: WorkbenchQueueEntry): boolean {
	return entry.operationId !== null;
}

/**
 * The absolute slots the coordinator-owned entries occupy.
 * @param entries The authoritative entries.
 * @returns The slot indexes, in queue order.
 */
function coordinatorSlots(entries: readonly WorkbenchQueueEntry[]): number[] {
	const slots: number[] = [];
	for (const [index, entry] of entries.entries()) {
		if (isCoordinatorOwned(entry)) {
			slots.push(index);
		}
	}
	return slots;
}

/**
 * A refused plan.
 * @param reason Why nothing moves.
 * @returns The plan.
 */
function refuse(reason: string): WorkbenchQueueReorderPlan {
	return Object.freeze({ moved: false, reason });
}

/**
 * Map a pointer drop onto a coordinator-owned slot. Dropping "before the entry
 * at absolute position p" is expressed among the coordinator-owned entries
 * alone, because foreign entries never leave their absolute slot. Removing the
 * dragged entry first shifts every later slot down by one, so a forward drop
 * is decremented.
 * @param ownedSlots The coordinator-owned slots.
 * @param fromOwnedIndex The dragged entry's index among them.
 * @param dropIndex The absolute 0-based index the drop lands before.
 * @returns The target index among the owned entries.
 */
function ownedIndexForDrop(
	ownedSlots: readonly number[],
	fromOwnedIndex: number,
	dropIndex: number,
): number {
	let target = ownedSlots.filter((slot) => slot < dropIndex).length;
	if (target > fromOwnedIndex) {
		target -= 1;
	}
	return Math.min(Math.max(target, 0), ownedSlots.length - 1);
}

/**
 * The owned index a move asks for.
 * @param ownedSlots The coordinator-owned slots.
 * @param fromOwnedIndex The moved entry's index among them.
 * @param move The requested move.
 * @returns The target owned index, possibly off either end for a step.
 */
function targetOwnedIndex(
	ownedSlots: readonly number[],
	fromOwnedIndex: number,
	move: WorkbenchQueueReorderMove,
): number {
	if (move.kind === "step") {
		return fromOwnedIndex + (move.direction === "earlier" ? -1 : 1);
	}
	return ownedIndexForDrop(ownedSlots, fromOwnedIndex, move.position - 1);
}

/**
 * Why a target owned index cannot be used, if it cannot.
 * @param fromOwnedIndex The moved entry's owned index.
 * @param toOwnedIndex The requested owned index.
 * @param ownedCount How many coordinator-owned entries there are.
 * @returns The refusal, or null when the move is possible.
 */
function targetRefusal(
	fromOwnedIndex: number,
	toOwnedIndex: number,
	ownedCount: number,
): string | null {
	if (toOwnedIndex < 0) {
		return FIRST;
	}
	if (toOwnedIndex >= ownedCount) {
		return LAST;
	}
	return toOwnedIndex === fromOwnedIndex ? SAME_PLACE : null;
}

/**
 * Every submission id in the requested order: foreign entries in their slots,
 * coordinator-owned entries permuted among theirs.
 * @param entries The authoritative entries.
 * @param owned The coordinator-owned ids in their new order.
 * @returns The complete ordered id list.
 */
function interleave(
	entries: readonly WorkbenchQueueEntry[],
	owned: readonly WorkbenchQueueSubmissionId[],
): WorkbenchQueueSubmissionId[] {
	let nextOwned = 0;
	const ordered: WorkbenchQueueSubmissionId[] = [];
	for (const entry of entries) {
		if (!isCoordinatorOwned(entry)) {
			ordered.push(entry.submissionId);
			continue;
		}
		const replacement = owned[nextOwned];
		nextOwned += 1;
		ordered.push(replacement ?? entry.submissionId);
	}
	return ordered;
}

/**
 * Why a submission cannot be the subject of a reorder, if it cannot.
 * @param subject The entry, or undefined when the queue does not hold it.
 * @param ownedCount How many coordinator-owned entries there are.
 * @returns The refusal, or null.
 */
function subjectRefusal(
	subject: WorkbenchQueueEntry | undefined,
	ownedCount: number,
): string | null {
	if (subject === undefined) {
		return NOT_IN_QUEUE;
	}
	if (!isCoordinatorOwned(subject)) {
		return FOREIGN;
	}
	return ownedCount < 2 ? ALONE : null;
}

/**
 * Produce the complete ordered submission-id array for one reorder.
 * @param entries The authoritative entries, never mutated.
 * @param submissionId The submission to move.
 * @param move Where to move it.
 * @returns The plan, or why nothing moves.
 */
function planQueueReorder(
	entries: readonly WorkbenchQueueEntry[],
	submissionId: WorkbenchQueueSubmissionId,
	move: WorkbenchQueueReorderMove,
): WorkbenchQueueReorderPlan {
	const fromIndex = entries.findIndex((entry) => entry.submissionId === submissionId);
	const ownedSlots = coordinatorSlots(entries);
	const subject = subjectRefusal(entries[fromIndex], ownedSlots.length);
	if (subject !== null) {
		return refuse(subject);
	}
	const fromOwnedIndex = ownedSlots.indexOf(fromIndex);
	const toOwnedIndex = targetOwnedIndex(ownedSlots, fromOwnedIndex, move);
	const target = targetRefusal(fromOwnedIndex, toOwnedIndex, ownedSlots.length);
	if (target !== null) {
		return refuse(target);
	}
	const owned = ownedSlots.map((slot) => entries[slot]?.submissionId ?? submissionId);
	const [carried] = owned.splice(fromOwnedIndex, 1);
	owned.splice(toOwnedIndex, 0, carried ?? submissionId);
	return Object.freeze({
		moved: true,
		submissionId,
		fromPosition: fromIndex + 1,
		toPosition: (ownedSlots[toOwnedIndex] ?? fromIndex) + 1,
		orderedSubmissionIds: Object.freeze(interleave(entries, owned)),
	});
}

export { isCoordinatorOwned, planQueueReorder };
