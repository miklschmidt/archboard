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
	architectureSummaryQuery,
	type ModelSummary,
} from "#ui/clients/architecture-model/queries.ts";
import { boardCatalogKeys, repositoriesQuery } from "#ui/clients/board-catalog/queries.ts";

/** One repository and its current architecture authority. */
interface RepositoryModel {
	readonly repository: RepositoryEntry;
	readonly model?: ModelSummary["manifest"];
	readonly migrationRequired?: boolean;
	readonly error: string | null;
	readonly loading: boolean;
}

/** Repository discovery reads no model: the feed reports each vault's summary. */
interface ModelCatalog {
	readonly repositories: readonly RepositoryModel[];
	readonly error: string | null;
	readonly loading: boolean;
	readonly refresh: () => void;
	readonly reload: () => void;
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
	/** Refresh repository locations. A vault that this adds starts its own feed. */
	function reload(): void {
		void client.invalidateQueries({ queryKey: boardCatalogKeys.repositories });
	}
	return {
		refresh,
		reload,
		reconnected: reload,
		repositoriesChanged: reload,
	};
}

/**
 * Derive catalogue authority from what the feed reported.
 * @param results The summaries in repository order.
 * @returns Stable metadata, migration requirements, and explicit failures.
 */
function readSummaries(results: readonly UseQueryResult<ModelSummary>[]) {
	return results.map(({ data, isPending }) => ({
		...summaryRow(data ?? { failure: null }),
		pending: isPending,
	}));
}

/**
 * What a repository row shows of one summary.
 * @param summary What the feed reported.
 * @returns The identity and the refusal that the row names.
 */
function summaryRow(summary: ModelSummary) {
	const code = summary.failure?.code;
	return {
		model: summary.manifest,
		migrationRequired: code === "LEGACY_AUTHORITY",
		error:
			code === "LEGACY_AUTHORITY" || code === "MODEL_NOT_FOUND" ? null : visible(summary.failure),
	};
}

/**
 * The text of a refusal that a row must name.
 * @param failure The reported refusal, when any.
 * @returns Its text, or nothing.
 */
function visible(failure: ModelSummary["failure"]): string | null {
	return failure === null ? null : failure.error;
}

/**
 * Read repository summaries through the feed that follows every readable vault.
 * @returns Repository discovery and refresh actions without any model read.
 */
function useModelCatalog(): ModelCatalog {
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
		queries: readable.map((vault) => architectureSummaryQuery(vault)),
		combine: readSummaries,
	});
	const repositories = useMemo(
		() =>
			(entries ?? []).map((repository): RepositoryModel => {
				const empty = {
					repository,
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
					error: model.error,
					loading: model.pending,
				};
			}),
		[entries, readable, models],
	);
	return useMemo(
		() => ({
			repositories,
			error: listed.error?.message ?? null,
			loading: listed.isPending,
			...commands,
		}),
		[repositories, listed.error, listed.isPending, commands],
	);
}

export { useModelCatalog, type ModelCatalog, type RepositoryModel };
