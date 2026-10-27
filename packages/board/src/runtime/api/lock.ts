// The one-writer lease of a board: claims, the take-back, the lock state and
// what announces a change of it, and the process memory a stopping server forgets.

export { boardLockState } from "#runtime/store/lock/lease-state.ts";

export { forgetBoardMemory } from "#runtime/store/memory.ts";
