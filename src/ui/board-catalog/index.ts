// The board catalog: which boards the vault holds and which of them the live
// panes are showing, cached in one place (TASK-167). It owns the cache keys,
// the per-resource freshness contract and the invalidations; consumers
// subscribe where they render.
//
// It does not own what an agent does to a board. Writes keep their command
// owners and their version checks (ADR 0022), the picture of a board is the
// viewer's, and claims, socket ordering, the workbench and voice are untouched
// by anything here.

export {
	BoardCatalogProvider,
	type BoardCatalogProviderProps,
} from "@/ui/board-catalog/components/BoardCatalogProvider";
export { createBoardQueryClient } from "@/ui/board-catalog/lib/query-client";
export { boardCatalogKeys, paneInventoryQuery } from "@/ui/board-catalog/lib/queries";
export {
	catalogCommandsFor,
	useBoardCatalog,
	type BoardCatalog,
} from "@/ui/board-catalog/hooks/use-board-catalog";
