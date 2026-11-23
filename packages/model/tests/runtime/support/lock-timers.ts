import { spyOn } from "bun:test";
import type { after, every, pollUntil } from "@archboard/timing";

type LockWait = Extract<
	Parameters<typeof after>[0] | Parameters<typeof every>[0] | Parameters<typeof pollUntil>[0],
	`modelLock.${string}`
>;

/** Read the named timers the lock scheduled on the fake clock. */
function observeLockTimers() {
	const timeout = spyOn(globalThis, "setTimeout");
	const interval = spyOn(globalThis, "setInterval");
	return {
		delay(name: LockWait): number {
			const timer = [...timeout.mock.calls, ...interval.mock.calls].findLast(
				(call) => call[2] === name,
			);
			if (timer?.[1] === undefined) throw new Error(`No timer was scheduled for ${name}.`);
			return timer[1];
		},
		[Symbol.dispose](): void {
			timeout.mockRestore();
			interval.mockRestore();
		},
	};
}

export { observeLockTimers };
