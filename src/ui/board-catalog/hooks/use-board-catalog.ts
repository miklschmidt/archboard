// The board listing as the shell reads it, and the events that make it stale.
// One subscription to each half, one composition, and the named invalidations
// the application calls when something it heard could have changed a board.

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { composeListing, listingError } from "@/ui/board-catalog/listing";
import {
	boardCatalogKeys,
	paneInventoryQuery,
	persistedBoardsQuery,
} from "@/ui/board-catalog/lib/queries";
import type { BoardListing } from "@/ui/types";

/** The listing, why it may be missing, and the ways it is made stale. */
interface BoardCatalog {
	readonly listing: BoardListing;
	/** Why the navigator cannot show what it should, or null. */
	readonly error: string | null;
	/** The vault has not answered yet and nothing of it is in hand. */
	readonly loading: boolean;
	/** Read the listing again: what a board command or a pane report asks for. */
	readonly refresh: () => void;
	/** Read the listing and every server preview again: the navigator's refresh. */
	readonly reload: () => void;
	/**
	 * These boards have been written or stopped being worked on: their content,
	 * and anything the vault says about them, is worth reading again.
	 * @param boards The board keys.
	 */
	readonly boardsChanged: (boards: readonly string[]) => void;
	/**
	 * A pane's socket came back. Whatever changed while it was down changed
	 * without this tab hearing it, so everything cheap is read again and the
	 * previews of boards nobody holds are marked stale.
	 */
	readonly reconnected: () => void;
}

/**
 * Invalidate both halves of the listing.
 * @param client The cache.
 */
function invalidateListing(client: QueryClient): void {
	void client.invalidateQueries({ queryKey: boardCatalogKeys.persisted });
	void client.invalidateQueries({ queryKey: boardCatalogKeys.panes });
}

/**
 * Invalidate everything one board's key owns: its preview and its info.
 * @param client The cache.
 * @param board The board key.
 */
function invalidateBoard(client: QueryClient, board: string): void {
	void client.invalidateQueries({ queryKey: boardCatalogKeys.preview(board) });
	void client.invalidateQueries({ queryKey: boardCatalogKeys.info(board) });
}

/**
 * The invalidations, bound to one cache.
 * @param client The cache.
 * @returns The four commands, stable for that cache.
 */
function catalogCommands(
	client: QueryClient,
): Pick<BoardCatalog, "refresh" | "reload" | "boardsChanged" | "reconnected"> {
	/** Read the listing again. */
	function refresh(): void {
		invalidateListing(client);
	}
	/** Read the listing and every server preview again. */
	function reload(): void {
		invalidateListing(client);
		void client.invalidateQueries({ queryKey: boardCatalogKeys.previews });
	}
	/**
	 * These boards have changed.
	 * @param boards The board keys.
	 */
	function boardsChanged(boards: readonly string[]): void {
		if (boards.length === 0) {
			return;
		}
		invalidateListing(client);
		for (const board of boards) {
			invalidateBoard(client, board);
		}
	}
	/** A pane's socket came back. */
	function reconnected(): void {
		invalidateListing(client);
		void client.invalidateQueries({ queryKey: boardCatalogKeys.previews });
		void client.invalidateQueries({ queryKey: boardCatalogKeys.infos });
	}
	return { refresh, reload, boardsChanged, reconnected };
}

/**
 * The board listing and the ways it goes stale.
 * @returns The catalog.
 */
function useBoardCatalog(): BoardCatalog {
	const client = useQueryClient();
	const persisted = useQuery(persistedBoardsQuery());
	const panes = useQuery(paneInventoryQuery());
	const commands = useMemo(() => catalogCommands(client), [client]);
	const listing = useMemo(
		() => composeListing(persisted.data, panes.data),
		[persisted.data, panes.data],
	);
	const error = listingError(persisted.error, panes.error, panes.data !== undefined);
	return useMemo(
		() => ({ listing, error, loading: persisted.isPending, ...commands }),
		[listing, error, persisted.isPending, commands],
	);
}

export { useBoardCatalog, type BoardCatalog };
