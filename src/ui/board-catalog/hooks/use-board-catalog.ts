// The board listing as the shell reads it, and the events that make it stale.
// One subscription to each half, one composition, and the named invalidations
// the application calls when something it heard could have changed a board.

import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
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
	/**
	 * Read the listing, every server preview and every board's name state
	 * again: the navigator's refresh, and the one control a person has when
	 * something the shell reads has gone wrong.
	 */
	readonly reload: () => void;
	/**
	 * These boards have been written, or stopped being worked on: their content,
	 * and anything the vault says about them, is worth reading again. The listing
	 * is read again either way, so naming no board means just the listing.
	 * @param boards The board keys, which may be none.
	 */
	readonly boardsChanged: (boards: readonly string[]) => void;
	/**
	 * A pane's socket came back. Whatever moved while it was down moved without
	 * this tab hearing it, so everything the navigator shows is read again.
	 */
	readonly reconnected: () => void;
}

/** Reads one set of queries again, by exact key or by prefix. */
type ReadAgain = (queryKey: QueryKey) => void;

/**
 * Whether any of these queries is answering its very first read.
 * @param client The cache.
 * @param queryKey The queries, by exact key or by prefix.
 * @returns True while one is on the wire with nothing cached behind it.
 */
function firstReadPending(client: QueryClient, queryKey: QueryKey): boolean {
	return client
		.getQueryCache()
		.findAll({ queryKey })
		.some((query) => query.state.fetchStatus === "fetching" && query.state.data === undefined);
}

/**
 * The way this module makes an event produce an answer from after it, rather
 * than one that was already on the wire before it.
 *
 * A cache that holds nothing for a key cannot restart the read that is filling
 * it: it hands back the request already in flight, and that answer — which the
 * server decided before the event happened — lands as fresh with the
 * invalidation cleared. So a read that had not answered yet when an event
 * arrived is invalidated once more as soon as it does. A query with an answer
 * in hand restarts on the first pass and is not touched again. A burst of
 * events against one unanswered read shares the single re-read they all want,
 * because every one of them is satisfied by an answer asked for after the last
 * of them. Nothing is cancelled, so no cancellation reaches a person's screen.
 * @param client The cache.
 * @returns The re-read, bound to that cache.
 */
function createReadAgain(client: QueryClient): ReadAgain {
	const promised = new Set<string>();
	/**
	 * Read one set of queries again.
	 * @param queryKey The queries, by exact key or by prefix.
	 */
	async function readAgain(queryKey: QueryKey): Promise<void> {
		if (!firstReadPending(client, queryKey)) {
			await client.invalidateQueries({ queryKey });
			return;
		}
		const pending = JSON.stringify(queryKey);
		if (promised.has(pending)) {
			return;
		}
		promised.add(pending);
		await client.invalidateQueries({ queryKey });
		promised.delete(pending);
		await client.invalidateQueries({ queryKey });
	}
	return (queryKey: QueryKey): void => {
		void readAgain(queryKey);
	};
}

/**
 * Read both halves of the listing again.
 * @param readAgain The cache's re-read.
 */
function invalidateListing(readAgain: ReadAgain): void {
	readAgain(boardCatalogKeys.persisted);
	readAgain(boardCatalogKeys.panes);
}

/**
 * Read everything one board's key owns again: its preview and its info.
 * @param readAgain The cache's re-read.
 * @param board The board key.
 */
function invalidateBoard(readAgain: ReadAgain, board: string): void {
	readAgain(boardCatalogKeys.preview(board));
	readAgain(boardCatalogKeys.info(board));
}

/**
 * The invalidations, bound to one cache.
 * @param client The cache.
 * @returns The four commands, stable for that cache.
 */
function catalogCommands(
	client: QueryClient,
): Pick<BoardCatalog, "refresh" | "reload" | "boardsChanged" | "reconnected"> {
	const readAgain = createReadAgain(client);
	/** Read the listing again. */
	function refresh(): void {
		invalidateListing(readAgain);
	}
	/**
	 * Read the listing and everything the navigator draws from it again: the
	 * previews, and whether each open board has a name. This is the one control
	 * a person has when something the shell reads has gone wrong, so it must
	 * reach every resource, not only the ones that failed loudly.
	 */
	function reload(): void {
		invalidateListing(readAgain);
		readAgain(boardCatalogKeys.previews);
		readAgain(boardCatalogKeys.infos);
	}
	/**
	 * These boards have been written, or stopped being worked on. The listing
	 * may have moved whether or not any board is named, so it is read again
	 * either way.
	 * @param boards The board keys, which may be none.
	 */
	function boardsChanged(boards: readonly string[]): void {
		invalidateListing(readAgain);
		for (const board of boards) {
			invalidateBoard(readAgain, board);
		}
	}
	/** A pane's socket came back. */
	function reconnected(): void {
		reload();
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
