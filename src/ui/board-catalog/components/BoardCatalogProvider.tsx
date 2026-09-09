// The one board cache a tab has, put where everything that reads a board
// resource can reach it.

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";

import { createBoardQueryClient } from "@/ui/board-catalog/lib/query-client";

/** What the provider wraps. */
interface BoardCatalogProviderProps {
	children: ReactNode;
}

/**
 * Provide the board cache to everything below it. The client is made once and
 * kept for the life of the tab, so a re-render never drops what was read.
 * @param props The children.
 * @returns The provider.
 */
function BoardCatalogProvider(props: BoardCatalogProviderProps): JSX.Element {
	const [client] = useState(createBoardQueryClient);
	return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>;
}

export { BoardCatalogProvider, type BoardCatalogProviderProps };
