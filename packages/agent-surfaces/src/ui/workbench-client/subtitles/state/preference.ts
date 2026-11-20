// Whether the person wants subtitles, kept across reloads.
//
// The control that changes it sits in the dock and the subtitles it governs sit over a pane's
// picture, with nothing between them but the shell. So the choice is one small store both read,
// rather than state threaded through every component in between. Subtitles start on: somebody
// who has never seen them cannot know to ask for them, and turning them off is one click.

const STORAGE_KEY = "archboard.voice.subtitles";

/** The person's choice, read and changed from anywhere in the page. */
interface SubtitlePreference {
	/**
	 * Whether subtitles are wanted.
	 * @returns True while they are.
	 */
	readonly wanted: () => boolean;
	/**
	 * Change the choice.
	 * @param wanted Whether subtitles are wanted from now on.
	 */
	readonly change: (wanted: boolean) => void;
	/**
	 * Hear about every change.
	 * @param listener Called after the choice changed.
	 * @returns How to stop listening.
	 */
	readonly subscribe: (listener: () => void) => () => void;
}

/** Where the choice is kept between visits; a browser's storage, or anything shaped like it. */
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * The stored choice, on when there is none or storage cannot be read.
 * @param storage Where the choice is kept, or null without any.
 * @returns Whether subtitles start on.
 */
function stored(storage: PreferenceStorage | null): boolean {
	try {
		return storage?.getItem(STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

/**
 * A subtitle preference over some storage.
 * @param storage Where the choice is kept, or null to keep it for this page only.
 * @returns The preference.
 */
function createSubtitlePreference(storage: PreferenceStorage | null): SubtitlePreference {
	let wanted = stored(storage);
	const listeners = new Set<() => void>();
	return Object.freeze({
		/**
		 * Whether subtitles are wanted.
		 * @returns True while they are.
		 */
		wanted: (): boolean => wanted,
		/**
		 * Change the choice, and keep it when storage allows.
		 * @param next Whether subtitles are wanted from now on.
		 */
		change: (next: boolean): void => {
			if (next === wanted) {
				return;
			}
			wanted = next;
			try {
				storage?.setItem(STORAGE_KEY, String(next));
			} catch {
				// The choice still holds for this page without browser storage.
			}
			for (const listener of listeners) {
				listener();
			}
		},
		/**
		 * Hear about every change.
		 * @param listener Called after the choice changed.
		 * @returns How to stop listening.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return (): void => {
				listeners.delete(listener);
			};
		},
	});
}

/**
 * The browser's storage, when the page has one it may touch.
 * @returns The storage, or null.
 */
function browserStorage(): PreferenceStorage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

/** The page's one subtitle preference. */
const subtitlePreference = createSubtitlePreference(browserStorage());

export { createSubtitlePreference, subtitlePreference, type SubtitlePreference };
