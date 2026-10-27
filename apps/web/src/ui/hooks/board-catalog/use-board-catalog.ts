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
import { architectureFeed } from "#ui/clients/architecture-model/events.ts";
import {
	architectureModelQuery,
	ArchitectureReadError,
	hasNoCanonicalModel,
} from "#ui/clients/architecture-model/queries.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import {
	composeListing,
	EMPTY_LISTING,
	listingError,
	type VaultHalf,
} from "#ui/rules/board-catalog/listing.ts";
import { halfOf } from "#ui/rules/board-catalog/vault-boards.ts";
import { paneInventoryQuery, repositoriesQuery } from "#ui/clients/board-catalog/queries.ts";
import { onSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import {
	boardsChanged,
	listingsChanged,
	readEverythingAgain,
	repositoriesChanged,
} from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";
import { semanticBoardListQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { type SemanticBoardListing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardListing, BrowserPaneListing } from "#ui/rules/pane-session/session-types.ts";

/** One repository, and the boards of its chosen checkout's vault. */
interface RepositoryBoards {
	readonly model?: Model["manifest"] | undefined;
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
 * The commands, bound to one cache. Each reports what happened to the board
 * reads, which decide what goes stale and in what order.
 * @param client The cache.
 * @returns The commands, stable for that cache.
 */
function catalogCommands(
	client: QueryClient,
): Pick<
	BoardCatalog,
	"refresh" | "reload" | "boardsChanged" | "reconnected" | "repositoriesChanged"
> {
	/** A board command or a pane report: the listings and the panes. */
	function refresh(): void {
		void listingsChanged(client);
	}
	/** Everything, as a person asks for it and as a reconnected socket needs it. */
	function reload(): void {
		void readEverythingAgain(client);
	}
	/**
	 * Boards of one vault were written or let go.
	 * @param vault The vault the boards are in.
	 * @param boards The board keys, which may be none.
	 */
	function changed(vault: string, boards: readonly string[]): void {
		void boardsChanged(client, vault, boards);
	}
	/** A checkout was chosen. */
	function chosen(): void {
		void repositoriesChanged(client);
	}
	return {
		refresh,
		reload,
		boardsChanged: changed,
		reconnected: reload,
		repositoriesChanged: chosen,
	};
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

/**
 * Derive catalogue authority from the shared public architecture read.
 * @param results The canonical reads in repository order.
 * @returns Authority, metadata, and visible failures without copied architecture.
 */
function readModels(results: readonly UseQueryResult<Model>[]) {
	return results.map((result) => ({
		model: result.data?.manifest,
		legacy:
			result.error instanceof ArchitectureReadError &&
			result.error.failure.code === "LEGACY_AUTHORITY",
		error: hasNoCanonicalModel(result.error) ? null : result.error,
		pending: result.isPending,
	}));
}

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
				void boardsChanged(client, vault, []);
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
	useEffect(() => {
		const subscriptions = readable.map((vault) =>
			architectureFeed(client, vault).subscribe(() => {}),
		);
		return () => {
			for (const unsubscribe of subscriptions) unsubscribe();
		};
	}, [client, readable]);
	const models = useQueries({
		queries: readable.map((vault) => architectureModelQuery(vault)),
		combine: readModels,
	});
	const vaults = useQueries({
		queries: readable.map((vault, index) => ({
			...semanticBoardListQuery(vault),
			enabled: models[index]?.legacy === true,
		})),
		combine: readVaults,
	});
	const repositories = useMemo(
		() =>
			(entries ?? []).map((repository): RepositoryBoards => {
				const empty = {
					repository,
					listing: listingOf(undefined, panes.data),
					error: null,
					loading: false,
				};
				if (repository.vault === null) return empty;
				const index = readable.indexOf(repository.vault);
				const model = models[index]!;
				if (!model.legacy)
					return {
						...empty,
						model: model.model,
						error: model.error?.message ?? null,
						loading: model.pending,
					};
				const vault = vaults[index]!;
				return {
					...empty,
					listing: listingOf(vault.half, panes.data),
					error: listingError(vault.error, null, true),
					loading: vault.pending,
				};
			}),
		[entries, readable, models, vaults, panes.data],
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

export { boardsIn, useBoardCatalog, type BoardCatalog, type RepositoryBoards };
