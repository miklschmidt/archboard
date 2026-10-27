// The query options for the semantic-board resources the browser reads. As in
// the board-catalog behavior, the options live here rather than at the call
// sites, so each resource's freshness contract is written down once. Their keys
// are private to this module (`board-keys.ts`), and what makes them stale is
// `board-refresh.ts`'s to decide.

import { queryOptions } from "@tanstack/react-query";

import { BOARD_CACHE_MS } from "@archboard/timing";
import { type SemanticRenderRequest } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import {
	sameBoardAsked,
	semanticBoardKeys,
} from "#ui/clients/semantic-board-canvas/reads/board-keys.ts";
import { boardsListed } from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";
import { boardReads } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";
import { pictureSource } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";

/**
 * One vault's semantic boards.
 *
 * Read again when the tab comes back: nothing announces that the vault gained
 * a board, and an agent may have created one while somebody was reading code.
 * @param vault The vault.
 * @returns The query options.
 */
function semanticBoardListQuery(vault: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.boards(vault),
		/**
		 * Read the vault's semantic boards, read again what this tab holds of a
		 * board that has moved since, and tell the picture source which versions
		 * they are at, so it can forget pictures of older ones and draw the boards
		 * ahead.
		 * @param context The query context, carrying this read's cancellation and the tab's cache.
		 * @returns The listing.
		 */
		queryFn: async (context) => {
			const listing = await boardReads().listing(vault, context.signal);
			boardsListed(context.client, vault, listing.boards);
			pictureSource().listed?.(vault, listing.boards, context.client);
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
 * to put in `@archboard/timing` — the absence of one is the contract.
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
			sameBoardAsked(previousQuery?.queryKey, request) ? previous : undefined,
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
 * @param vault The vault the board is in.
 * @param board The board name.
 * @returns The query options.
 */
function semanticBoardDocumentQuery(vault: string, board: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.document(vault, board),
		/**
		 * Read the board, from the server or wherever the page reads boards from.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The document, as the server holds it.
		 */
		queryFn: (context) => boardReads().document(vault, board, context.signal),
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
 * @param vault The vault.
 * @returns The query options.
 */
function vaultCheckQuery(vault: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.vaultCheck(vault),
		/**
		 * Read and validate the checker's answer.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The checked policy and diagnostics.
		 */
		queryFn: (context) => boardReads().vaultCheck(vault, context.signal),
		staleTime: BOARD_CACHE_MS.vaultCheck,
		refetchInterval: BOARD_CACHE_MS.vaultCheck,
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
 * @param vault The vault.
 * @returns The query options.
 */
function codeFindingsQuery(vault: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.codeFindings(vault),
		/**
		 * Read the remembered findings.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The readings.
		 */
		queryFn: (context) => boardReads().codeFindings(vault, context.signal),
		staleTime: BOARD_CACHE_MS.vaultCheck,
		refetchInterval: BOARD_CACHE_MS.vaultCheck,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

export {
	codeFindingsQuery,
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
	semanticRenderQuery,
	vaultCheckQuery,
};
