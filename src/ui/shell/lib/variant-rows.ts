// Which variants a board lists under it, and in what order. They sit one
// depth in, before the boards it drills down to: first the variant its name
// opens, then its other live variants as the board lists them, a draft nested
// under the draft it was derived from. The historical and shelved variants
// wait behind one Earlier row, newest first. A board lists its variants while
// it has more than one, and one of them is a proposal or a pane shows the
// board. While a filter is on, a board lists only the variants it finds. Pure.

import type { OutlineNode } from "@/ui/board-catalog";
import { boardRowId, earlierRowId, sameBoard, variantRowId } from "@/ui/shell/lib/row-ids";
import { matchIn } from "@/ui/shell/lib/text-match";
import type {
	EarlierRow,
	NavigatorRow,
	NavigatorRowInputs,
	PaneMark,
	Unplaced,
	VariantRow,
} from "@/ui/shell/types/navigator-rows";
import type { CatalogBoard, ListedVariant } from "@/ui/types";

/** Where a board's variants go: their first depth and the board's row. */
interface VariantPlace {
	readonly depth: number;
	readonly parentId: string;
}

/**
 * Whether a variant is live: the architecture that exists or a proposal for it.
 * @param variant The variant.
 * @returns True for a current or draft variant.
 */
function isLive(variant: ListedVariant): boolean {
	return variant.lifecycle === "current" || variant.lifecycle === "draft";
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
 * @param panes The panes.
 * @param board The board.
 * @returns True when some pane shows it.
 */
function shownInAPane(panes: readonly PaneMark[], board: CatalogBoard): boolean {
	return panes.some((pane) => sameBoard(pane.board, board.name));
}

/**
 * Whether a board lists its variants when it is open: it has more than one,
 * and one of them is a proposal or a pane shows the board.
 * @param panes The panes.
 * @param board The board.
 * @returns True when its variants are listed while it is open.
 */
function listsVariants(panes: readonly PaneMark[], board: CatalogBoard): boolean {
	return board.variants.length > 1 && (board.variants.some(isDraft) || shownInAPane(panes, board));
}

/**
 * A board's variants in the order they are listed: the one its name opens
 * first, then the other live ones as the board lists them, then the earlier
 * ones newest first.
 * @param board The board.
 * @param variants The variants to order.
 * @returns The ordered variants.
 */
function variantOrder(board: CatalogBoard, variants: readonly ListedVariant[]): ListedVariant[] {
	const live = variants.filter(isLive);
	const opened = live.filter((variant) => variant.id === board.opens);
	const others = live.filter((variant) => variant.id !== board.opens);
	return [...opened, ...others, ...variants.filter((variant) => !isLive(variant)).toReversed()];
}

/**
 * The listed draft a variant is nested under: the draft it was derived from.
 * @param variant The variant.
 * @param drafts The ids of the listed drafts.
 * @returns The parent's id, or null for a variant on the first level.
 */
function nestedUnder(variant: ListedVariant, drafts: ReadonlySet<string>): string | null {
	const parent = variant.parentId;
	return isDraft(variant) && parent !== null && drafts.has(parent) ? parent : null;
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
): Unplaced<VariantRow> {
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
): Unplaced<VariantRow>[] {
	const drafts = new Set(variants.filter(isDraft).map((variant) => variant.id));
	const rows: Unplaced<VariantRow>[] = [];
	/**
	 * List the variants under one parent and, after each, those derived from it.
	 * @param parent The parent variant's id, or null for the first level.
	 * @param place Their depth and the row they sit under.
	 */
	const walk = (parent: string | null, place: VariantPlace): void => {
		for (const variant of variants.filter((one) => nestedUnder(one, drafts) === parent)) {
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
): Unplaced<NavigatorRow>[] {
	if (earlier.length === 0) return [];
	const id = earlierRowId(board);
	const expanded = inputs.expanded(id);
	const row: Unplaced<EarlierRow> = {
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
): Unplaced<NavigatorRow>[] {
	const found = board.variants.filter((variant) => matchIn(variant.name, inputs.query) !== null);
	return nestedVariants(board, variantOrder(board, found), at).map((row) => ({
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
): Unplaced<NavigatorRow>[] {
	if (inputs.query.length > 0) return foundVariantRows(inputs, board, at);
	if (!listsVariants(inputs.panes, board)) return [];
	const ordered = variantOrder(board, board.variants);
	const earlier = ordered.filter((variant) => !isLive(variant));
	return [
		...nestedVariants(board, ordered.filter(isLive), at),
		...earlierRows(inputs, board, earlier, at),
	];
}

/**
 * The listed board a pane shows.
 * @param outline The outline, or a part of it.
 * @param name The board's name.
 * @returns The board, or undefined when it is not listed.
 */
function listedBoardIn(
	outline: readonly OutlineNode<CatalogBoard>[],
	name: string,
): CatalogBoard | undefined {
	for (const node of outline) {
		if (node.kind === "board" && sameBoard(name, node.board.name)) return node.board;
		const found = listedBoardIn(node.children, name);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The rows that must be open for a pane's reading to show: its board's row,
 * and the Earlier row holding its variant when that variant is historical or
 * shelved.
 * @param outline The outline.
 * @param pane The pane.
 * @returns The ids.
 */
function readingRowIds(outline: readonly OutlineNode<CatalogBoard>[], pane: PaneMark): string[] {
	if (pane.board === null) return [];
	const board = listedBoardIn(outline, pane.board);
	const variant = board?.variants.find((one) => one.key === pane.key);
	const earlier = board !== undefined && variant !== undefined && !isLive(variant);
	return earlier ? [boardRowId(pane.board), earlierRowId(board)] : [boardRowId(pane.board)];
}

export { listsVariants, readingRowIds, variantRows };
