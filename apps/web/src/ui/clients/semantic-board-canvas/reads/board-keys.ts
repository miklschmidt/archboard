// The cache keys of the semantic-board resources, spelled once, and the one
// place that reads a key back into what it names.
//
// Private to the reads module: the query options in `queries.ts` subscribe
// under these keys, and `board-refresh.ts` decides which of them go stale and
// in what order. Nothing outside `reads/` names a key or decodes one, so the
// layout can change here alone.

import type { QueryClient } from "@tanstack/react-query";

import { DEFAULT_LAYOUT_ENGINE } from "@archboard/board/render-reply";
import {
	comparisonKey,
	type SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { ReadingOnScreen } from "#ui/hooks/semantic-board-canvas/use-code-findings.ts";

/** The one root every semantic resource hangs under, so a sweep can find it. */
const SEMANTIC_KEY = "semantic-board";

/** The cache keys, spelled once. */
const semanticBoardKeys = {
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
	 * Every board's own document in one vault.
	 * @param vault The vault.
	 * @returns Its document prefix.
	 */
	documentsIn: (vault: string) => [SEMANTIC_KEY, "document", vault] as const,
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

/** One reading of one board this tab holds: its document, or one of its pictures. */
interface CachedReading {
	/** Which of the two it is. */
	readonly kind: "document" | "picture";
	/** The board name it was asked by, spelled as it was asked. */
	readonly asked: string;
	/** The view a picture was asked through, `""` for none; `""` for a document. */
	readonly view: string;
	/** What the cache holds for it, if anything. */
	readonly data: unknown;
}

/**
 * Every document and picture this tab holds of the boards of one vault, read
 * back from their keys.
 * @param client The tab's cache.
 * @param vault The vault.
 * @returns The readings, documents first.
 */
function cachedReadings(client: QueryClient, vault: string): CachedReading[] {
	const cache = client.getQueryCache();
	const documents = cache.findAll({ queryKey: semanticBoardKeys.documentsIn(vault) });
	const pictures = cache.findAll({ queryKey: semanticBoardKeys.rendersIn(vault) });
	return [
		...documents.flatMap(({ queryKey: [, , , asked], state }): CachedReading[] =>
			typeof asked === "string" ? [{ kind: "document", asked, view: "", data: state.data }] : [],
		),
		...pictures.flatMap(({ queryKey: [, , , asked, , view], state }): CachedReading[] =>
			typeof asked === "string"
				? [
						{
							kind: "picture",
							asked,
							view: typeof view === "string" ? view : "",
							data: state.data,
						},
					]
				: [],
		),
	];
}

/**
 * Whether the last query asked for the same board of the same vault, spelled exactly as this one.
 * @param previous The last query's key, if any.
 * @param request What this query asks for.
 * @returns True when a placeholder from it is of this board.
 */
function sameBoardAsked(
	previous: readonly unknown[] | undefined,
	request: Pick<SemanticRenderRequest, "vault" | "board">,
): boolean {
	return previous?.[2] === request.vault && previous[3] === request.board;
}

/**
 * Whether the last locality query asked about the same vault as this one.
 * @param previous The last query's key, if any.
 * @param vault The vault this one asks about.
 * @returns True when its answer is of this vault's history.
 */
function sameVaultAsked(previous: readonly unknown[] | undefined, vault: string): boolean {
	return previous?.[1] === vault;
}

export { cachedReadings, sameBoardAsked, sameVaultAsked, semanticBoardKeys, type CachedReading };
