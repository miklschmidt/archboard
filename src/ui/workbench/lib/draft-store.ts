// The composer's draft, kept outside the composer so it survives the dock or the panel
// re-rendering for another pane, and so a suggestion or a held message taken
// back for editing can be put in it with the field focused.

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
	 * Put text in the draft — after what is already there, so nothing typed is
	 * lost — and the cursor in the field, ready to edit.
	 * @param text The text.
	 */
	readonly fill: (text: string) => void;
	/**
	 * The field the draft is typed in, as React attaches and detaches it.
	 * @param field The field, or null.
	 */
	readonly attach: (field: HTMLTextAreaElement | null) => void;
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
	let input: HTMLTextAreaElement | null = null;
	const listeners = new Set<() => void>();
	/**
	 * Replace the draft and tell the listeners.
	 * @param next The text.
	 */
	const set = (next: string): void => {
		if (next === text) return;
		text = next;
		for (const listener of listeners) listener();
	};
	return {
		/**
		 * The draft now.
		 * @returns The text.
		 */
		get: () => text,
		set,
		/**
		 * Add text after the draft and put the cursor in the field.
		 * @param next The text.
		 */
		fill: (next) => {
			set(text.trim() === "" ? next : `${text}\n\n${next}`);
			input?.focus();
		},
		/**
		 * The field, as the composer mounts and unmounts it.
		 * @param field The field, or null.
		 */
		attach: (field) => {
			input = field;
		},
		/**
		 * Listen for changes.
		 * @param listener Called after each change.
		 * @returns Stops listening.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export { createDraftStore, type DraftStore };
