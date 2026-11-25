import { useRouterState } from "@tanstack/react-router";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { useRepositories } from "#ui/panes/model-catalog/hooks/use-repositories.ts";

/**
 * A portable repository address resolves through the repositories the server sends the tab.
 * @param fallback The server pane's vault when the address names no repository.
 * @param paneId The addressed pane.
 * @returns The requested vault or an explicit loading or unavailable outcome.
 */
function useModelVault(fallback: string, paneId: string) {
	const repository = useRouterState({
		/**
		 * Read only this pane's portable repository intent.
		 * @param state The shared router state.
		 * @returns Its explicit repository identity, or absence.
		 */
		select: (state) => state.location.search[`repo${paneId}`] ?? null,
	});
	const listed = useRepositories();
	const listing = listed.repositories;
	const resolved = resolveVault(fallback, repository, listing);
	return {
		...resolved,
		error: resolved.error ?? listed.error,
		loading: listed.loading,
		repository: repository ?? listing?.find((entry) => entry.vault === fallback)?.name ?? null,
	};
}

/**
 * An unavailable named repository never falls back to the server pane's repository.
 * @param fallback The pane's initial vault.
 * @param repository The explicit portable identity or absence.
 * @param listing The shared registry result.
 * @returns The selected vault or a recovery explanation.
 */
function resolveVault(
	fallback: string,
	repository: string | null,
	listing: readonly RepositoryEntry[] | undefined,
) {
	if (repository === null) return { vault: fallback, error: null };
	if (listing === undefined) return { vault: null, error: null };
	const entry = listing.find((candidate) => candidate.name === repository);
	if (entry?.state === "ready" && entry.vault !== null) return { vault: entry.vault, error: null };
	return {
		vault: null,
		error: `Repository ${repository} is unavailable. Register or choose its checkout, and it opens here.`,
	};
}

export { useModelVault };
