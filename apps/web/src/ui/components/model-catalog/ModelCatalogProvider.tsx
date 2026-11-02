// The one board cache a tab has, put where everything that reads a board
// resource can reach it.

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";

import { createModelQueryClient } from "#ui/clients/model-catalog/query-client.ts";

/** What the provider wraps. */
interface ModelCatalogProviderProps {
	children: ReactNode;
}

/**
 * Provide the board cache to everything below it. The client is made once and
 * kept for the life of the tab, so a re-render never drops what was read.
 * @param props The children.
 * @returns The provider.
 */
function ModelCatalogProvider(props: ModelCatalogProviderProps): JSX.Element {
	const [client] = useState(createModelQueryClient);
	return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>;
}

export { ModelCatalogProvider, type ModelCatalogProviderProps };
