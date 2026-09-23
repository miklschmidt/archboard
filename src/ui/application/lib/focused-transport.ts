// The transport of whichever pane is focused, as one object that stays the
// same while the focus moves: the canvas-wide agent setup listens to it, and
// hears the new pane's state the moment focus changes.

import type { BrowserWorkbenchState, BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** While no pane has a transport. */
const NO_TRANSPORT: BrowserWorkbenchState = Object.freeze({
	kind: "connection",
	state: "stopped",
	connection: "stopped",
	snapshot: null,
	sequence: null,
	reason: "No pane is connected to the canvas.",
});

/** The focused pane's transport, retargeted as focus moves. */
interface FocusedTransport {
	readonly state: () => BrowserWorkbenchState;
	readonly subscribe: (listener: () => void) => () => void;
	/** The transport now, or null. */
	readonly current: () => BrowserWorkbenchTransport | null;
	/**
	 * Follow another pane's transport.
	 * @param transport The transport, or null.
	 */
	readonly retarget: (transport: BrowserWorkbenchTransport | null) => void;
}

/**
 * A focused transport, following nothing yet.
 * @returns The focused transport.
 */
function createFocusedTransport(): FocusedTransport {
	let target: BrowserWorkbenchTransport | null = null;
	let unsubscribe: () => void = () => undefined;
	const listeners = new Set<() => void>();
	/** Tell every listener the state may have changed. */
	const notify = (): void => {
		for (const listener of listeners) listener();
	};
	return {
		state: () => target?.state() ?? NO_TRANSPORT,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		current: () => target,
		retarget: (transport) => {
			if (transport === target) return;
			unsubscribe();
			target = transport;
			unsubscribe = transport?.subscribe(notify) ?? (() => undefined);
			notify();
		},
	};
}

export { createFocusedTransport, type FocusedTransport };
