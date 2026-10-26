import type { JSX, ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import {
	architectureModelQuery,
	hasNoCanonicalModel,
} from "#ui/clients/architecture-model/queries.ts";

interface EmptyBoardCatalogProps {
	vaults: readonly string[];
	children: ReactNode;
}

/**
 * An empty board listing must not invite board creation in a canonical vault.
 * @param props Empty vaults and the existing legacy guidance.
 * @returns Legacy guidance only after every vault confirms it has no model.
 */
function EmptyBoardCatalog(props: EmptyBoardCatalogProps): JSX.Element | null {
	const reads = useQueries({ queries: props.vaults.map(architectureModelQuery) });
	if (
		reads.some((read) => read.data === undefined || read.isError || !hasNoCanonicalModel(read.data))
	)
		return null;
	return <>{props.children}</>;
}

export { EmptyBoardCatalog };
