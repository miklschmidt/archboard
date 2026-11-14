// The lock of the checkout registry: a lock file that one process holds while it
// changes the registry.

/** How long the registry lock lasts, and how often a waiter asks for it again. */
const REGISTRY_LOCK_MS = Object.freeze({
	/**
	 * Age past which a lock was left by a process that died while it held it, and is
	 * removed. A change to the registry is one small file write, so a live holder lets
	 * go well inside it, and a crash costs the next change this long.
	 */
	lease: 3000,
	/**
	 * How often a waiter asks for the lock again. A write takes a few milliseconds, so
	 * a handover costs at most one poll.
	 */
	poll: 50,
} satisfies Record<string, number>);

export { REGISTRY_LOCK_MS };
