import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { use } from "react";

import type { DrillDown } from "@archboard/board/content";
import { usePaneVault } from "@/ui/semantic-board-canvas/hooks/use-pane-vault";
import {
	drillPlace,
	type DrillPlace,
	type RepositoryPlaces,
} from "@/ui/semantic-board-canvas/lib/drill-target";
import { semanticBoardListQuery } from "@/ui/semantic-board-canvas/lib/queries";
import type { SemanticBoardListing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { RepositoryPlacesContext } from "@/ui/semantic-board-canvas/lib/repository-places";

/**
 * Where a drill-down drawn in this pane's vault leads.
 * @param target What the node's drill-down names, or undefined for none.
 * @returns Where its board is, or undefined when there is no drill-down, or
 *   while the vault's own repository is not known yet for a link that names one.
 */
function useDrillPlace(target: DrillDown | undefined): DrillPlace | undefined {
	const vault = usePaneVault();
	const places = use(RepositoryPlacesContext);
	const listing = useQuery({
		...semanticBoardListQuery(vault),
		enabled: target?.repo !== undefined,
	});
	return target === undefined ? undefined : placeOnceKnown(target, listing, places);
}

/**
 * Where a drill-down leads, once the vault's own repository is known. A link
 * that names a repository waits for it, to compare it with.
 * @param target What the node's drill-down names.
 * @param listing The listing of the vault it is drawn in.
 * @param listing.data The listing, once it arrived.
 * @param listing.isError Whether it could not be read.
 * @param places The repositories this machine lists.
 * @returns Where its board is, or undefined while that is not known.
 */
function placeOnceKnown(
	target: DrillDown,
	listing: Pick<UseQueryResult<SemanticBoardListing>, "data" | "isError">,
	places: RepositoryPlaces,
): DrillPlace | undefined {
	const known = target.repo === undefined || listing.data !== undefined || listing.isError;
	return known ? drillPlace(target, listing.data?.repository, places) : undefined;
}

export { useDrillPlace };
