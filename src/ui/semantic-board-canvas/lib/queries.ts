// The query keys and options for the three semantic-board resources the browser
// reads. As in `@/ui/board-catalog`, the options live here rather than at the
// call sites, so a subscription and an invalidation always name the same cache
// entry and each resource's freshness contract is written down once.

import { queryOptions } from "@tanstack/react-query";

import { VAULT_CHECK_POLL_MS } from "@/shared/timing/timing";
import {
	fetchSemanticBoardDocument,
	fetchSemanticBoards,
	fetchSemanticRender,
	fetchVaultCheck,
	type SemanticRenderRequest,
} from "@/ui/semantic-board-canvas/api/semantic-boards";

/** The one root every semantic resource hangs under, so a sweep can find it. */
const SEMANTIC_KEY = "semantic-board";

/** The cache keys, spelled once. */
const semanticBoardKeys = {
	/** Everything this module caches. */
	all: [SEMANTIC_KEY] as const,
	/** The vault's checked policy and diagnostics, which every picture is drawn under. */
	vaultCheck: ["vault-check"] as const,
	/** The vault's semantic boards. */
	boards: [SEMANTIC_KEY, "boards"] as const,
	/** Every drawing of every board. */
	renders: [SEMANTIC_KEY, "render"] as const,
	/** Every board's own document. */
	documents: [SEMANTIC_KEY, "document"] as const,
	/**
	 * Every drawing of one board, whichever variant and theme it was asked in.
	 * This is the prefix a board's own change invalidates: the version moved for
	 * the whole board, so no picture of it is current any more.
	 * @param board The board name.
	 * @returns Its render prefix.
	 */
	boardRenders: (board: string) => [SEMANTIC_KEY, "render", board] as const,
	/**
	 * One board's own document, which inspection reads for what a picture does
	 * not carry. It is the same versioned board the drawing is of, so a change
	 * announcement makes both stale and has to invalidate both.
	 * @param board The board name.
	 * @returns Its cache key.
	 */
	document: (board: string) => [SEMANTIC_KEY, "document", board] as const,
	/**
	 * One drawing: a board, a variant and a theme.
	 * @param request What was asked for.
	 * @returns Its cache key.
	 */
	render: (request: SemanticRenderRequest) =>
		[
			SEMANTIC_KEY,
			"render",
			request.board,
			request.variant ?? "",
			request.view ?? "",
			request.theme,
		] as const,
};

/**
 * The vault's semantic boards.
 *
 * Read again when the tab comes back, for the same reason the Excalidraw
 * listing is: nothing announces that the vault gained a board, and an agent
 * may have created one while somebody was reading code.
 * @returns The query options.
 */
function semanticBoardListQuery() {
	return queryOptions({
		queryKey: semanticBoardKeys.boards,
		/**
		 * Read the vault's semantic boards.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The listing.
		 */
		queryFn: (context) => fetchSemanticBoards(context.signal),
		refetchOnWindowFocus: true,
	});
}

/**
 * One variant of one board, drawn by the server.
 *
 * This picture is derived from a versioned board, so the thing that makes it
 * out of date is a version we have been told about — never the passage of
 * time. A board that has not changed renders to the same bytes an hour later,
 * and re-asking for it would cost the server a full layout and text
 * measurement for a picture identical to the one already on screen. So there
 * is deliberately no timer here: the cached drawing stays fresh until the
 * board announces a new version over the pane socket, which is what
 * `useSemanticBoardChanges` listens for. That is also why there is no duration
 * to put in `@/shared/timing` — the absence of one is the contract.
 *
 * A network reconnect is the one exception: while the tab was offline a change
 * could have been announced to nobody, so the picture is read again then.
 * @param request The board, the variant and the theme.
 * @returns The query options.
 */
function semanticRenderQuery(request: SemanticRenderRequest) {
	return queryOptions({
		queryKey: semanticBoardKeys.render(request),
		/**
		 * Ask the server to draw it.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The drawing, or the news that there is nothing to draw.
		 */
		queryFn: (context) => fetchSemanticRender(request, context.signal),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always" as const,
	});
}

/**
 * One board's whole document, as it is on disk.
 *
 * Inspection reads this rather than the picture, because a picture is a
 * reading of a board and not the board: a node's description is deliberately
 * not drawn, a code binding is not drawn, and a view that narrows what is drawn
 * must not narrow what a drawn subject can be asked about.
 *
 * Its freshness contract is the drawing's, for the same reason: both are
 * derived from one versioned board, so both stay fresh until that board
 * announces a new version, and neither is re-read on a timer.
 * @param board The board name.
 * @returns The query options.
 */
function semanticBoardDocumentQuery(board: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.document(board),
		/**
		 * Read the board.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The document, as the server holds it.
		 */
		queryFn: (context) => fetchSemanticBoardDocument(board, context.signal),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always" as const,
	});
}

/**
 * The vault's policy and diagnostics, as the shared checker reports them.
 *
 * Owned here rather than beside the diagnostics bell because a picture is
 * drawn under this policy and a pane names groups out of it: the policy is one
 * resource with two readers, and one cache entry serves both. It is re-read on
 * a timer, because the file it comes from is edited on disk by a person and
 * nothing announces that.
 * @returns The query options.
 */
function vaultCheckQuery() {
	return queryOptions({
		queryKey: semanticBoardKeys.vaultCheck,
		/**
		 * Read and validate the checker's answer.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The checked policy and diagnostics.
		 */
		queryFn: (context) => fetchVaultCheck(context.signal),
		staleTime: VAULT_CHECK_POLL_MS,
		refetchInterval: VAULT_CHECK_POLL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

export {
	semanticBoardKeys,
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
	semanticRenderQuery,
	vaultCheckQuery,
};
