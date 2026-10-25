// The voice session for the pane voice runs for, as a store React reads. An
// effect points it at that pane's transport; it makes the session, and
// disposes it when the pane or its transport changes, since a session listens
// to its pane's socket from the moment it exists.

import type { SnapshotStore } from "#ui/state/application/snapshot-cache.ts";
import type { VoiceOwner } from "#ui/state/application/workbench-owners.ts";
import { createVoiceSession, type VoiceSessionPorts } from "@archboard/workbench/voice";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/browser";

/** What a voice session is made over: a pane, its transport and its media. */
interface VoicePane {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly realtime: VoiceSessionPorts["realtime"];
}

/** The voice owner, and the move that makes it. */
interface VoiceStore extends SnapshotStore<VoiceOwner | null> {
	/**
	 * Make the voice session for one pane's transport.
	 * @param pane The pane, its transport and its media.
	 * @returns Dispose of the session.
	 */
	readonly follow: (pane: VoicePane) => () => void;
}

/**
 * A voice store, with no session yet.
 * @returns The store.
 */
function createVoiceStore(): VoiceStore {
	let current: VoiceOwner | null = null;
	const listeners = new Set<() => void>();
	/**
	 * Replace the owner and tell the listeners.
	 * @param next The owner, or null.
	 */
	const publish = (next: VoiceOwner | null): void => {
		current = next;
		for (const listener of listeners) listener();
	};
	return Object.freeze({
		/**
		 * Listen for the owner changing.
		 * @param listener Called after each change.
		 * @returns Stops listening.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * The owner now.
		 * @returns The owner, or null.
		 */
		getSnapshot: (): VoiceOwner | null => current,
		/**
		 * Make the voice session for one pane's transport.
		 * @param pane The pane, its transport and its media.
		 * @returns Dispose of the session.
		 */
		follow: (pane: VoicePane): (() => void) => {
			const owner: VoiceOwner = {
				paneId: pane.paneId,
				session: createVoiceSession(pane),
				transport: pane.transport,
			};
			publish(owner);
			return () => {
				owner.session.dispose();
				if (current === owner) publish(null);
			};
		},
	});
}

export { createVoiceStore, type VoiceStore };
