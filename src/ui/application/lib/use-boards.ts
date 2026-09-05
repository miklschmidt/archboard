// The board listing and the navigator previews. The listing is read from the
// server; a preview of a board a pane holds is taken from that pane's mounted
// scene, and any other board's from the server's preview snapshot.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PANE_DEBOUNCE_MS } from "@/shared/timing/timing";
import { EMPTY_LISTING } from "@/ui/application/shell-view";
import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import { fingerprintMountedPreview, type PreviewSource } from "@/ui/board-preview";
import { fetchBoardPreview, fetchBoards } from "@/ui/canvas/api";
import type { BoardListing } from "@/ui/types";

/** The listing, the previews and the refresh. */
interface Boards {
	readonly listing: BoardListing;
	readonly error: string | null;
	readonly previews: Readonly<Record<string, PreviewSource | null>>;
	/** Read the listing again, and the previews of listed boards that have none yet. */
	readonly refresh: () => void;
	/** Read the listing and every preview no pane holds again: the navigator's refresh. */
	readonly reload: () => void;
	/** A pane's scene changed: preview the board it holds from that pane. */
	readonly previewMounted: (paneId: string) => void;
}

/** Where a preview goes. */
type SetPreview = (board: string, preview: PreviewSource) => void;

/**
 * Plain words for a failed listing.
 * @param failure What was thrown.
 * @returns The message.
 */
function failureMessage(failure: unknown): string {
	return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Preview the board one pane holds, from its mounted scene.
 * @param paneId The pane.
 * @param handles The pane sessions.
 * @param setPreview Where the preview goes.
 */
async function previewFromPane(
	paneId: string,
	handles: PaneHandles,
	setPreview: SetPreview,
): Promise<void> {
	const scene = handles.session(paneId)?.previewController.read() ?? null;
	if (scene === null) {
		return;
	}
	const fingerprint = await fingerprintMountedPreview(scene);
	setPreview(scene.board, {
		kind: "mounted",
		board: scene.board,
		fingerprint,
		elements: scene.elements,
		files: scene.files,
	});
}

/**
 * Preview a board from the server's snapshot; a failure leaves the last preview.
 * @param board The board key.
 * @param setPreview Where the preview goes.
 */
async function previewFromServer(board: string, setPreview: SetPreview): Promise<void> {
	try {
		setPreview(board, await fetchBoardPreview(board));
	} catch {
		// The navigator keeps whatever it showed; the next refresh tries again.
	}
}

/**
 * The listed boards whose server preview to read: those no pane holds, less
 * the ones already known when only missing previews are wanted.
 * @param listing The listing.
 * @param heldKeys The board keys the panes hold.
 * @param known The keys already previewed, or null to read every one.
 * @returns The keys to read.
 */
function previewsWanted(
	listing: BoardListing,
	heldKeys: ReadonlySet<string>,
	known: ReadonlySet<string> | null,
): string[] {
	return listing.boards
		.map((board) => board.key)
		.filter((key) => !heldKeys.has(key) && (known === null || !known.has(key)));
}

/**
 * The listing as the server holds it now.
 * @returns The listing, or the failure's words.
 */
async function readListing(): Promise<{ listing: BoardListing } | { error: string }> {
	try {
		return { listing: await fetchBoards() };
	} catch (failure) {
		return { error: `The board listing could not be read: ${failureMessage(failure)}` };
	}
}

/**
 * The board listing and previews.
 * @param handles The pane sessions, for mounted previews.
 * @param held The board keys the panes hold, in pane order.
 * @returns The boards.
 */
function useBoards(handles: PaneHandles, held: readonly string[]): Boards {
	const [listing, setListing] = useState<BoardListing>(EMPTY_LISTING);
	const [error, setError] = useState<string | null>(null);
	const [previews, setPreviews] = useState<Readonly<Record<string, PreviewSource | null>>>({});
	const generation = useRef(0);
	const timers = useRef(new Map<string, number>());
	// The keys as one string, so a fresh array with the same keys is the same dependency.
	const heldSignature = held.join("\n");

	const setPreview = useCallback<SetPreview>((board, preview) => {
		setPreviews((current) => ({ ...current, [board]: preview }));
	}, []);

	const known = useRef(new Set<string>());
	const read = useCallback(
		(everyPreview: boolean): void => {
			const request = ++generation.current;
			const heldKeys = new Set(heldSignature === "" ? [] : heldSignature.split("\n"));
			/** Read the listing and apply it while this request is the latest. */
			async function run(): Promise<void> {
				const result = await readListing();
				if (request !== generation.current) {
					return;
				}
				if ("error" in result) {
					setError(result.error);
					return;
				}
				setListing(result.listing);
				setError(null);
				const wanted = previewsWanted(
					result.listing,
					heldKeys,
					everyPreview ? null : known.current,
				);
				for (const key of wanted) {
					known.current.add(key);
					void previewFromServer(key, setPreview);
				}
			}
			void run();
		},
		[heldSignature, setPreview],
	);
	const refresh = useCallback((): void => read(false), [read]);
	const reload = useCallback((): void => read(true), [read]);

	const previewMounted = useCallback(
		(paneId: string): void => {
			const pending = timers.current.get(paneId);
			if (pending !== undefined) {
				window.clearTimeout(pending);
			}
			timers.current.set(
				paneId,
				window.setTimeout(() => {
					timers.current.delete(paneId);
					void previewFromPane(paneId, handles, setPreview);
				}, PANE_DEBOUNCE_MS),
			);
		},
		[handles, setPreview],
	);

	useEffect(() => {
		refresh();
	}, [refresh]);
	useEffect(() => {
		const owned = timers.current;
		return () => {
			for (const timer of owned.values()) {
				window.clearTimeout(timer);
			}
			owned.clear();
		};
	}, []);

	return useMemo(
		() => ({ listing, error, previews, refresh, reload, previewMounted }),
		[listing, error, previews, refresh, reload, previewMounted],
	);
}

export { useBoards, type Boards };
