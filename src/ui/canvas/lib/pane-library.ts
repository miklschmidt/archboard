// The shell's palette, pushed into one pane's Excalidraw. Excalidraw keeps its
// own copy per instance and reports the whole palette back on every change, so
// the push is guarded by content hash: an ungated push would return what the
// shell just sent and write it to the server again, forever.

import { getLibraryItemsHash } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";

/** One pane's library sync. */
interface PaneLibrarySync {
	/** Push the shell's palette into Excalidraw, unless it already holds it. */
	readonly apply: (api: ExcalidrawImperativeAPI | null, items: LibraryItems) => void;
	/** Excalidraw reported the palette; remember it so the echo is not pushed back. */
	readonly reported: (items: LibraryItems) => void;
}

/**
 * Create the library sync for one pane.
 * @returns The sync.
 */
function createPaneLibrarySync(): PaneLibrarySync {
	let appliedHash = 0;
	/**
	 * Push the shell's palette into Excalidraw, unless it already holds it.
	 * @param api Excalidraw's API, or null before the canvas mounted.
	 * @param items The palette.
	 */
	function apply(api: ExcalidrawImperativeAPI | null, items: LibraryItems): void {
		if (api === null) {
			return;
		}
		const hash = getLibraryItemsHash(items);
		if (hash === appliedHash) {
			return;
		}
		appliedHash = hash;
		void api.updateLibrary({ libraryItems: items, merge: false });
	}
	/**
	 * Excalidraw reported the palette.
	 * @param items The palette as Excalidraw now holds it.
	 */
	function reported(items: LibraryItems): void {
		appliedHash = getLibraryItemsHash(items);
	}
	return { apply, reported };
}

export { createPaneLibrarySync, type PaneLibrarySync };
