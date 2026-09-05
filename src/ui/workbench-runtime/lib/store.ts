// The runtime's own small state: the composer intent, the queue choice, the
// approvals whose decisions are on the wire, and the visible status. Held in
// one external store so the hook reads it the same way it reads the transport.

import type { ComposerIntent } from "@/ui/workbench/contracts";
import { readyStatus, type WorkbenchVisibleStatus } from "@/ui/workbench-runtime/lib/view";

/** What the runtime remembers beyond the transport. */
interface WorkbenchRuntimeLocalState {
	readonly intent: ComposerIntent;
	readonly queueInstead: boolean;
	readonly busyApprovals: readonly string[];
	readonly status: WorkbenchVisibleStatus;
}

/** The store. */
interface WorkbenchRuntimeStore {
	readonly getSnapshot: () => WorkbenchRuntimeLocalState;
	readonly subscribe: (listener: () => void) => () => void;
	readonly update: (next: Partial<WorkbenchRuntimeLocalState>) => void;
	/** Mark an approval's decision as on the wire, or settled. */
	readonly setBusy: (key: string, busy: boolean) => void;
}

/**
 * A fresh store. The intent defaults to steer: while a turn runs, a person
 * who never touched the toggle corrects the running turn, and while nothing
 * runs the runtime sends regardless of the toggle.
 * @returns The store.
 */
function createWorkbenchRuntimeStore(): WorkbenchRuntimeStore {
	const listeners = new Set<() => void>();
	let state: WorkbenchRuntimeLocalState = Object.freeze({
		intent: "steer",
		queueInstead: false,
		busyApprovals: [],
		status: readyStatus(),
	});
	/**
	 * Publish a partial state.
	 * @param next The fields that changed.
	 */
	function update(next: Partial<WorkbenchRuntimeLocalState>): void {
		state = Object.freeze({ ...state, ...next });
		for (const listener of listeners) {
			listener();
		}
	}
	/**
	 * Mark an approval busy or settled.
	 * @param key The approval key.
	 * @param busy Whether its decision is on the wire.
	 */
	function setBusy(key: string, busy: boolean): void {
		const without = state.busyApprovals.filter((candidate) => candidate !== key);
		update({ busyApprovals: busy ? [...without, key] : without });
	}
	/**
	 * Hear every publication.
	 * @param listener The listener.
	 * @returns A function that stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
	/**
	 * The state.
	 * @returns The frozen state.
	 */
	function getSnapshot(): WorkbenchRuntimeLocalState {
		return state;
	}
	return { getSnapshot, subscribe, update, setBusy };
}

export { createWorkbenchRuntimeStore, type WorkbenchRuntimeLocalState, type WorkbenchRuntimeStore };
