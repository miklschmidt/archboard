// The query keys and options for what the browser reads back about which
// models exist and which panes are holding them. The options live here rather
// than at the call sites so a hook and an invalidation always name the same
// cache entry, and so each resource's freshness contract is written in one
// place.
//
// The vault's models are not read here: that listing belongs to the viewer
// module that also draws them, and this catalog subscribes to it rather than
// keeping a second copy under a second key.

import { queryOptions } from "@tanstack/react-query";

import { MODEL_CACHE_MS } from "@archboard/timing";
import { fetchRepositories } from "#ui/clients/model-catalog/repositories.ts";

/** The one root every catalog resource hangs under, so invalidation can sweep it. */
const CATALOG_KEY = "model-catalog";

/** The cache keys, spelled once. */
const modelCatalogKeys = {
	/** Everything this module caches. */
	all: [CATALOG_KEY] as const,
	/** What the live panes hold, across every tab. */
	panes: [CATALOG_KEY, "pane-inventory"] as const,
	/** The repositories of this machine, each with the vault of its chosen checkout. */
	repositories: [CATALOG_KEY, "repositories"] as const,
};

/**
 * The repositories of this machine.
 *
 * Read again when the tab comes back, because a command in a terminal can
 * register a checkout and nothing announces that. A checkout chosen from any
 * page is announced to every tab, which reads this again (ADR 0050).
 * @returns The query options.
 */
function repositoriesQuery() {
	return queryOptions({
		queryKey: modelCatalogKeys.repositories,
		/**
		 * Read the repositories.
		 * @param context The query's context, whose signal ends the read.
		 * @returns The listing.
		 */
		queryFn: (context) => fetchRepositories(context.signal),
		staleTime: MODEL_CACHE_MS.listingStale,
		refetchOnWindowFocus: "always",
	});
}

export { modelCatalogKeys, repositoriesQuery };
