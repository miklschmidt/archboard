// When the running turn last reported anything new — an item, a change to
// the last item, a plan step — heard as the transport publishes, so the agent
// dock can say a turn has gone quiet without reading the clock while it draws.

import type { BrowserTimeline } from "@archboard/workbench/browser-contract";
import type { SnapshotStore } from "#ui/state/application/snapshot-cache.ts";
import type { BrowserWorkbenchTransport } from "@archboard/agent-workbench/browser";

/** One item of a published turn. */
type TimelineItem = BrowserTimeline["turns"][number]["items"][number];

/**
 * One item's progress as a short mark: which it is, where it stands, and how
 * much it has said — never its whole text, which a long turn would make heavy.
 * @param item The item.
 * @returns The mark.
 */
function itemMark(item: TimelineItem): string {
	const status = "status" in item ? item.status : "";
	const said = "text" in item ? item.text.length : 0;
	const output = "output" in item && item.output !== null ? item.output.length : 0;
	return `${item.itemId}:${status}:${said}:${output}`;
}

/**
 * What the running turn has done so far, as one comparable value: every item
 * of work and what the agent said, and the plan. Approvals are not progress:
 * one arriving or being retired is the person's business, not the agent's.
 * @param transport The transport.
 * @returns The signature, or null while no turn runs.
 */
function runningSignature(transport: BrowserWorkbenchTransport): string | null {
	const turn = transport
		.snapshot()
		?.timeline?.turns.findLast((entry) => entry.status === "inProgress");
	if (turn === undefined) return null;
	const marks = turn.items.filter((item) => item.media !== "approval").map(itemMark);
	return JSON.stringify([turn.turnId, marks, turn.plan]);
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
