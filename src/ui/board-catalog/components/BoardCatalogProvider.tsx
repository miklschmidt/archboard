// The one cache the browser keeps of what the server answered, and the
// defaults it keeps it under. There is exactly one of these per tab: the
// application mounts it above everything that reads a board resource.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { BOARD_CACHE_GC_MS } from "@/shared/timing/timing";

/**
 * A cache with this product's read defaults.
 *
 * Two of them are deliberately not the library's. Reads never retry: the
 * canvas server is on this machine, so a refusal is a fact rather than a
 * flutter, and the navigator already shows the reason with its own Refresh
 * beside it — three silent attempts with backoff would only delay that line.
 * Nothing refetches on focus by default either; the one resource that should
 * asks for it by name, because it is the only one cheap enough to be worth it.
 *
 * No board write goes through this cache. Writes keep their command owners,
 * their version checks and their refusal dialogs (ADR 0022), so there is no
 * automatic retry of a write and no second copy of what a person edited.
 * @returns A client for one tab.
 */
function createBoardQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				refetchOnWindowFocus: false,
				gcTime: BOARD_CACHE_GC_MS,
			},
		},
	});
}

/** What the provider wraps. */
interface BoardCatalogProviderProps {
	children: React.ReactNode;
}

/**
 * Provide the board cache to everything below it. The client is made once and
 * kept for the life of the tab, so a re-render never drops what was read.
 * @param props The children.
 * @returns The provider.
 */
function BoardCatalogProvider(props: BoardCatalogProviderProps): React.JSX.Element {
	const [client] = useState(createBoardQueryClient);
	return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>;
}

export { BoardCatalogProvider, createBoardQueryClient, type BoardCatalogProviderProps };
