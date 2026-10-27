import { useCallback } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import {
	architectureModelKeys,
	architectureModelQuery,
} from "#ui/clients/architecture-model/queries.ts";

/**
 * A comparison can depict removed definitions only from its exact identified base.
 * @param vault The explicit vault.
 * @param model The selected state and server-computed comparison.
 * @returns A coherent reference or an explicit comparison availability state.
 */
function useModelComparison(vault: string, model: Model) {
	const query = useQuery({
		...architectureModelQuery(
			vault,
			model.comparison?.checkpoint ?? null,
			comparisonSelection(model.comparison),
		),
		enabled: model.comparison !== undefined,
	});
	const client = useQueryClient();
	const refresh = useCallback((): void => {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
	}, [client, vault]);
	const status = referenceStatus(query, model);
	return {
		reference: status === "ready" ? query.data : undefined,
		status,
		error: query.error?.message,
		refresh,
	};
}

/**
 * Base reads materialize one state without recursively requesting another comparison.
 * @param comparison The exact runtime base metadata.
 * @returns Only the selectors needed by that base.
 */
function comparisonSelection(comparison: Model["comparison"]) {
	if (comparison === undefined) return {};
	if (comparison.checkpoint !== undefined) return { compare: false };
	if (comparison.against === null) return { compare: false };
	if (comparison.against.lifecycle === "current") return {};
	return { state: comparison.against.id, compare: false };
}

/**
 * Cached reference content is usable only when the comparison identifies its exact revision.
 * @param reference A complete base reading, when available.
 * @param selected The selected state and its comparison token.
 * @returns Whether the two responses form one coherent comparison.
 */
function coherentReference(reference: Model | undefined, selected: Model): boolean {
	if (reference === undefined || selected.comparison === undefined) return false;
	return (
		reference.manifest.id === selected.manifest.id &&
		sameBaseIdentity(reference, selected.comparison) &&
		reference.revision.digest === selected.comparison.revision.digest
	);
}

/**
 * Several materialized states can share the same complete input revision.
 * @param reference The separately read comparison content.
 * @param comparison The state and optional checkpoint selected by the runtime.
 * @returns Whether the content names the exact requested base.
 */
function sameBaseIdentity(reference: Model, comparison: NonNullable<Model["comparison"]>): boolean {
	if (reference.selectedState?.id !== comparison.against?.id) return false;
	return comparison.checkpoint === undefined || reference.checkpoint?.id === comparison.checkpoint;
}

/**
 * Distinguish missing transport, unfinished reads, and a base that changed between requests.
 * @param query The sole cached reference read.
 * @param model The selected coherent state.
 * @returns A user-visible comparison state, never substitute content.
 */
function referenceStatus(query: UseQueryResult<Model>, model: Model) {
	if (model.comparison === undefined) return "none";
	if (coherentReference(query.data, model)) return "ready";
	if (query.isError) return "unavailable";
	return query.isFetching || query.isPending ? "loading" : "changed";
}

export { useModelComparison };
