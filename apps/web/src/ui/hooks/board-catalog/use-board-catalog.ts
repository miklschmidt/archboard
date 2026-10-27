import { useEffect, useMemo } from "react";
import {
	useQueries,
	useQuery,
	useQueryClient,
	type QueryClient,
	type UseQueryResult,
} from "@tanstack/react-query";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { architectureFeed } from "#ui/clients/architecture-model/events.ts";
import {
	architectureModelKeys,
	architectureModelQuery,
	ArchitectureReadError,
	hasNoCanonicalModel,
} from "#ui/clients/architecture-model/queries.ts";
import { boardCatalogKeys, repositoriesQuery } from "#ui/clients/board-catalog/queries.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { EMPTY_LISTING } from "#ui/rules/board-catalog/listing.ts";
import type { BoardListing } from "#ui/rules/pane-session/session-types.ts";

/** One repository and its current architecture authority. */
interface RepositoryBoards {
	readonly repository: RepositoryEntry;
	readonly model?: Model["manifest"] | undefined;
	readonly migrationRequired?: boolean;
	readonly listing: BoardListing;
	readonly error: string | null;
	readonly loading: boolean;
}

/** Repository discovery and invalidation share the existing content cache. */
interface BoardCatalog {
	readonly repositories: readonly RepositoryBoards[];
	readonly served: string | null;
	readonly error: string | null;
	readonly loading: boolean;
	readonly refresh: () => void;
	readonly reload: () => void;
	readonly boardsChanged: (vault: string, boards: readonly string[]) => void;
	readonly reconnected: () => void;
	readonly repositoriesChanged: () => void;
}

/**
 * Refresh architecture through its sole query owner.
 * @param client The shared query cache.
 * @returns Stable catalogue invalidation actions.
 */
function catalogCommands(client: QueryClient) {
	/** Refresh every known canonical model. */
	function refresh(): void {
		void client.invalidateQueries({ queryKey: architectureModelKeys.all });
	}
	/** Refresh repository locations and their canonical readings together. */
	function reload(): void {
		void client.invalidateQueries({ queryKey: boardCatalogKeys.repositories });
		refresh();
	}
	/**
	 * Existing pane news names the affected vault.
	 * @param vault The explicit architecture vault.
	 */
	function changed(vault: string): void {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
	}
	return {
		refresh,
		reload,
		reconnected: reload,
		repositoriesChanged: reload,
		boardsChanged: changed,
	};
}

/**
 * Derive catalogue authority without fetching live legacy content.
 * @param results The public reads in repository order.
 * @returns Stable metadata, migration requirements, and explicit failures.
 */
function readModels(results: readonly UseQueryResult<Model>[]) {
	return results.map((result) => ({
		model: result.data?.manifest,
		migrationRequired:
			result.error instanceof ArchitectureReadError &&
			result.error.failure.code === "LEGACY_AUTHORITY",
		error: hasNoCanonicalModel(result.error) ? null : result.error,
		pending: result.isPending,
	}));
}

/**
 * Read canonical repository summaries through the same queries and feed as open panes.
 * @returns Repository discovery and refresh actions without legacy board reads.
 */
function useBoardCatalog(): BoardCatalog {
	const client = useQueryClient();
	const listed = useQuery(repositoriesQuery());
	const commands = useMemo(() => catalogCommands(client), [client]);
	const entries = listed.data?.repositories;
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
	const repositories = useMemo(
		() =>
			(entries ?? []).map((repository): RepositoryBoards => {
				const empty = {
					repository,
					listing: EMPTY_LISTING,
					migrationRequired: false,
					error: null,
					loading: false,
				};
				if (repository.vault === null) return empty;
				const model = models[readable.indexOf(repository.vault)]!;
				return {
					...empty,
					model: model.model,
					migrationRequired: model.migrationRequired,
					error: model.error?.message ?? null,
					loading: model.pending,
				};
			}),
		[entries, readable, models],
	);
	return useMemo(
		() => ({
			repositories,
			served: listed.data?.served ?? null,
			error: listed.error?.message ?? null,
			loading: listed.isPending,
			...commands,
		}),
		[repositories, listed.data, listed.error, listed.isPending, commands],
	);
}

/**
 * Canonical modules have no board catalogue projection.
 * @param _catalog The application catalogue.
 * @param _vault The pane's vault.
 * @returns The empty compatibility listing for remaining shared shell contracts.
 */
function boardsIn(
	_catalog: Pick<BoardCatalog, "repositories">,
	_vault: string | null,
): BoardListing {
	return EMPTY_LISTING;
}

export { boardsIn, useBoardCatalog, type BoardCatalog, type RepositoryBoards };
