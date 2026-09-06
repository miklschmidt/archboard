// The library, as a piece of shell state. There is one library behind however
// many canvases are on screen, and it lives on the server (ADR 0007): a second
// pane, a second tab and an agent all reach the same palette. A pane receives
// the items and reports back what Excalidraw made of them; it never owns them.

import { getLibraryItemsHash, mergeLibraryItems } from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useState } from "react";

import {
	clearLibraryHash,
	libraryName,
	pendingLibraryUrl,
} from "@/ui/board-library/lib/library-hash";
import { fetchLibraryFrom } from "@/ui/board-library/lib/library-source";
import { fetchLibrary, putLibrary } from "@/ui/canvas/api";

/** A library fetched and waiting on the human's yes. */
interface PendingInstall {
	/** Where it came from, as the dialog says it. */
	source: string;
	host: string;
	name: string;
	items: LibraryItems;
}

/** The library as the shell holds it, and what a person can do to it. */
interface LibraryController {
	items: LibraryItems;
	pending: PendingInstall | null;
	/** Fetching or writing; the dialog disables itself on it. */
	busy: boolean;
	error: string | null;
	acceptInstall: () => void;
	declineInstall: () => void;
	dismissError: () => void;
	/** What a pane's Excalidraw says the library now is. */
	reportFromPane: (items: LibraryItems) => void;
	/** What another tab did, arriving over a pane's socket. */
	applyFromServer: (items: LibraryItems) => void;
}

/**
 * What the server is believed to hold, and whether it has ever been read.
 * Every skip decision is made on the hash rather than on a client id, so a
 * write, its own broadcast, and the same change reported by a second pane all
 * settle without an echo. Nothing is written before the first read: a failed
 * read leaves the panes with an empty library, and treating that emptiness as
 * the human's intent would delete the palette.
 */
class ServerLibraryRecord {
	#loaded = false;
	#hash = 0;

	/**
	 * Whether the server's copy has ever been read.
	 * @returns True after the first successful read or broadcast.
	 */
	get loaded(): boolean {
		return this.#loaded;
	}

	/**
	 * Whether these items are what the server is believed to hold.
	 * @param items The items.
	 * @returns True when their hash matches.
	 */
	holds(items: LibraryItems): boolean {
		return getLibraryItemsHash(items) === this.#hash;
	}

	/**
	 * The server now holds these items.
	 * @param items The items.
	 */
	record(items: LibraryItems): void {
		this.#hash = getLibraryItemsHash(items);
		this.#loaded = true;
	}
}

/**
 * Plain words for a failure.
 * @param failure What was thrown.
 * @returns Its message.
 */
function failureMessage(failure: unknown): string {
	return failure instanceof Error ? failure.message : String(failure);
}

/** Who hears a library failure the moment it happens, besides the dialog. */
interface LibraryOptions {
	/**
	 * A read, a fetch or a save failed; the same words the dialog shows. Keep
	 * the listener stable: the first read runs again when it changes.
	 */
	readonly onError?: (message: string) => void;
}

/**
 * The library, read from and written to the server.
 * @param options Who hears a failure.
 * @returns The controller.
 */
function useLibrary(options: LibraryOptions = {}): LibraryController {
	const [items, setItems] = useState<LibraryItems>([]);
	const [pending, setPending] = useState<PendingInstall | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [server] = useState(() => new ServerLibraryRecord());
	const { onError } = options;
	const fail = useCallback(
		(message: string): void => {
			setError(message);
			onError?.(message);
		},
		[onError],
	);

	const persist = useCallback(
		async (next: LibraryItems): Promise<void> => {
			if (!server.loaded) {
				return;
			}
			server.record(next);
			try {
				await putLibrary(next);
			} catch (failure) {
				fail(`The library could not be saved: ${failureMessage(failure)}`);
			}
		},
		[fail, server],
	);

	useEffect(() => {
		let cancelled = false;
		fetchLibrary()
			.then((result) => {
				if (!cancelled) {
					server.record(result.items);
					setItems(result.items);
				}
				return result;
			})
			.catch((failure: unknown) => {
				if (!cancelled) {
					fail(`The library could not be read: ${failureMessage(failure)}`);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [fail, server]);

	// Both entry points matter. A cold load carries the hash when the library
	// site opened a new tab; a hashchange is the same trip landing back in the
	// tab that started it. The hash is cleared before anything is fetched.
	const offer = useCallback(
		async (candidate: string): Promise<void> => {
			clearLibraryHash();
			setError(null);
			setBusy(true);
			try {
				const fetched = await fetchLibraryFrom(candidate);
				setPending({
					source: fetched.url.href,
					host: fetched.url.hostname,
					name: libraryName(fetched.url),
					items: fetched.items,
				});
			} catch (failure) {
				fail(failureMessage(failure));
			} finally {
				setBusy(false);
			}
		},
		[fail],
	);

	useEffect(() => {
		const requested = pendingLibraryUrl();
		const initialTimer =
			requested === null ? null : window.setTimeout(() => void offer(requested), 0);
		/** The same trip landed back in the tab that started it. */
		function onHashChange(): void {
			const next = pendingLibraryUrl();
			if (next !== null) {
				void offer(next);
			}
		}
		window.addEventListener("hashchange", onHashChange);
		return () => {
			if (initialTimer !== null) {
				window.clearTimeout(initialTimer);
			}
			window.removeEventListener("hashchange", onHashChange);
		};
	}, [offer]);

	const acceptInstall = useCallback((): void => {
		if (pending === null) {
			return;
		}
		// Merge rather than replace: installing a library adds to the palette,
		// and items already present by id are not duplicated.
		const next = mergeLibraryItems(items, pending.items);
		setPending(null);
		setItems(next);
		void persist(next);
	}, [items, pending, persist]);

	const declineInstall = useCallback((): void => setPending(null), []);
	const dismissError = useCallback((): void => setError(null), []);

	const reportFromPane = useCallback(
		(next: LibraryItems): void => {
			if (!server.loaded || server.holds(next)) {
				return;
			}
			setItems(next);
			void persist(next);
		},
		[persist, server],
	);

	const applyFromServer = useCallback(
		(next: LibraryItems): void => {
			if (server.holds(next)) {
				return;
			}
			server.record(next);
			setItems(next);
		},
		[server],
	);

	return {
		items,
		pending,
		busy,
		error,
		acceptInstall,
		declineInstall,
		dismissError,
		reportFromPane,
		applyFromServer,
	};
}

export { useLibrary, type LibraryController, type LibraryOptions, type PendingInstall };
