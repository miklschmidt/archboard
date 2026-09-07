// One writer at a time, per board (ADR 0016).
//
// This public module remains the stable lock API. Private owners separate the
// vault lease, acquisition, process-local claim lifecycle, and claim commands.
//
// A board is a note, and two writers to one note lose each other's work. The
// public question stays deliberately small: ask to write a board, and either
// write it exclusively or learn who holds it. Callers must not reconstruct
// acquisition, renewal, expiry, waiting, or pane announcements themselves.
//
// The lock lives beside the note in the vault rather than in this process, so
// every canvas serving the vault observes the same exclusion. It is a lease,
// not a flag: a dead holder costs one lease rather than wedging the board.
// Reads never take this lock; note writes are atomic, and guarding reads would
// only put every description behind whoever is drawing.
//
// Human holds span the leading gesture and its write. Agent claims span a
// larger campaign, but remain renewable short leases with a separate bounded
// claim deadline, and a person can deliberately take a claim back. Revocation
// never undoes committed work and never interrupts a write already in flight.
//
// Lock state is also a broadcast. The vault file excludes every process; the
// watcher lets panes on another canvas learn that state before their next
// write. A disconnected pane fails closed outside this module.

import { forgetClaimState } from "@/runtime/engine/lib/board-lock-claim-state";
import { forgetLockState, watchBoardLocks } from "@/runtime/engine/lib/board-lock-state";

/**
 * Forget what this process remembers about who has which board, and stop
 * watching. Process-memory cleanup only: it deliberately does not modify the
 * authoritative vault leases; releasing one is `releaseHold`.
 */
function forgetLockAnnouncements(): void {
	forgetLockState();
	forgetClaimState();
	watchBoardLocks(null);
}

export {
	BoardLockCancelledError,
	holdBoard,
	sleep,
	withBoardLock,
} from "@/runtime/engine/lib/board-lock-acquisition";
export {
	BoardHeldError,
	type Claim,
	type ClaimRevocation,
	type HolderKind,
	type LockHold,
	type LockHolder,
	type LockRequest,
	type LockSink,
} from "@/runtime/engine/lib/board-lock-contracts";
export {
	claimBoard,
	claimOn,
	claimWriterId,
	releaseClaim,
	takeClaimRevocation,
} from "@/runtime/engine/lib/board-lock-claims";
export {
	boardLockState,
	onBoardLockChanged,
	onBoardSweep,
	recordLockCommit,
	releaseHold,
	watchBoardLocks,
} from "@/runtime/engine/lib/board-lock-state";
export { forgetLockAnnouncements };
