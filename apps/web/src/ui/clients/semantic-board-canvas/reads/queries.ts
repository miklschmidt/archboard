// The query options for the semantic-board resources the browser reads. As in
// the board-catalog behavior, the options live here rather than at the call
// sites, so each resource's freshness contract is written down once. Their keys
// are private to this module (`board-keys.ts`), and what makes them stale is
// `board-refresh.ts`'s to decide.

import { queryOptions } from "@tanstack/react-query";

import { BOARD_CACHE_MS } from "@archboard/timing";
import {
	fetchSemanticBoards,
	type ExposureSite,
	type SemanticBoardEntry,
	type SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { ReadingOnScreen } from "#ui/hooks/semantic-board-canvas/use-code-findings.ts";
import {
	sameBoardAsked,
	sameVaultAsked,
	semanticBoardKeys,
} from "#ui/clients/semantic-board-canvas/reads/board-keys.ts";
import { boardsListed } from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";
import { boardReads } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";
import { pictureSource } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import { readAgain } from "#ui/clients/semantic-board-canvas/reads/read-again.ts";

/** The one root every semantic resource hangs under, so a sweep can find it. */
const SEMANTIC_KEY = "semantic-board";

/** The cache keys, spelled once. */
const semanticBoardKeys = {
	/** Everything this module caches. */
	all: [SEMANTIC_KEY] as const,
	/**
	 * A vault's checked policy and diagnostics, which every picture of it is drawn under.
	 * @param vault The vault.
	 * @returns Its cache key.
	 */
	vaultCheck: (vault: string) => ["vault-check", vault] as const,
	/**
	 * What the last code pass found on each board of a vault it read, as the server remembers it.
	 * @param vault The vault.
	 * @returns Its cache key.
	 */
	codeFindings: (vault: string) => ["code-findings", vault] as const,
	/**
	 * What one container exposed in the pass that ran at one time: a new pass
	 * is a new key, so its names are read again and nothing is read on a timer.
	 * @param vault The vault.
	 * @param at The board, variant and container.
	 * @param checkedAt When the pass ran.
	 * @returns Its cache key.
	 */
	exposure: (vault: string, at: ExposureSite, checkedAt: string) =>
		["code-findings", vault, "exposure", at.board, at.variant, at.container, checkedAt] as const,
	/**
	 * Where one variant of one board changes in code, at one version of the
	 * board. Under a root of its own, so no sweep of the board's pictures or
	 * documents asks Git again.
	 * @param on The board, the variant by id and the version on screen.
	 * @returns Its cache key.
	 */
	locality: (on: ReadingOnScreen) =>
		["locality", on.vault, on.board, on.variant, on.version] as const,
	/** Every vault's semantic boards. */
	allBoards: [SEMANTIC_KEY, "boards"] as const,
	/**
	 * One vault's semantic boards.
	 * @param vault The vault.
	 * @returns Its cache key.
	 */
	boards: (vault: string) => [SEMANTIC_KEY, "boards", vault] as const,
	/** Every drawing of every board of every vault. */
	renders: [SEMANTIC_KEY, "render"] as const,
	/**
	 * Every drawing of one vault: what its policy changing makes stale.
	 * @param vault The vault.
	 * @returns Its render prefix.
	 */
	rendersIn: (vault: string) => [SEMANTIC_KEY, "render", vault] as const,
	/** Every board's own document, in every vault. */
	documents: [SEMANTIC_KEY, "document"] as const,
	/**
	 * Every drawing of one board, whichever variant and view it was asked in.
	 * This is the prefix a board's own change invalidates: the version moved for
	 * the whole board, so no picture of it is current any more.
	 * @param vault The vault the board is in.
	 * @param board The board name.
	 * @returns Its render prefix.
	 */
	boardRenders: (vault: string, board: string) => [SEMANTIC_KEY, "render", vault, board] as const,
	/**
	 * One board's own document, which inspection reads for what a picture does
	 * not carry. It is the same versioned board the drawing is of, so a change
	 * announcement makes both stale and has to invalidate both.
	 * @param vault The vault the board is in.
	 * @param board The board name.
	 * @returns Its cache key.
	 */
	document: (vault: string, board: string) => [SEMANTIC_KEY, "document", vault, board] as const,
	/**
	 * One drawing: a vault, a board, a variant and a view. Not a theme: a picture
	 * paints with the page's colour tokens, so one picture serves both themes and
	 * a theme switch asks for nothing.
	 * @param request What was asked for.
	 * @returns Its cache key.
	 */
	render: (request: SemanticRenderRequest) =>
		[
			SEMANTIC_KEY,
			"render",
			request.vault,
			request.board,
			request.variant ?? "",
			request.view ?? "",
			comparisonKey(request),
			request.layout ?? DEFAULT_LAYOUT_ENGINE,
		] as const,
};

/**
 * The version a cached document or picture is of, when it says.
 * @param data What the cache holds.
 * @returns The version, or nothing.
 */
function versionOf(data: unknown): number | undefined {
	if (typeof data !== "object" || data === null || !("version" in data)) return undefined;
	return typeof data.version === "number" ? data.version : undefined;
}

/**
 * Whether one cached reading is of another version than the listing says its board is at.
 * @param asked The board name the reading was asked by.
 * @param data What the cache holds for it.
 * @param boards The boards the server lists, with their versions.
 * @returns True when both say a version and the two differ.
 */
function readingMoved(
	asked: string,
	data: unknown,
	boards: readonly SemanticBoardEntry[],
): boolean {
	const held = versionOf(data);
	const listed = boards.find(
		(entry) => sameBoardName(asked, entry.key) || sameBoardName(asked, entry.name),
	)?.version;
	return held !== undefined && listed !== undefined && listed !== held;
}

/**
 * Read again every board of one vault whose cached document or picture is of
 * another version than the one the server lists.
 *
 * A pane hears of a write only to a board of the vault it is in, so nothing
 * tells this tab about a vault none of its panes is in: a board drawn ahead from
 * the navigator's listing, or left behind when a pane moved to another checkout.
 * Without this its old picture would be shown when somebody opens it.
 *
 * The readings are marked stale at once, so that the drawing ahead that follows
 * this listing draws them again rather than keeping them.
 * @param client The tab's cache.
 * @param vault The vault.
 * @param boards The boards the server lists there, with their versions.
 */
function readMovedBoardsAgain(
	client: QueryClient,
	vault: string,
	boards: readonly SemanticBoardEntry[],
): void {
	const cached = client.getQueryCache();
	const moved = new Set(
		[
			...cached.findAll({ queryKey: [...semanticBoardKeys.documents, vault] }),
			...cached.findAll({ queryKey: semanticBoardKeys.rendersIn(vault) }),
		].flatMap(({ queryKey: [, , , asked], state }) =>
			typeof asked === "string" && readingMoved(asked, state.data, boards) ? [asked] : [],
		),
	);
	for (const board of moved) {
		const queryKeys = [
			semanticBoardKeys.document(vault, board),
			semanticBoardKeys.boardRenders(vault, board),
		];
		for (const queryKey of queryKeys) {
			void client.invalidateQueries({ queryKey, refetchType: "none" });
		}
		void readAgain(client, queryKeys);
	}
}

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
			const listing = await fetchSemanticBoards(vault, context.signal);
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

/**
 * What one container exposed in the last pass that judged it (TASK-539.01):
 * asked when a person picks the container out, from the server's memory. The
 * pass time is in the key, so a newer pass reads again; nothing else does.
 * @param vault The vault.
 * @param at The board, variant and container.
 * @param checkedAt When the pass that the polled findings name ran.
 * @returns The query's options.
 */
function exposureQuery(vault: string, at: ExposureSite, checkedAt: string) {
	return queryOptions({
		queryKey: semanticBoardKeys.exposure(vault, at, checkedAt),
		/**
		 * Read the remembered exposure.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The reading, or null.
		 */
		queryFn: (context) => boardReads().exposure(vault, at, context.signal),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
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
 * nobody made. A failed read is not tried again by itself; the region offers
 * that to the person.
 *
 * The read is not cancelled when the person picks another part. The old pick's
 * subscription goes before the new one comes, so a read that a pick cancelled
 * would be asked again by the next, and the server would start its walk of Git
 * again for each pick. Instead a pick made while the read runs waits for it,
 * and a series of picks asks once (ADR 0045: a request that arrives during the
 * walk waits for it).
 *
 * A new version of the board is a new key, so the part on screen is read again
 * as the board now stands, which is what says whether a relationship joins two
 * parts. Its last answer stays on screen while that read runs, so a write by an
 * agent does not empty the region. An answer about another vault does not stay.
 * @param on The board, the variant by id and the version on screen.
 * @returns The query options.
 */
function localityQuery(on: ReadingOnScreen) {
	return queryOptions({
		queryKey: semanticBoardKeys.locality(on),
		/**
		 * Ask the server for the board's locality.
		 * @returns The answer.
		 */
		queryFn: () => boardReads().locality(on.vault, on.board, on.variant),
		/**
		 * The last answer, while this one is on its way, when it was of this
		 * vault: another checkout's history is not this one's.
		 * @param previous What the last query held, if anything.
		 * @param previousQuery The query that held it.
		 * @returns That, when it was of this vault.
		 */
		placeholderData: (previous, previousQuery) =>
			sameVaultAsked(previousQuery?.queryKey, on.vault) ? previous : undefined,
		staleTime: 0,
		refetchOnMount: true,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
	});
}

export {
	codeFindingsQuery,
	exposureQuery,
	localityQuery,
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
	semanticRenderQuery,
	vaultCheckQuery,
};
