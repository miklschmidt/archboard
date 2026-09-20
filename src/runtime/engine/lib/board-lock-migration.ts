// A synchronous, nonblocking lease for schema conversion on a store read.
// Ordinary writes keep the async lease path; a read that finds a live holder
// can show normalized content and retry persistence on the next access.

import { LOCK_LEASE_MS } from "@/shared/timing/timing";
import { normalizeBoardKey } from "@/runtime/engine/board";
import { createExclusively, freshRecord } from "@/runtime/engine/lib/board-lock-acquisition";
import type { LockRequest } from "@/runtime/engine/lib/board-lock-contracts";
import {
	liveRecord,
	lockPathFor,
	readRecord,
	releaseHold,
} from "@/runtime/engine/lib/board-lock-state";

/** The read either migrated under a lease or found a holder to retry later. */
type MigrationHold<T> =
	| { readonly acquired: true; readonly value: T }
	| { readonly acquired: false };

/**
 * Run a synchronous migration only when the board's lease is available.
 * @param request The board and holder for this migration.
 * @param migrate The conversion to commit while held.
 * @returns Its result, or a pending indication.
 */
function withBoardLockIfFreeSync<T>(request: LockRequest, migrate: () => T): MigrationHold<T> {
	const board = normalizeBoardKey(request.board);
	const file = lockPathFor(board);
	const current = readRecord(file);
	const live = liveRecord(current);
	if (live !== null) return joinedOrPending(live.id, request.holder.id, migrate);
	// A lapsed or malformed lease needs the async token-steal guard. Leave it
	// alone and retry after a regular writer has resolved it.
	if (current !== null) return { acquired: false };
	const record = freshRecord(request.holder, request.leaseMs ?? LOCK_LEASE_MS);
	const acquired = createExclusively(file, record, board, () => {});
	if (acquired?.ok !== true) return { acquired: false };
	try {
		return { acquired: true, value: migrate() };
	} finally {
		releaseHold(board, record.id);
	}
}

/**
 * Join a lease that already belongs to this holder without releasing it.
 * @param heldBy The current holder.
 * @param askedBy The reader's holder.
 * @param migrate The conversion to run if this holder owns the lease.
 * @returns A migrated result or pending indication.
 */
function joinedOrPending<T>(heldBy: string, askedBy: string, migrate: () => T): MigrationHold<T> {
	return heldBy === askedBy ? { acquired: true, value: migrate() } : { acquired: false };
}

export { withBoardLockIfFreeSync };
