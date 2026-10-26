import type { JSX, ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import {
	architectureModelQuery,
	architectureCheckpointsQuery,
	hasNoCanonicalModel,
	hasNoCheckpoints,
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
	const reads = useQueries({ queries: props.vaults.map((vault) => architectureModelQuery(vault)) });
	const histories = useQueries({
		queries: props.vaults.map((vault, index) => {
			const read = reads[index];
			return {
				...architectureCheckpointsQuery(vault),
				enabled:
					read?.isError === true && read.data === undefined && hasNoCanonicalModel(read.error),
			};
		}),
	});
	if (
		reads.some((read) => read.data !== undefined || !hasNoCanonicalModel(read.error)) ||
		histories.some(
			(history) => history.data === undefined || history.isError || !hasNoCheckpoints(history.data),
		)
	)
		return null;
	return <>{props.children}</>;
}

export { EmptyBoardCatalog };
