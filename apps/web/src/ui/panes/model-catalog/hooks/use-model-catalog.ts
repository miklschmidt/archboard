import { useCallback, useEffect, useMemo } from "react";
import { useQueries, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { architectureFeed } from "#ui/architecture-drawing/model-reader/access/clients/events.ts";
import {
	invalidateModelQueries,
	architectureSummaryQuery,
	type ModelSummary,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { useRepositories } from "#ui/panes/model-catalog/hooks/use-repositories.ts";

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
	const listed = useRepositories();
	const refresh = useCallback((): void => void invalidateModelQueries(client), [client]);
	const entries = listed.repositories;
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
		() => ({ repositories, error: listed.error, loading: listed.loading, refresh }),
		[repositories, listed.error, listed.loading, refresh],
	);
}

export { useModelCatalog, type ModelCatalog, type RepositoryModel };
