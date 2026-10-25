// A synchronous, nonblocking lease for schema conversion on a store read.
// Ordinary writes keep the async lease path; a read that finds a live holder
// can show normalized content and retry persistence on the next access.

import { BOARD_LOCK_MS } from "@archboard/timing";
import { normalizeBoardKey } from "#runtime/store/address.ts";
import { createExclusively, freshRecord } from "#runtime/store/lock/acquisition.ts";
import type { LockRequest } from "#runtime/store/lock/contracts.ts";
import {
	liveRecord,
	lockPathFor,
	readRecord,
	releaseHold,
} from "#runtime/store/lock/lease-state.ts";

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
	const file = lockPathFor(request.vault, board);
	const current = readRecord(file);
	const live = liveRecord(current);
	if (live !== null) return joinedOrPending(live.id, request.holder.id, migrate);
	// A lapsed or malformed lease needs the async token-steal guard. Leave it
	// alone and retry after a regular writer has resolved it.
	if (current !== null) return { acquired: false };
	const record = freshRecord(request.holder, request.leaseMs ?? BOARD_LOCK_MS.lease);
	const acquired = createExclusively(request.vault, file, record, board, () => {});
	if (acquired?.ok !== true) return { acquired: false };
	try {
		return { acquired: true, value: migrate() };
	} finally {
		releaseHold(request.vault, board, record.id);
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
