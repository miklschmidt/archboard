// What this process remembers about models, keyed by vault and model together
// (`modelMemoryKey`): claims, revocations, the announced lock state, the lock
// watch and its listeners, and what agents said they were doing. None of it is
// model content, so a stopping server forgets all of it at once.

import { forgetDoing } from "#runtime/store/doing.ts";
import {
	forgetLockAnnouncements,
	onBoardLockChanged,
	onBoardSweep,
} from "#runtime/store/lock/lock.ts";

/**
 * Forget everything this process remembers about models, and stop the lock
 * watch and its listeners. The leases in each vault are left as they are.
 */
function forgetModelMemory(): void {
	onBoardLockChanged(null);
	onBoardSweep(null);
	forgetLockAnnouncements();
	forgetDoing();
}

export { forgetModelMemory };
