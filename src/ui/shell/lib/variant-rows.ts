// Which variants a board lists under it, and in what order. They sit one
// depth in, before the boards it drills down to, in the order every list of a
// board's variants uses (variant-lifecycle): first the variant its name
// opens, then its other live variants, a draft nested under the variant it was
// derived from, so the list reads as a timeline with branches. The historical and shelved variants wait behind one Earlier
// row, newest first. A board lists its variants while it has more than one, so
// a board with a history opens whether or not a pane is on it. While a filter is
// on, a board lists the variants the filter finds directly under it, with no
// Earlier row. Pure.

import { listedBoard } from "@/ui/board-catalog";
import { sameBoardName } from "#web/ui/rules/semantic-board-canvas/board/address.ts";
import { boardRowId, earlierRowId, variantRowId } from "@/ui/shell/lib/row-ids";
import { matchIn } from "@/ui/shell/lib/text-match";
import type {
	EarlierRow,
	NavigatorRow,
	NavigatorRowInputs,
	PaneMark,
	RowPlace,
	Unscoped,
	VariantRow,
} from "@/ui/shell/types/navigator-rows";
import type { BoardListing, CatalogBoard, ListedVariant } from "@/ui/types";
import { variantOrder, variantRecedes } from "#web/ui/rules/variant-lifecycle/lifecycle.ts";

/** Where a board's variants go: their first depth, under the board's row. */
type VariantPlace = RowPlace & { readonly parentId: string };

/**
 * Whether a variant is live: the architecture that exists or a proposal for it.
 * @param variant The variant.
 * @returns True for a current or draft variant.
 */
function isLive(variant: ListedVariant): boolean {
	return !variantRecedes(variant.lifecycle);
}

/**
 * Whether a variant is a proposal.
 * @param variant The variant.
 * @returns True for a draft.
 */
function isDraft(variant: ListedVariant): boolean {
	return variant.lifecycle === "draft";
}

/**
 * Whether a pane shows a board.
 * @param pane The pane.
 * @param board The board.
 * @returns True when the pane shows it, in any variant.
 */
function paneOnBoard(pane: PaneMark, board: CatalogBoard): boolean {
	return pane.board !== null && sameBoardName(pane.board, board.name);
}

/**
 * Whether a board lists its variants when it is open: it has more than one.
 * @param board The board.
 * @returns True when its variants are listed while it is open.
 */
function listsVariants(board: CatalogBoard): boolean {
	return board.variants.length > 1;
}

/**
 * The listed variant a draft is nested under: the variant it was derived from,
 * so a proposal branches off what it proposes to change, and a draft off a
 * draft branches again.
 * @param variant The variant.
 * @param listed The ids of the variants listed with it.
 * @returns The parent's id, or null for a variant on the first level.
 */
function nestedUnder(variant: ListedVariant, listed: ReadonlySet<string>): string | null {
	const parent = variant.parentId;
	return isDraft(variant) && parent !== null && listed.has(parent) ? parent : null;
}

/**
 * One variant's row.
 * @param board The board.
 * @param variant The variant.
 * @param place Its depth and the row it sits under.
 * @returns The row.
 */
function variantRow(
	board: CatalogBoard,
	variant: ListedVariant,
	place: VariantPlace,
): Unscoped<VariantRow> {
	const id = variantRowId(variant.key);
	return { kind: "variant", id, ...place, board, variant, dimmed: false, match: null };
}

/**
 * Variants as rows, each draft under the listed draft it was derived from.
 * @param board The board.
 * @param variants The variants, in order.
 * @param at The depth of the first level and the row they sit under.
 * @returns The rows.
 */
function nestedVariants(
	board: CatalogBoard,
	variants: readonly ListedVariant[],
	at: VariantPlace,
): Unscoped<VariantRow>[] {
	const listed = new Set(variants.map((variant) => variant.id));
	const rows: Unscoped<VariantRow>[] = [];
	/**
	 * List the variants under one parent and, after each, those derived from it.
	 * @param parent The parent variant's id, or null for the first level.
	 * @param place Their depth and the row they sit under.
	 */
	const walk = (parent: string | null, place: VariantPlace): void => {
		for (const variant of variants.filter((one) => nestedUnder(one, listed) === parent)) {
			const row = variantRow(board, variant, place);
			rows.push(row);
			walk(variant.id, { depth: place.depth + 1, parentId: row.id });
		}
	};
	walk(null, at);
	return rows;
}

/**
 * The Earlier row of a board and, when open, the variants it gathers.
 * @param inputs The inputs.
 * @param board The board.
 * @param earlier Its historical and shelved variants, newest first.
 * @param at The row's depth and the board's row.
 * @returns The rows.
 */
function earlierRows(
	inputs: NavigatorRowInputs,
	board: CatalogBoard,
	earlier: readonly ListedVariant[],
	at: VariantPlace,
): Unscoped<NavigatorRow>[] {
	if (earlier.length === 0) return [];
	const id = earlierRowId(board);
	const expanded = inputs.expanded(id);
	const row: Unscoped<EarlierRow> = {
		kind: "earlier",
		id,
		...at,
		board,
		count: earlier.length,
		expanded,
		dimmed: false,
		match: null,
	};
	const inside = { depth: at.depth + 1, parentId: id };
	return [row, ...(expanded ? earlier.map((variant) => variantRow(board, variant, inside)) : [])];
}

/**
 * The variants the filter finds on a board, each with its match marked.
 * @param inputs The inputs.
 * @param board The board.
 * @param at The depth of the first level and the board's row.
 * @returns The rows.
 */
function foundVariantRows(
	inputs: NavigatorRowInputs,
	board: CatalogBoard,
	at: VariantPlace,
): Unscoped<NavigatorRow>[] {
	const found = board.variants.filter((variant) => matchIn(variant.name, inputs.query) !== null);
	return nestedVariants(board, variantOrder(found, board.opens), at).map((row) => ({
		...row,
		match: matchIn(row.variant.name, inputs.query),
	}));
}

/**
 * The variants listed under an open board: those the filter finds while one
 * is on, else its live variants and its Earlier row when it lists them.
 * @param inputs The inputs.
 * @param board The board.
 * @param at The depth of the first level and the board's row.
 * @returns The rows.
 */
function variantRows(
	inputs: NavigatorRowInputs,
	board: CatalogBoard,
	at: VariantPlace,
): Unscoped<NavigatorRow>[] {
	if (inputs.query.length > 0) return foundVariantRows(inputs, board, at);
	if (!listsVariants(board)) return [];
	const ordered = variantOrder(board.variants, board.opens);
	const earlier = ordered.filter((variant) => !isLive(variant));
	return [
		...nestedVariants(board, ordered.filter(isLive), at),
		...earlierRows(inputs, board, earlier, at),
	];
}

/**
 * The rows that must be open for a pane's reading to show: its board's row,
 * and the Earlier row holding its variant when that variant is historical or
 * shelved.
 * @param listing The listing.
 * @param pane The pane.
 * @returns The ids.
 */
function readingRowIds(listing: BoardListing, pane: PaneMark): string[] {
	if (pane.board === null) return [];
	const board = listedBoard(listing, pane.board);
	const variant = board?.variants.find((one) => one.key === pane.key);
	const earlier = board !== undefined && variant !== undefined && !isLive(variant);
	return earlier ? [boardRowId(pane.board), earlierRowId(board)] : [boardRowId(pane.board)];
}

export { listsVariants, paneOnBoard, readingRowIds, variantRows };
