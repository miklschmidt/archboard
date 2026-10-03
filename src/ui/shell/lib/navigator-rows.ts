// The rows the navigator draws, in order, from the vault's outline: which
// folders and boards are open, what the filter found, the variants of the
// boards on screen, which panes show what, and where an agent is working. One
// flat list, each row carrying its depth, so the tree is drawn and walked by
// the keyboard the same way. A board's variants come directly under it, one
// depth in, before the boards it drills down to (variant-rows). Pure: no React.

import type { OutlineBoardNode, OutlineFolder, OutlineNode } from "@/ui/board-catalog";
import { matchIn, type TextRange } from "@/ui/shell/lib/text-match";
import { listsVariants, paneOnBoard, variantRows } from "@/ui/shell/lib/variant-rows";
import type {
	BoardRow,
	FolderRow,
	NavigatorRow,
	NavigatorRowInputs,
	PaneMark,
	RowPlace,
	ShownRow,
	Unplaced,
} from "@/ui/shell/types/navigator-rows";
import type { AgentActivityEntry, CatalogBoard } from "@/ui/types";

/** A board node of the outline. */
type BoardNode = OutlineBoardNode<CatalogBoard>;

/**
 * The agent activity on one board.
 * @param inputs The inputs.
 * @param board The board.
 * @returns The activity, or null.
 */
function activityOn(inputs: NavigatorRowInputs, board: CatalogBoard): AgentActivityEntry | null {
	return inputs.activity[board.key] ?? inputs.activity[board.name.toLowerCase()] ?? null;
}

/**
 * Whether an agent works on any board at or under these nodes.
 * @param inputs The inputs.
 * @param nodes The nodes.
 * @returns True when some board has activity.
 */
function anyActivity(
	inputs: NavigatorRowInputs,
	nodes: readonly OutlineNode<CatalogBoard>[],
): boolean {
	return nodes.some(
		(node) =>
			(node.kind === "board" && activityOn(inputs, node.board) !== null) ||
			anyActivity(inputs, node.children),
	);
}

/**
 * Whether a board matches the filter by its name, folders or description.
 * @param node The board's node.
 * @param query The folded filter.
 * @returns The range in its label, a zero-length marker for a match elsewhere, or null.
 */
function boardMatch(node: OutlineNode<CatalogBoard>, query: string): TextRange | null {
	if (node.kind !== "board") return matchIn(node.name, query);
	const label = matchIn(node.label, query);
	if (label !== null) return label;
	const elsewhere = matchIn(node.board.name, query) ?? matchIn(node.board.description ?? "", query);
	return elsewhere === null ? null : { start: 0, end: 0 };
}

/**
 * Whether the filter finds one of a node's variants.
 * @param node The node.
 * @param query The folded filter.
 * @returns True when a variant of the board matches.
 */
function variantFound(node: OutlineNode<CatalogBoard>, query: string): boolean {
	return (
		node.kind === "board" &&
		node.board.variants.some((variant) => matchIn(variant.name, query) !== null)
	);
}

/**
 * Whether the filter finds anything at or under a node.
 * @param node The node.
 * @param query The folded filter.
 * @returns True when the node, one of its variants or a descendant matches.
 */
function reaches(node: OutlineNode<CatalogBoard>, query: string): boolean {
	return (
		boardMatch(node, query) !== null ||
		variantFound(node, query) ||
		node.children.some((child) => reaches(child, query))
	);
}

/**
 * Whether a node is open: a filter opens everything it reaches through.
 * @param inputs The inputs.
 * @param node The node.
 * @returns True when what is under it is listed.
 */
function isOpen(inputs: NavigatorRowInputs, node: OutlineNode<CatalogBoard>): boolean {
	return inputs.query.length > 0 || inputs.expanded(node.id);
}

/**
 * Whether a board has variants and none of them is current (ADR 0031).
 * @param board The board.
 * @returns True when nothing it describes is built.
 */
function unbuiltBoard(board: CatalogBoard): boolean {
	return (
		board.variants.length > 0 && board.variants.every((variant) => variant.lifecycle !== "current")
	);
}

/**
 * Whether a board row has a disclosure: while a filter is on, when anything
 * is listed under it; else when it drills down to a board or lists variants.
 * @param inputs The inputs.
 * @param node The board's node.
 * @param listed How many rows are listed under it.
 * @returns True when it opens and closes.
 */
function boardOpens(inputs: NavigatorRowInputs, node: BoardNode, listed: number): boolean {
	if (inputs.query.length > 0) return listed > 0;
	return node.children.length > 0 || listsVariants(node.board);
}

/**
 * The row of one board.
 * @param inputs The inputs.
 * @param node The board's node.
 * @param at Its depth and parent row.
 * @param listed How many rows are listed under it.
 * @returns The row.
 */
function boardRow(
	inputs: NavigatorRowInputs,
	node: BoardNode,
	at: RowPlace,
	listed: number,
): Unplaced<BoardRow> {
	const { board } = node;
	const open = isOpen(inputs, node);
	const match = inputs.query.length > 0 ? boardMatch(node, inputs.query) : null;
	const expandable = boardOpens(inputs, node, listed);
	return {
		kind: "board",
		id: node.id,
		...at,
		board,
		label: node.label,
		dimmed: inputs.query.length > 0 && match === null,
		match,
		expandable,
		expanded: open && expandable,
		drafts: board.variants.filter((variant) => variant.lifecycle === "draft").length,
		reading: inputs.panes.some((pane) => pane.active && paneOnBoard(pane, board)),
		activity: activityOn(inputs, board),
		innerActivity: !open && anyActivity(inputs, node.children),
		unbuilt: unbuiltBoard(board),
	};
}

/**
 * The rows of one board node and, when open, its variants and the boards under it.
 * @param inputs The inputs.
 * @param node The board's node.
 * @param at Its depth and parent row.
 * @returns The rows.
 */
function boardRows(
	inputs: NavigatorRowInputs,
	node: BoardNode,
	at: RowPlace,
): Unplaced<NavigatorRow>[] {
	const inside = { depth: at.depth + 1, parentId: node.id };
	const open = isOpen(inputs, node);
	const variants = open ? variantRows(inputs, node.board, inside) : [];
	const below = open ? nodeRows(inputs, node.children, inside) : [];
	return [boardRow(inputs, node, at, variants.length + below.length), ...variants, ...below];
}

/**
 * The rows of one folder node and, when open, everything in it.
 * @param inputs The inputs.
 * @param node The folder's node.
 * @param at Its depth and parent row.
 * @returns The rows.
 */
function folderRows(
	inputs: NavigatorRowInputs,
	node: OutlineFolder<CatalogBoard>,
	at: RowPlace,
): Unplaced<NavigatorRow>[] {
	const open = isOpen(inputs, node);
	const match = inputs.query.length > 0 ? matchIn(node.name, inputs.query) : null;
	const row: Unplaced<FolderRow> = {
		kind: "folder",
		id: node.id,
		...at,
		name: node.name,
		count: node.count,
		expanded: open,
		dimmed: inputs.query.length > 0 && match === null,
		match,
		innerActivity: !open && anyActivity(inputs, node.children),
	};
	const inside = { depth: at.depth + 1, parentId: node.id };
	return [row, ...(open ? nodeRows(inputs, node.children, inside) : [])];
}

/**
 * The rows of a list of sibling nodes, skipping what the filter does not reach.
 * @param inputs The inputs.
 * @param nodes The siblings.
 * @param at Their depth and parent row.
 * @returns The rows.
 */
function nodeRows(
	inputs: NavigatorRowInputs,
	nodes: readonly OutlineNode<CatalogBoard>[],
	at: RowPlace,
): Unplaced<NavigatorRow>[] {
	return nodes
		.filter((node) => inputs.query.length === 0 || reaches(node, inputs.query))
		.flatMap((node) =>
			node.kind === "board" ? boardRows(inputs, node, at) : folderRows(inputs, node, at),
		);
}

/**
 * Whether a row is something a pane can show, a board or a variant, rather
 * than a row that only gathers others, a folder or an Earlier row. Every place
 * that treats the two apart asks this.
 * @param row The row.
 * @returns True for a board or a variant row.
 */
function paneCanShow<Row extends Pick<NavigatorRow, "kind">>(
	row: Row,
): row is Extract<Row, { kind: "board" | "variant" }> {
	return row.kind === "board" || row.kind === "variant";
}

/**
 * The row that says what one pane shows: the variant's row where it is drawn,
 * else its board's row.
 * @param rows The rows.
 * @param pane The pane.
 * @returns The row's id, or null when neither is drawn.
 */
function paneRowId(rows: readonly Unplaced<NavigatorRow>[], pane: PaneMark): string | null {
	const shown = rows.filter(paneCanShow);
	const variant = shown.find((row) => row.kind === "variant" && row.variant.key === pane.key);
	const board = shown.find((row) => row.kind === "board" && paneOnBoard(pane, row.board));
	return (variant ?? board)?.id ?? null;
}

/**
 * Where each pane's letter and the selection go.
 * @param rows The rows.
 * @param panes The panes.
 * @returns The letters and selection by row id.
 */
function paneRows(
	rows: readonly Unplaced<NavigatorRow>[],
	panes: readonly PaneMark[],
): Map<string, ShownRow> {
	const shown = new Map<string, ShownRow>();
	const lettered = panes.length > 1;
	for (const pane of panes) {
		const id = paneRowId(rows, pane);
		if (id === null) continue;
		const before = shown.get(id) ?? { onScreen: [], selected: false };
		shown.set(id, {
			onScreen: lettered ? [...before.onScreen, pane.letter] : [],
			selected: before.selected || pane.active,
		});
	}
	return shown;
}

/**
 * How many rows sit under each row, the top counted under "".
 * @param rows The rows.
 * @returns The counts.
 */
function siblingCounts(rows: readonly Unplaced<NavigatorRow>[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(row.parentId ?? "", (counts.get(row.parentId ?? "") ?? 0) + 1);
	return counts;
}

/**
 * Give every row its place among the siblings it is drawn with, and the pane
 * letters and selection of the rows a pane shows.
 * @param rows The rows in order.
 * @param panes The panes.
 * @returns The rows, complete.
 */
function placeRows(
	rows: readonly Unplaced<NavigatorRow>[],
	panes: readonly PaneMark[],
): NavigatorRow[] {
	const counts = siblingCounts(rows);
	const seen = new Map<string, number>();
	const shown = paneRows(rows, panes);
	const nowhere: ShownRow = { onScreen: [], selected: false };
	return rows.map((row): NavigatorRow => {
		const group = row.parentId ?? "";
		const position = (seen.get(group) ?? 0) + 1;
		seen.set(group, position);
		const place = { position, siblings: counts.get(group) ?? position };
		if (!paneCanShow(row)) return { ...row, ...place };
		return { ...row, ...place, ...(shown.get(row.id) ?? nowhere) };
	});
}

/**
 * The navigator's rows, in the order they are drawn.
 * @param inputs The outline, what is open, the filter, the panes and the activity.
 * @returns The rows.
 */
function navigatorRows(inputs: NavigatorRowInputs): NavigatorRow[] {
	return placeRows(nodeRows(inputs, inputs.outline, { depth: 0, parentId: null }), inputs.panes);
}

/**
 * Whether what is under a row is listed, or undefined for a row that does not
 * open: a variant, or a board with nothing to list.
 * @param row The row.
 * @returns True while open, false while closed, undefined for a row that does not open.
 */
function rowOpen(row: NavigatorRow): boolean | undefined {
	if (row.kind === "variant") return undefined;
	return row.kind === "board" && !row.expandable ? undefined : row.expanded;
}

/**
 * Whether a row is the tree's one selected row.
 * @param row The row.
 * @returns True for the active pane's row.
 */
function rowSelected(row: NavigatorRow): boolean {
	return paneCanShow(row) && row.selected;
}

/**
 * How many boards the filter found — by their own names, or by a variant of
 * theirs — and how many there are.
 * @param rows The rows drawn.
 * @param total How many boards the vault lists.
 * @returns The found and total counts.
 */
function filterCount(
	rows: readonly NavigatorRow[],
	total: number,
): { readonly found: number; readonly total: number } {
	const found = new Set(
		rows.flatMap((row) => {
			if (row.kind === "variant") return [row.board.key];
			return row.kind === "board" && !row.dimmed ? [row.board.key] : [];
		}),
	);
	return { found: found.size, total };
}

export { filterCount, navigatorRows, paneCanShow, rowOpen, rowSelected };
