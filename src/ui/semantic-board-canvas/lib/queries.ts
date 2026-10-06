// The query keys and options for the semantic-board resources the browser
// reads. As in `@/ui/board-catalog`, the options live here rather than at the
// call sites, so a subscription and an invalidation always name the same cache
// entry and each resource's freshness contract is written down once.

import { queryOptions } from "@tanstack/react-query";

import { DEFAULT_LAYOUT_ENGINE } from "@/shared/semantic-board/index";
import { VAULT_CHECK_POLL_MS } from "@/shared/timing/timing";
import {
	fetchSemanticBoards,
	type SemanticRenderRequest,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { ReadingOnScreen } from "@/ui/semantic-board-canvas/hooks/use-code-findings";
import { boardReads } from "@/ui/semantic-board-canvas/lib/board-reads";
import { pictureSource } from "@/ui/semantic-board-canvas/lib/picture-source";

/** The one root every semantic resource hangs under, so a sweep can find it. */
const SEMANTIC_KEY = "semantic-board";

/** The cache keys, spelled once. */
const semanticBoardKeys = {
	/** Everything this module caches. */
	all: [SEMANTIC_KEY] as const,
	/** The vault's checked policy and diagnostics, which every picture is drawn under. */
	vaultCheck: ["vault-check"] as const,
	/** What the last code pass found on each board it read, as the server remembers it. */
	codeFindings: ["code-findings"] as const,
	/**
	 * Where one variant of one board changes in code, at one version of the
	 * board. Under a root of its own, so no sweep of the board's pictures or
	 * documents asks Git again.
	 * @param on The board, the variant by id and the version on screen.
	 * @returns Its cache key.
	 */
	locality: (on: ReadingOnScreen) => ["locality", on.board, on.variant, on.version] as const,
	/** The vault's semantic boards. */
	boards: [SEMANTIC_KEY, "boards"] as const,
	/** Every drawing of every board. */
	renders: [SEMANTIC_KEY, "render"] as const,
	/** Every board's own document. */
	documents: [SEMANTIC_KEY, "document"] as const,
	/**
	 * Every drawing of one board, whichever variant and view it was asked in.
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
	 * One drawing: a board, a variant and a view. Not a theme: a picture
	 * paints with the page's colour tokens, so one picture serves both themes and
	 * a theme switch asks for nothing.
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
			request.comparison === false ? "plain" : "compared",
			request.layout ?? DEFAULT_LAYOUT_ENGINE,
		] as const,
};

/**
 * The vault's semantic boards.
 *
 * Read again when the tab comes back: nothing announces that the vault gained
 * a board, and an agent may have created one while somebody was reading code.
 * @returns The query options.
 */
function semanticBoardListQuery() {
	return queryOptions({
		queryKey: semanticBoardKeys.boards,
		/**
		 * Read the vault's semantic boards, and tell the picture source which
		 * versions they are at, so it can forget pictures of older ones and draw
		 * the boards ahead.
		 * @param context The query context, carrying this read's cancellation and the tab's cache.
		 * @returns The listing.
		 */
		queryFn: async (context) => {
			const listing = await fetchSemanticBoards(context.signal);
			pictureSource().listed?.(listing.boards, context.client);
			return listing;
		},
		refetchOnWindowFocus: true,
	});
}

/**
 * One variant of one board, drawn in this page, or by the server when the page
 * runs no renderer (`picture-source.ts`).
 *
 * This picture is derived from a versioned board, so the thing that makes it
 * out of date is a version we have been told about — never the passage of
 * time. A board that has not changed renders to the same bytes an hour later,
 * and drawing it again would cost a full layout and text measurement for a
 * picture identical to the one already on screen. So there
 * is deliberately no timer here: the cached drawing stays fresh until the
 * board announces a new version over the pane socket, which is what
 * `useSemanticBoardChanges` listens for. That is also why there is no duration
 * to put in `@/shared/timing` — the absence of one is the contract.
 *
 * A network reconnect is the one exception: while the tab was offline a change
 * could have been announced to nobody, so the picture is read again then.
 *
 * While another picture of the same board is being drawn — another variant,
 * or the same one through another view — the last picture stays as the
 * placeholder, so the pane can carry it into the next rather than dropping to
 * a skeleton between the two. Another board's picture is not kept here: there is
 * nothing of it to carry across, and a pane must not show one board under
 * another's name for even a request's length.
 *
 * A picture stays in the tab's cache for as long as the tab lives, whether or
 * not a pane shows it: one drawn ahead is there when somebody opens its board,
 * however long after, instead of being read back while the pane waits
 * (TASK-344). A key names a reading, not a version, so a board holds one
 * picture per reading however often it changes.
 * @param request The board, the variant and the view.
 * @returns The query options.
 */
function semanticRenderQuery(request: SemanticRenderRequest) {
	return queryOptions({
		queryKey: semanticBoardKeys.render(request),
		/**
		 * Draw it, in this page or by the server, whichever the page chose.
		 * @param context The query context, carrying the cache and this read's cancellation.
		 * @returns The drawing, or the news that there is nothing to draw.
		 */
		queryFn: (context) => pictureSource().draw(request, context.client, context.signal),
		/**
		 * The last picture of this board, while this one is on its way.
		 *
		 * Decided by the board the last query asked for, spelled exactly as this
		 * one asks: a reply names the board canonically and an address does not,
		 * and the two must not be compared.
		 * @param previous What the last query held, if anything.
		 * @param previousQuery The query that held it.
		 * @returns That, when it was of this board.
		 */
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[2] === request.board ? previous : undefined,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
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
		 * Read the board, from the server or wherever the page reads boards from.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The document, as the server holds it.
		 */
		queryFn: (context) => boardReads().document(board, context.signal),
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
		queryFn: (context) => boardReads().vaultCheck(context.signal),
		staleTime: VAULT_CHECK_POLL_MS,
		refetchInterval: VAULT_CHECK_POLL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

/**
 * What the last code pass found on each board it read (ADR 0046, TASK-367.24).
 *
 * One cache entry for the whole tab, whichever panes read it, re-read on the
 * vault check's timer: a pass runs when an agent asks for one, and nothing
 * announces that it ran. The route answers from the server's memory and never
 * starts a pass, so the timer costs a read of memory and never a reading of
 * code. An answer that did not change keeps its reference, so a pane draws its
 * marks again only when the findings move.
 *
 * A failed read leaves the marks as they were and is tried again on the next
 * tick: the findings are a hint beside the board, and a pane that cannot read
 * them still shows the board.
 * @returns The query options.
 */
function codeFindingsQuery() {
	return queryOptions({
		queryKey: semanticBoardKeys.codeFindings,
		/**
		 * Read the remembered findings.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The readings.
		 */
		queryFn: (context) => boardReads().codeFindings(context.signal),
		staleTime: VAULT_CHECK_POLL_MS,
		refetchInterval: VAULT_CHECK_POLL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

/**
 * Where change concentrates in one variant of one board (ADR 0045): asked when
 * somebody picks a part out, and never on a timer.
 *
 * The selection tab is drawn again for each pick, so each pick subscribes
 * anew, and an answer is stale at once: every pick asks the server, which
 * answers from its memory unless a checkout's HEAD moved, so a pick after a
 * commit reads the new history. Nothing else asks again: no interval, no
 * return to the tab and no reconnect, because each of those is a request
 * nobody made. A new version of the board is a new key, so the next read is of
 * the board as it now stands. A failed read is not tried again by itself; the
 * region offers that to the person.
 * @param on The board, the variant by id and the version on screen.
 * @returns The query options.
 */
function localityQuery(on: ReadingOnScreen) {
	return queryOptions({
		queryKey: semanticBoardKeys.locality(on),
		/**
		 * Ask the server for the board's locality.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The answer.
		 */
		queryFn: (context) => boardReads().locality(on.board, on.variant, context.signal),
		staleTime: 0,
		refetchOnMount: true,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
	});
}

export {
	codeFindingsQuery,
	localityQuery,
	semanticBoardKeys,
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
	semanticRenderQuery,
	vaultCheckQuery,
};
