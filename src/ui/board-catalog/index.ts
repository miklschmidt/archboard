// The board catalog: everything the browser reads back from the server about
// boards, cached in one place (TASK-167). The listing, the previews of boards
// no pane holds, and which boards are scratch. It owns the cache keys, the
// per-resource freshness contract and the invalidations; consumers subscribe
// where they render.
//
// It does not own what a person or an agent does to a board. Writes keep their
// command owners and their version checks (ADR 0022), a mounted pane's scene
// stays the pane's (ADR 0015), and claims, socket ordering, the workbench and
// voice are untouched by anything here.

export { BoardPreview, type BoardPreviewProps } from "@/ui/board-catalog/components/BoardPreview";
export {
	BoardCatalogProvider,
	type BoardCatalogProviderProps,
} from "@/ui/board-catalog/components/BoardCatalogProvider";
export { createBoardQueryClient } from "@/ui/board-catalog/lib/query-client";
export {
	boardCatalogKeys,
	boardInfoQuery,
	boardPreviewQuery,
	paneInventoryQuery,
	persistedBoardsQuery,
} from "@/ui/board-catalog/lib/queries";
export { useBoardCatalog, type BoardCatalog } from "@/ui/board-catalog/hooks/use-board-catalog";
export {
	useBoardPreviewSource,
	type BoardPreviewInputs,
} from "@/ui/board-catalog/hooks/use-board-preview-source";
export { useScratchBoards, type ScratchBoards } from "@/ui/board-catalog/hooks/use-scratch-boards";
