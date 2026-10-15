// The board listing as the shell reads it, and the events that make it stale.
// One subscription to each half, one composition, and the named invalidations
// the application calls when something it heard could have changed a board.

import {
	useQueries,
	useQuery,
	useQueryClient,
	type QueryClient,
	type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import type { RepositoryEntry } from "@/shared/repositories/index";
import {
	composeListing,
	EMPTY_LISTING,
	listingError,
	type VaultHalf,
} from "@/ui/board-catalog/listing";
import { halfOf } from "@/ui/board-catalog/lib/vault-boards";
import {
	boardCatalogKeys,
	paneInventoryQuery,
	repositoriesQuery,
} from "@/ui/board-catalog/lib/queries";
import {
	boardAddressOf,
	onSemanticBoardChange,
	readAgain,
	semanticBoardKeys,
	semanticBoardListQuery,
	type SemanticBoardListing,
} from "@/ui/semantic-board-canvas";
import type { BoardListing, BrowserPaneListing } from "@/ui/types";

/** One repository, and the boards of its chosen checkout's vault. */
interface RepositoryBoards {
	readonly repository: RepositoryEntry;
	readonly listing: BoardListing;
	/** Why its boards cannot be shown, or null. */
	readonly error: string | null;
	/** Its vault has not answered yet and nothing of it is in hand. */
	readonly loading: boolean;
}

/** The repositories and their listings, why they may be missing, and the ways they go stale. */
interface BoardCatalog {
	/** Every repository the navigator lists, in the server's order. */
	readonly repositories: readonly RepositoryBoards[];
	/** The vault the server was started with, where a page opens; null until read. */
	readonly served: string | null;
	/**
	 * Why the navigator cannot show what it should, or null: the repositories,
	 * or which pane holds what, could not be read. A repository's own listing
	 * failure is its own.
	 */
	readonly error: string | null;
	/** The repositories have not answered yet and nothing of them is in hand. */
	readonly loading: boolean;
	/** Read the listings again: what a board command or a pane report asks for. */
	readonly refresh: () => void;
	/**
	 * Read the repositories, the listings and every drawing of every board
	 * again: the navigator's refresh, and the one control a person has when
	 * something the shell reads has gone wrong.
	 */
	readonly reload: () => void;
	/**
	 * These boards of one vault have been written, or stopped being worked on:
	 * their pictures, and anything the vault says about them, are worth reading
	 * again. The listing is read again either way, so naming no board means just
	 * the listing.
	 * @param vault The vault the boards are in.
	 * @param boards The board keys, which may be none.
	 */
	readonly boardsChanged: (vault: string, boards: readonly string[]) => void;
	/**
	 * A pane's socket came back. Whatever moved while it was down moved without
	 * this tab hearing it, so everything the navigator shows is read again.
	 */
	readonly reconnected: () => void;
	/** A checkout was chosen somewhere: the repositories are read again, and with them their boards. */
	readonly repositoriesChanged: () => void;
}

/**
 * Read every vault's listing and the panes again.
 * @param client The cache.
 */
function invalidateListing(client: QueryClient): void {
	void readAgain(client, [semanticBoardKeys.allBoards]);
	void readAgain(client, [boardCatalogKeys.panes]);
}

/**
 * The invalidations, bound to one cache.
 * @param client The cache.
 * @returns The commands, stable for that cache.
 */
function catalogCommands(
	client: QueryClient,
): Pick<
	BoardCatalog,
	"refresh" | "reload" | "boardsChanged" | "reconnected" | "repositoriesChanged"
> {
	/**
	 * Read the listings again. The repositories are not read: a chosen checkout
	 * is announced, and nothing a board command or a pane report does moves one.
	 */
	function refresh(): void {
		invalidateListing(client);
	}
	/**
	 * Read the repositories, the listings, every drawing, and every board
	 * document again. This is the one control a person has when something the
	 * shell reads has gone wrong, so it must reach every resource, not only the
	 * ones that failed loudly.
	 *
	 * The documents matter as much as the pictures and are easier to forget: a
	 * board's own document is what the inspector reads and what the variant and
	 * walkthrough controls are built from, and it is cached for as long as the
	 * tab is open. A board written while this tab was not being told — another
	 * Archboard server on the same vault, or a socket that was down — would come back with
	 * a fresh picture beside an inspector describing the board as it used to be.
	 */
	function reload(): void {
		void readAgain(client, [boardCatalogKeys.repositories]);
		invalidateListing(client);
		void readAgain(client, [semanticBoardKeys.documents, semanticBoardKeys.renders]);
	}
	/**
	 * These boards of one vault have been written, or stopped being worked on.
	 * The listing may have moved whether or not any board is named, so it is
	 * read again either way.
	 * @param vault The vault the boards are in.
	 * @param boards The board keys, which may be none. A key that names a
	 *   variant is of the whole board: the canvas caches a board by its name.
	 */
	function boardsChanged(vault: string, boards: readonly string[]): void {
		void readAgain(client, [semanticBoardKeys.boards(vault)]);
		void readAgain(client, [boardCatalogKeys.panes]);
		for (const key of boards) {
			const board = boardAddressOf(key)?.board ?? key;
			void readAgain(client, [
				semanticBoardKeys.document(vault, board),
				semanticBoardKeys.boardRenders(vault, board),
			]);
		}
	}
	/** A pane's socket came back. */
	function reconnected(): void {
		reload();
	}
	/** A checkout was chosen. */
	function repositoriesChanged(): void {
		void readAgain(client, [boardCatalogKeys.repositories]);
	}
	return { refresh, reload, boardsChanged, reconnected, repositoriesChanged };
}

/**
 * What each vault's listing query holds. A function of its own, so the cache
 * runs it again only when an answer changes rather than on every render.
 * @param results The listing queries, in the order of the repositories.
 * @returns Each vault's half, failure and whether it is still unread.
 */
function readVaults(
	results: readonly UseQueryResult<SemanticBoardListing>[],
): { half: VaultHalf | undefined; error: unknown; pending: boolean }[] {
	return results.map((result) => ({
		half: result.data === undefined ? undefined : halfOf(result.data),
		error: result.error,
		pending: result.isPending,
	}));
}

/** Stands for a pane inventory that is not read yet, as a key. */
const UNREAD_PANES = {};

/** Each listing, made once for each pair of halves, so a pane moving keeps the boards. */
const listings = new WeakMap<object, WeakMap<object, BoardListing>>();

/**
 * The listing of one vault's half and the panes, the same one for the same pair.
 * @param half The vault's half, or undefined while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The listing.
 */
function listingOf(
	half: VaultHalf | undefined,
	panes: BrowserPaneListing | undefined,
): BoardListing {
	if (half === undefined) return composeListing(undefined, panes);
	const byPanes = listings.get(half) ?? new WeakMap<object, BoardListing>();
	listings.set(half, byPanes);
	const key = panes ?? UNREAD_PANES;
	const kept = byPanes.get(key);
	if (kept !== undefined) return kept;
	const made = composeListing(half, panes);
	byPanes.set(key, made);
	return made;
}

/**
 * The repositories, the boards of each, and the ways they go stale.
 * @returns The catalog.
 */
function useBoardCatalog(): BoardCatalog {
	const client = useQueryClient();
	const listed = useQuery(repositoriesQuery());
	const panes = useQuery(paneInventoryQuery());
	const commands = useMemo(() => catalogCommands(client), [client]);
	// A board on screen moved to a new version — a state branched or accepted
	// under a claim that has not ended — so its vault's listing and which pane
	// holds what are read again with it.
	useEffect(
		() =>
			onSemanticBoardChange((vault) => {
				void readAgain(client, [semanticBoardKeys.boards(vault), boardCatalogKeys.panes]);
			}),
		[client],
	);
	const entries = listed.data?.repositories;
	// One listing for each repository with a vault to read. A repository with
	// none reads nothing: it has no query, so two of them never share one entry.
	const readable = useMemo(
		() => (entries ?? []).flatMap((entry) => (entry.vault === null ? [] : [entry.vault])),
		[entries],
	);
	const vaults = useQueries({
		queries: readable.map((vault) => semanticBoardListQuery(vault)),
		combine: readVaults,
	});
	const repositories = useMemo(
		() =>
			(entries ?? []).map((repository): RepositoryBoards => {
				const vault =
					repository.vault === null ? undefined : vaults[readable.indexOf(repository.vault)];
				return {
					repository,
					listing: listingOf(vault?.half, panes.data),
					error: listingError(vault?.error ?? null, null, true),
					loading: vault?.pending === true,
				};
			}),
		[entries, readable, vaults, panes.data],
	);
	// Which pane holds what is one answer for every repository, so its failure
	// is the navigator's and not each repository's.
	const error =
		listed.error === null
			? listingError(null, panes.error, panes.data !== undefined)
			: `The repositories could not be read: ${listed.error.message}`;
	const served = listed.data?.served ?? null;
	return useMemo(
		() => ({ repositories, served, error, loading: listed.isPending, ...commands }),
		[repositories, served, error, listed.isPending, commands],
	);
}

/**
 * The boards of one vault's repository, or none when no listed repository
 * reads that vault.
 * @param catalog The catalog.
 * @param vault The vault, or null for a pane the server has not placed yet.
 * @returns Its listing.
 */
function boardsIn(catalog: Pick<BoardCatalog, "repositories">, vault: string | null): BoardListing {
	const found = catalog.repositories.find(
		(each) => vault !== null && each.repository.vault === vault,
	);
	return found?.listing ?? EMPTY_LISTING;
}

export {
	boardsIn,
	catalogCommands as catalogCommandsFor,
	useBoardCatalog,
	type BoardCatalog,
	type RepositoryBoards,
};
