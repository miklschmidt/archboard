// The composer's draft, kept outside the composer so it survives the agent bar
// re-rendering for another pane, and so a held message can be taken back into
// it for editing.

/** The draft and the ways it changes. */
interface DraftStore {
	/**
	 * The draft now.
	 * @returns The text.
	 */
	readonly get: () => string;
	/**
	 * Replace the draft.
	 * @param text The text.
	 */
	readonly set: (text: string) => void;
	/**
	 * Listen for changes.
	 * @param listener Called after each change.
	 * @returns Stops listening.
	 */
	readonly subscribe: (listener: () => void) => () => void;
}

/**
 * A draft store, empty.
 * @returns The store.
 */
function createDraftStore(): DraftStore {
	let text = "";
	const listeners = new Set<() => void>();
	return {
		get: () => text,
		set: (next) => {
			if (next === text) return;
			text = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

export { createDraftStore, type DraftStore };
