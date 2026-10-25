// The one-writer lease of a board: claims, the take-back, the lock state and
// what announces a change of it, and the process memory a stopping server forgets.
export { BoardLockCancelledError, holdBoard } from "#runtime/store/lock/acquisition.ts";
export {
	claimBoard,
	releaseClaim,
	takeBackBoard,
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
export { forgetBoardMemory } from "#runtime/store/memory.ts";
