// When the running turn last reported anything new — an item, a change to
// the last item, a plan step — heard as the transport publishes, so the agent
// bar can say a turn has gone quiet without reading the clock while it draws.

import type { SnapshotStore } from "@/ui/application/lib/snapshot-cache";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/**
 * What the running turn has said so far, as one comparable value.
 * @param transport The transport.
 * @returns The signature, or null while no turn runs.
 */
function runningSignature(transport: BrowserWorkbenchTransport): string | null {
	const turn = transport.snapshot()?.timeline?.turns.at(-1);
	if (turn?.status !== "inProgress") return null;
	return JSON.stringify([turn.turnId, turn.items.length, turn.items.at(-1) ?? null, turn.plan]);
}

/**
 * A clock over one transport: the time the running turn last changed, or null
 * while nothing runs. It watches only while somebody listens.
 * @param transport The transport.
 * @param now The clock.
 * @returns The store.
 */
function createProgressClock(
	transport: BrowserWorkbenchTransport,
	now: () => number = Date.now,
): SnapshotStore<number | null> {
	let signature: string | null = null;
	let at: number | null = null;
	const listeners = new Set<() => void>();
	let unsubscribe: (() => void) | null = null;
	/** Read the transport, and stamp the time when the running turn changed. */
	const observe = (): void => {
		const next = runningSignature(transport);
		if (next === signature) return;
		signature = next;
		at = next === null ? null : now();
		for (const listener of listeners) listener();
	};
	return Object.freeze({
		/**
		 * Listen for the running turn's changes.
		 * @param listener Called after each.
		 * @returns Stops listening.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			if (unsubscribe === null) {
				unsubscribe = transport.subscribe(observe);
				observe();
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size > 0) return;
				unsubscribe?.();
				unsubscribe = null;
			};
		},
		/**
		 * When the running turn last changed.
		 * @returns The time, or null.
		 */
		getSnapshot: (): number | null => at,
	});
}

export { createProgressClock };
