import type {
	WorkbenchQueueEntry,
	WorkbenchQueueReorderMove,
	WorkbenchQueueReorderPlan,
	WorkbenchQueueSubmissionId,
} from "./contract.js";

/**
 * An entry carries the identity of the coordinator dynamic-tool call that
 * queued it. A null identity is a submission Archboard's coordinator did not
 * make — another client's, or the workhorse's own — and this pane has no
 * authority to move it.
 */
export function isCoordinatorOwned(entry: WorkbenchQueueEntry): boolean {
	return entry.operationId !== null;
}

function refuse(reason: string): WorkbenchQueueReorderPlan {
	return Object.freeze({ moved: false, reason });
}

/**
 * Map a pointer drop onto a coordinator-owned slot.
 *
 * Dropping "before the entry at absolute position p" is expressed among the
 * coordinator-owned entries alone, because foreign entries never leave their
 * absolute slot. Removing the dragged entry first shifts every later slot down
 * by one, so a forward drop is decremented.
 */
function ownedIndexForDrop(
	ownedSlots: readonly number[],
	fromOwnedIndex: number,
	dropIndex: number,
): number {
	let target = 0;
	for (const slot of ownedSlots) if (slot < dropIndex) target += 1;
	if (target > fromOwnedIndex) target -= 1;
	return Math.min(Math.max(target, 0), ownedSlots.length - 1);
}

function targetOwnedIndex(
	ownedSlots: readonly number[],
	fromOwnedIndex: number,
	move: WorkbenchQueueReorderMove,
): number {
	if (move.kind === "step") return fromOwnedIndex + (move.direction === "earlier" ? -1 : 1);
	return ownedIndexForDrop(ownedSlots, fromOwnedIndex, move.position - 1);
}

/**
 * Produce the complete ordered submission-id array for one reorder.
 *
 * The wire command takes every id in the queue, so the plan always names every
 * entry. Only coordinator-owned entries change place: each foreign entry keeps
 * the absolute slot it already held, which preserves the foreign entries'
 * relative order exactly, and the coordinator-owned entries are permuted among
 * the slots they already occupied.
 */
export function planQueueReorder(
	entries: readonly WorkbenchQueueEntry[],
	submissionId: WorkbenchQueueSubmissionId,
	move: WorkbenchQueueReorderMove,
): WorkbenchQueueReorderPlan {
	const fromIndex = entries.findIndex((entry) => entry.submissionId === submissionId);
	if (fromIndex < 0) return refuse("That submission is not in the authoritative queue.");
	const subject = entries[fromIndex];
	if (subject === undefined || !isCoordinatorOwned(subject))
		return refuse("Only a submission this coordinator queued can be reordered.");

	const ownedSlots: number[] = [];
	for (const [index, entry] of entries.entries())
		if (isCoordinatorOwned(entry)) ownedSlots.push(index);
	if (ownedSlots.length < 2)
		return refuse("There is no other coordinator-owned submission to move this one past.");

	const fromOwnedIndex = ownedSlots.indexOf(fromIndex);
	const toOwnedIndex = targetOwnedIndex(ownedSlots, fromOwnedIndex, move);
	if (toOwnedIndex < 0)
		return refuse("This submission is already the first coordinator-owned entry.");
	if (toOwnedIndex >= ownedSlots.length)
		return refuse("This submission is already the last coordinator-owned entry.");
	if (toOwnedIndex === fromOwnedIndex) return refuse("This submission is already in that place.");

	const owned = ownedSlots.map((slot) => entries[slot]?.submissionId);
	const [carried] = owned.splice(fromOwnedIndex, 1);
	if (carried === undefined) return refuse("That submission is not in the authoritative queue.");
	owned.splice(toOwnedIndex, 0, carried);

	let nextOwned = 0;
	const orderedSubmissionIds: WorkbenchQueueSubmissionId[] = [];
	for (const entry of entries) {
		if (!isCoordinatorOwned(entry)) {
			orderedSubmissionIds.push(entry.submissionId);
			continue;
		}
		const replacement = owned[nextOwned];
		nextOwned += 1;
		if (replacement === undefined)
			return refuse("That submission is not in the authoritative queue.");
		orderedSubmissionIds.push(replacement);
	}

	const toSlot = ownedSlots[toOwnedIndex];
	return Object.freeze({
		moved: true,
		submissionId,
		fromPosition: fromIndex + 1,
		toPosition: (toSlot ?? fromIndex) + 1,
		orderedSubmissionIds: Object.freeze(orderedSubmissionIds),
	});
}
