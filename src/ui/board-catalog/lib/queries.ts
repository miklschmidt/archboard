// The query keys and options for every board resource the browser reads back
// from the server. The options live here rather than at the call sites so a
// hook and an invalidation always name the same cache entry, and so each
// resource's freshness contract is written in one place. The return types are
// inferred from `queryOptions` on purpose: they carry the answer's type into
// every consumer, and spelling them again would only let them drift.

import { queryOptions } from "@tanstack/react-query";

import { BOARD_LISTING_STALE_MS, BOARD_PREVIEW_STALE_MS } from "@/shared/timing/timing";
import {
	fetchBoardInfo,
	fetchBoardPreview,
	fetchPaneInventory,
	fetchPersistedBoards,
} from "@/ui/canvas/api";

/** The one root every board resource hangs under, so invalidation can sweep it. */
const CATALOG_KEY = "board-catalog";

/** The cache keys, spelled once. */
const boardCatalogKeys = {
	/** Everything this module caches. */
	all: [CATALOG_KEY] as const,
	/** The vault's boards. */
	persisted: [CATALOG_KEY, "persisted-boards"] as const,
	/** What the live panes hold, across every tab. */
	panes: [CATALOG_KEY, "pane-inventory"] as const,
	/** Every server preview snapshot. */
	previews: [CATALOG_KEY, "board-preview"] as const,
	/**
	 * One board's server preview snapshot.
	 * @param board The board key.
	 * @returns Its cache key.
	 */
	preview: (board: string) => [CATALOG_KEY, "board-preview", board] as const,
	/** Every board's identity and save state. */
	infos: [CATALOG_KEY, "board-info"] as const,
	/**
	 * One board's identity and save state.
	 * @param board The board key.
	 * @returns Its cache key.
	 */
	info: (board: string) => [CATALOG_KEY, "board-info", board] as const,
};

/**
 * The vault's boards.
 *
 * Nothing on the server announces that the vault gained or lost a note, so
 * this is the one resource that reads itself again when the tab returns to
 * the foreground: an agent may have written a board while somebody was
 * reading code. Every other refresh is an event the shell already hears.
 * @returns The query options.
 */
function persistedBoardsQuery() {
	return queryOptions({
		queryKey: boardCatalogKeys.persisted,
		/**
		 * Read the vault.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The persisted listing.
		 */
		queryFn: (context) => fetchPersistedBoards(context.signal),
		staleTime: BOARD_LISTING_STALE_MS,
		refetchOnWindowFocus: true,
	});
}

/**
 * What the live panes hold, across every tab this server serves. Separate from
 * the vault on purpose: a pane inventory that cannot be read must not take the
 * listed boards down with it.
 *
 * Read again every time the tab comes back, stale or not. A pane belonging to
 * another tab can be closed while this one is in the background, and nothing
 * says so: this tab's own panes announce their retirement, another tab's
 * cannot. Coming back is the only moment that reliably precedes looking, and
 * settling for the stale-only default would leave a pane that has gone marked
 * as on screen for as long as somebody kept returning inside the window.
 * @returns The query options.
 */
function paneInventoryQuery() {
	return queryOptions({
		queryKey: boardCatalogKeys.panes,
		/**
		 * Read the live panes.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The pane inventory.
		 */
		queryFn: (context) => fetchPaneInventory(context.signal),
		staleTime: BOARD_LISTING_STALE_MS,
		refetchOnWindowFocus: "always",
	});
}

/**
 * One board's preview snapshot, as the server holds it.
 *
 * Never read again on focus: a preview is a whole scene plus its files, and
 * exporting it costs the tab real work. A board a pane holds is previewed
 * from that pane, so its consumer disables this query rather than racing it.
 * @param board The board key.
 * @returns The query options.
 */
function boardPreviewQuery(board: string) {
	return queryOptions({
		queryKey: boardCatalogKeys.preview(board),
		/**
		 * Read the snapshot.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The preview snapshot.
		 */
		queryFn: (context) => fetchBoardPreview(board, context.signal),
		staleTime: BOARD_PREVIEW_STALE_MS,
		refetchOnWindowFocus: false,
	});
}

/**
 * One board's identity and save state, which is how the shell knows a board is
 * scratch: a note nobody has named (ADR 0009).
 * @param board The board key.
 * @returns The query options.
 */
function boardInfoQuery(board: string) {
	return queryOptions({
		queryKey: boardCatalogKeys.info(board),
		/**
		 * Read the board's info.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The info.
		 */
		queryFn: (context) => fetchBoardInfo(board, context.signal),
		staleTime: BOARD_LISTING_STALE_MS,
		refetchOnWindowFocus: false,
	});
}

export {
	boardCatalogKeys,
	boardInfoQuery,
	boardPreviewQuery,
	paneInventoryQuery,
	persistedBoardsQuery,
};
