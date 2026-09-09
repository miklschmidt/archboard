// The workspace the tab was opened on, read once. The panes are mounted from
// it, so a direct load puts both panes on screen in their first render rather
// than opening one and then adding the other.

import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import type { WorkspaceAddress } from "@/ui/board-routing/address";
import { addressFromSearch, validateWorkspaceSearch } from "@/ui/board-routing/search";

/**
 * The address in the URL when this tab loaded.
 * @returns The address, unchanged for the tab's life.
 */
function useOpeningAddress(): WorkspaceAddress {
	const search = useRouterState({
		/**
		 * The search parameters of the location the router is on.
		 * @param state The router state.
		 * @returns The parsed search.
		 */
		select: (state) => state.location.search,
	});
	return useState(() => addressFromSearch(validateWorkspaceSearch(search)))[0];
}

export { useOpeningAddress };
