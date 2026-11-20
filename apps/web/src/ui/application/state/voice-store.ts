// The voice session for the pane voice runs for, as a store React reads. An
// effect points it at that pane's hosted conversation; it makes the session, and
// disposes it when the pane or its conversation changes, since a session listens
// to its pane's socket from the moment it exists.

import type { SnapshotStore } from "#ui/application/state/snapshot-cache.ts";
import type { VoiceOwner } from "#ui/application/state/workbench-owners.ts";
import { createVoiceSession } from "@archboard/workbench/voice";
import type { HostedConversation } from "@archboard/codex-realtime-voice/browser";

/** What a voice session is made over: a pane and its hosted conversation. */
interface VoicePane {
	readonly paneId: string;
	readonly transport: HostedConversation;
}

/** The voice owner, and the move that makes it. */
interface VoiceStore extends SnapshotStore<VoiceOwner | null> {
	/**
	 * Make the voice session for one pane's hosted conversation.
	 * @param pane The pane and its hosted conversation.
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
		 * Make the voice session for one pane's hosted conversation, with the conversation's voice.
		 * @param pane The pane and its hosted conversation.
		 * @returns Dispose of the session.
		 */
		follow: (pane: VoicePane): (() => void) => {
			const owner: VoiceOwner = {
				paneId: pane.paneId,
				session: createVoiceSession({
					paneId: pane.paneId,
					transport: pane.transport,
					realtime: pane.transport.media,
				}),
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

export { createVoiceStore };
