// The board listing as the shell reads it, and the events that make it stale.
// One subscription to each half, one composition, and the named invalidations
// the application calls when something it heard could have changed a board.

import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";

import { composeListing, listingError } from "@/ui/board-catalog/listing";
import { boardCatalogKeys, paneInventoryQuery } from "@/ui/board-catalog/lib/queries";
import { semanticBoardKeys, semanticBoardListQuery } from "@/ui/semantic-board-canvas";
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
	 * Read the listing and every drawing of every board again: the navigator's
	 * refresh, and the one control a person has when something the shell reads
	 * has gone wrong.
	 */
	readonly reload: () => void;
	/**
	 * These boards have been written, or stopped being worked on: their pictures,
	 * and anything the vault says about them, are worth reading again. The
	 * listing is read again either way, so naming no board means just the listing.
	 * @param boards The board keys, which may be none.
	 */
	readonly boardsChanged: (boards: readonly string[]) => void;
	/**
	 * A pane's socket came back. Whatever moved while it was down moved without
	 * this tab hearing it, so everything the navigator shows is read again.
	 */
	readonly reconnected: () => void;
}

/**
 * Read these queries again, so that an event is answered from after it and
 * never by a request that was already on the wire before it.
 *
 * Cancelling first is what makes that true, and it is the whole mechanism.
 * A read already in flight carries an answer the server decided before the
 * event: a cache with nothing behind that key cannot restart it — asked to
 * refetch, it hands the same request back — and a query no one is reading
 * right now is skipped by a refetch altogether, so in both cases the stale
 * answer would land, clear the invalidation and count as fresh. A cancelled
 * read is reverted rather than failed: data already in hand stays on screen,
 * no error reaches a person, and the invalidation stands.
 * @param client The cache.
 * @param queryKey The queries to read again, by exact key or by prefix.
 * @returns Settles once the fresh read has been asked for.
 */
async function readAgain(client: QueryClient, queryKey: QueryKey): Promise<void> {
	await client.cancelQueries({ queryKey });
	await client.invalidateQueries({ queryKey });
}

/**
 * Read both halves of the listing again.
 * @param client The cache.
 */
function invalidateListing(client: QueryClient): void {
	void readAgain(client, semanticBoardKeys.boards);
	void readAgain(client, boardCatalogKeys.panes);
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
	/**
	 * Read the listing, every drawing, and every board document again. This is
	 * the one control a person has when something the shell reads has gone
	 * wrong, so it must reach every resource, not only the ones that failed
	 * loudly.
	 *
	 * The documents matter as much as the pictures and are easier to forget: a
	 * board's own document is what the inspector reads and what the variant and
	 * walkthrough controls are built from, and it is cached for as long as the
	 * tab is open. A board written while this tab was not being told — another
	 * canvas on the same vault, or a socket that was down — would come back with
	 * a fresh picture beside an inspector describing the board as it used to be.
	 */
	function reload(): void {
		invalidateListing(client);
		void readAgain(client, semanticBoardKeys.renders);
		void readAgain(client, semanticBoardKeys.documents);
	}
	/**
	 * These boards have been written, or stopped being worked on. The listing
	 * may have moved whether or not any board is named, so it is read again
	 * either way.
	 * @param boards The board keys, which may be none.
	 */
	function boardsChanged(boards: readonly string[]): void {
		invalidateListing(client);
		for (const board of boards) {
			void readAgain(client, semanticBoardKeys.boardRenders(board));
			void readAgain(client, semanticBoardKeys.document(board));
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
	const vault = useQuery(semanticBoardListQuery());
	const panes = useQuery(paneInventoryQuery());
	const commands = useMemo(() => catalogCommands(client), [client]);
	const listing = useMemo(() => composeListing(vault.data, panes.data), [vault.data, panes.data]);
	const error = listingError(vault.error, panes.error, panes.data !== undefined);
	return useMemo(
		() => ({ listing, error, loading: vault.isPending, ...commands }),
		[listing, error, vault.isPending, commands],
	);
}

export { catalogCommands as catalogCommandsFor, useBoardCatalog, type BoardCatalog };
