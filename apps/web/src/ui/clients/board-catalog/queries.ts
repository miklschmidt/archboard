// The query keys and options for what the browser reads back about which
// boards exist and which panes are holding them. The options live here rather
// than at the call sites so a hook and an invalidation always name the same
// cache entry, and so each resource's freshness contract is written in one
// place.
//
// The vault's boards are not read here: that listing belongs to the viewer
// module that also draws them, and this catalog subscribes to it rather than
// keeping a second copy under a second key.

import { queryOptions } from "@tanstack/react-query";

import { BOARD_CACHE_MS } from "@archboard/timing";
import { fetchRepositories } from "#ui/clients/board-catalog/repositories.ts";
import { fetchPaneInventory } from "#ui/clients/pane-session/pane-requests.ts";

/** The one root every catalog resource hangs under, so invalidation can sweep it. */
const CATALOG_KEY = "board-catalog";

/** The cache keys, spelled once. */
const boardCatalogKeys = {
	/** Everything this module caches. */
	all: [CATALOG_KEY] as const,
	/** What the live panes hold, across every tab. */
	panes: [CATALOG_KEY, "pane-inventory"] as const,
	/** The repositories of this machine, each with the vault of its chosen checkout. */
	repositories: [CATALOG_KEY, "repositories"] as const,
};

/**
 * What the live panes hold, across every tab this server serves. Separate from
 * the vault on purpose: a pane inventory that cannot be read must not take the
 * listed boards down with it.
 *
 * Read again every time the tab comes back, stale or not. A pane belonging to
 * another tab can be closed while this one is in the background, and nothing
 * says so: this tab's own panes announce their retirement, another tab's
 * cannot. Coming back is the only moment that reliably precedes looking, and
 * settling for the stale-only default would leave a pane that has gone marked
 * as on screen for as long as somebody kept returning inside the window.
 * @returns The query options.
 */
function paneInventoryQuery() {
	return queryOptions({
		queryKey: boardCatalogKeys.panes,
		/**
		 * Read the live panes.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The pane inventory.
		 */
		queryFn: (context) => fetchPaneInventory(context.signal),
		staleTime: BOARD_CACHE_MS.listingStale,
		refetchOnWindowFocus: "always",
	});
}

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
		queryKey: boardCatalogKeys.repositories,
		/**
		 * Read the repositories.
		 * @param context The query's context, whose signal ends the read.
		 * @returns The listing.
		 */
		queryFn: (context) => fetchRepositories(context.signal),
		staleTime: BOARD_CACHE_MS.listingStale,
		refetchOnWindowFocus: "always",
	});
}

export { boardCatalogKeys, paneInventoryQuery, repositoriesQuery };
