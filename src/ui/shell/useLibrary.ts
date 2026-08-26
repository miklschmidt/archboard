// The library, as a piece of shell state.
//
// It sits here rather than in a pane for the same reason board identity does:
// there is one library behind however many canvases are on screen, and the
// install prompt is chrome. A pane receives the items and reports back what
// Excalidraw made of them; it never owns them.
//
// Where they actually live is the server (ADR 0007). That is the whole reason
// this hook talks to `/api/library` instead of `localStorage`: a second pane, a
// second tab, the Flip and a laptop all reach the same canvas server, and an
// agent can read what is in the palette. The costs are the ones any shared
// store has — the library is only as durable as the vault, and two tabs editing
// it at once is last-write-wins.

import { useCallback, useEffect, useRef, useState } from "react";
import { getLibraryItemsHash, mergeLibraryItems } from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { fetchLibrary, putLibrary } from "../canvas/api";
import { clearLibraryHash, fetchLibraryFrom, pendingLibraryUrl } from "./addLibrary";

/** A library fetched and waiting on the human's yes. */
export interface PendingInstall {
	/** Where it came from, said the way the dialog says it. */
	host: string;
	name: string;
	items: LibraryItems;
}

export interface LibraryController {
	items: LibraryItems;
	pending: PendingInstall | null;
	/** Fetching or writing. The dialog disables itself on it. */
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

function libraryName(url: URL): string {
	const file = url.pathname.split("/").findLast(Boolean) ?? "library";
	return file.replace(/\.excalidrawlib$/, "").replace(/[-_]/g, " ");
}

export function useLibrary(): LibraryController {
	const [items, setItems] = useState<LibraryItems>([]);
	const [pending, setPending] = useState<PendingInstall | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Whether the server's copy has ever been read. Nothing is written before it
	// has: a failed read leaves the panes with an empty library, and treating
	// that emptiness as the human's intent would delete the palette.
	const loadedRef = useRef(false);
	// What the server is believed to hold. Every skip decision is made on this
	// rather than on a client id, so a write, its own broadcast, and the same
	// change reported by a second pane all settle without an echo.
	const serverHashRef = useRef(0);

	const persist = useCallback(async (next: LibraryItems): Promise<void> => {
		if (!loadedRef.current) return;
		serverHashRef.current = getLibraryItemsHash(next);
		try {
			await putLibrary(next);
		} catch (failure) {
			setError(`The library could not be saved: ${(failure as Error).message}`);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		void fetchLibrary()
			.then((result) => {
				if (cancelled) return;
				serverHashRef.current = getLibraryItemsHash(result.items);
				loadedRef.current = true;
				setItems(result.items);
			})
			.catch((failure) => {
				if (cancelled) return;
				setError(`The library could not be read: ${(failure as Error).message}`);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// ─── #addLibrary= ───────────────────────────────────────────
	//
	// Both entry points matter. A cold load carries the hash when the library
	// site opened a new tab; a hashchange is the same trip landing back in the
	// tab that started it. The hash is cleared before anything is fetched, so a
	// reload never re-runs an install and a failure does not stick to the URL.

	const offer = useCallback(async (candidate: string): Promise<void> => {
		clearLibraryHash();
		setError(null);
		setBusy(true);
		try {
			const fetched = await fetchLibraryFrom(candidate);
			setPending({
				host: fetched.url.hostname,
				name: libraryName(fetched.url),
				items: fetched.items,
			});
		} catch (failure) {
			setError((failure as Error).message);
		} finally {
			setBusy(false);
		}
	}, []);

	useEffect(() => {
		const requested = pendingLibraryUrl();
		if (requested) void offer(requested);
		const onHashChange = (): void => {
			const next = pendingLibraryUrl();
			if (next) void offer(next);
		};
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, [offer]);

	const acceptInstall = useCallback((): void => {
		if (!pending) return;
		// Merge rather than replace: installing a library adds to the palette, and
		// items already present by id are not duplicated.
		const next = mergeLibraryItems(items, pending.items);
		setPending(null);
		setItems(next);
		void persist(next);
	}, [items, pending, persist]);

	const declineInstall = useCallback((): void => setPending(null), []);
	const dismissError = useCallback((): void => setError(null), []);

	const reportFromPane = useCallback(
		(next: LibraryItems): void => {
			if (!loadedRef.current) return;
			if (getLibraryItemsHash(next) === serverHashRef.current) return;
			setItems(next);
			void persist(next);
		},
		[persist],
	);

	const applyFromServer = useCallback((next: LibraryItems): void => {
		const hash = getLibraryItemsHash(next);
		if (hash === serverHashRef.current) return;
		serverHashRef.current = hash;
		loadedRef.current = true;
		setItems(next);
	}, []);

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
