// The one-writer lease of a board: claims, holds, the lock state and what announces a change of it.
export { BoardLockCancelledError, holdBoard, sleep } from "#runtime/store/lock/acquisition.ts";
export {
	claimBoard,
	claimEndReason,
	claimOn,
	releaseClaim,
	takeClaimRevocation,
} from "#runtime/store/lock/claims.ts";
export type { LockHolder } from "#runtime/store/lock/contracts.ts";
export {
	boardLockState,
	onBoardLockChanged,
	onBoardSweep,
	releaseHold,
	watchBoardLocks,
} from "#runtime/store/lock/lease-state.ts";
export type { WatchedBoard } from "#runtime/store/lock/lease-state.ts";
export { forgetLockAnnouncements } from "#runtime/store/lock/lock.ts";
