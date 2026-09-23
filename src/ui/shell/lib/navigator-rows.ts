// The rows the navigator draws, in order, from the vault's outline: which
// folders and boards are open, what the filter found, the states of the board
// being read, which panes show what, and where an agent is working. One flat
// list, each row carrying its depth, so the tree is drawn and walked by the
// keyboard the same way. Pure: no React.

import type { OutlineNode } from "@/ui/board-catalog";
import { matchIn, type TextRange } from "@/ui/shell/lib/text-match";
import type { AgentActivityEntry, CatalogBoard, ListedVariant } from "@/ui/types";

/** What every row carries. */
interface RowBase {
	/** Stable across renders and unique in the list. */
	readonly id: string;
	/** How deep the row sits: 0 at the top. */
	readonly depth: number;
	/** The row it sits under, or null at the top. */
	readonly parentId: string | null;
	/** Shown only to place a match: the row itself did not match the filter. */
	readonly dimmed: boolean;
	/** Where the filter matched the row's name, or null. */
	readonly match: TextRange | null;
	/** Its place among its siblings, from 1, for assistive technology. */
	readonly position: number;
	/** How many siblings it has, itself included. */
	readonly siblings: number;
}

/** A folder in the boards' names. */
interface FolderRow extends RowBase {
	readonly kind: "folder";
	readonly name: string;
	/** How many boards it holds at any depth. */
	readonly count: number;
	readonly expanded: boolean;
	/** An agent works on a board inside it while it is closed. */
	readonly innerActivity: boolean;
}

/** A board. */
interface BoardRow extends RowBase {
	readonly kind: "board";
	readonly board: CatalogBoard;
	/** The name without its folders. */
	readonly label: string;
	/** Boards are drawn under it. */
	readonly hasChildren: boolean;
	readonly expanded: boolean;
	/** How many states it has beside the one its name opens. */
	readonly otherStates: number;
	/** Its states are listed under it. */
	readonly statesOpen: boolean;
	/** The letters of the panes showing it, when there is more than one pane. */
	readonly onScreen: readonly string[];
	/** The active pane shows it. */
	readonly active: boolean;
	/** What an agent is doing to it, or null. */
	readonly activity: AgentActivityEntry | null;
	/** An agent works on a board under it while it is closed. */
	readonly innerActivity: boolean;
	/** It has variants and none is current (ADR 0031). */
	readonly unbuilt: boolean;
}

/** One state of a board: a variant a pane can open. */
interface StateRow extends RowBase {
	readonly kind: "state";
	readonly board: CatalogBoard;
	readonly variant: ListedVariant;
	/** The depth of the board the state belongs to. */
	readonly boardDepth: number;
	/** How many states it sits under: 0 for a state derived from none listed. */
	readonly nesting: number;
	/** The letters of the panes showing exactly this state, when there is more than one pane. */
	readonly onScreen: readonly string[];
	/** The active pane shows exactly this state. */
	readonly active: boolean;
}

/** One row the navigator draws. */
type NavigatorRow = FolderRow | BoardRow | StateRow;

/** One pane as the rows read it. */
interface PaneMark {
	readonly letter: string;
	/** The board's name the pane shows, or null. */
	readonly board: string | null;
	/** The listed key of the state it shows, or null. */
	readonly key: string | null;
}

/** Everything the rows are derived from. */
interface NavigatorRowInputs {
	readonly outline: readonly OutlineNode<CatalogBoard>[];
	/** Whether a folder or board is open, when no filter is on. */
	readonly expanded: (id: string) => boolean;
	/** Boards whose states the person opened. */
	readonly statesOpen: ReadonlySet<string>;
	/** The filter, folded; empty when none. */
	readonly query: string;
	/** The active pane's board name, or null. */
	readonly activeBoard: string | null;
	/** The listed key of the active pane's state, or null. */
	readonly activeKey: string | null;
	/** Every pane, lettered; chips are drawn only when there are two. */
	readonly panes: readonly PaneMark[];
	/** What agents are doing, by board key (ADR 0022). */
	readonly activity: Readonly<Record<string, AgentActivityEntry>>;
}

/** A row before its place among its siblings is known. */
type Unplaced<Row extends NavigatorRow> = Row extends NavigatorRow
	? Omit<Row, "position" | "siblings">
	: never;

/**
 * Two board names are the same board: the server folds keys to lower case.
 * @param one A name or key.
 * @param other Another.
 * @returns True when they name the same board.
 */
function sameName(one: string | null, other: string): boolean {
	return one !== null && one.toLowerCase() === other.toLowerCase();
}

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
 * The letters of the panes a test picks, when there is more than one pane.
 * @param panes The panes.
 * @param shows Which panes count.
 * @returns The letters, in reading order.
 */
function lettersWhere(panes: readonly PaneMark[], shows: (pane: PaneMark) => boolean): string[] {
	return panes.length < 2 ? [] : panes.filter(shows).map((pane) => pane.letter);
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
 * The states of a board the filter finds by name.
 * @param board The board.
 * @param query The folded filter.
 * @returns The matching variants.
 */
function matchingStates(board: CatalogBoard, query: string): ListedVariant[] {
	return board.variants.filter((variant) => matchIn(variant.name, query) !== null);
}

/**
 * Whether the filter finds anything at or under a node.
 * @param node The node.
 * @param query The folded filter.
 * @returns True when the node or a descendant matches.
 */
function reaches(node: OutlineNode<CatalogBoard>, query: string): boolean {
	if (boardMatch(node, query) !== null) return true;
	if (node.kind === "board" && matchingStates(node.board, query).length > 0) return true;
	return node.children.some((child) => reaches(child, query));
}

/** Where a board's states start: their first depth and the board's row. */
interface StatePlacement {
	readonly depth: number;
	readonly parentId: string;
}

/**
 * A board's states as rows, nested by ancestry: the variant each was derived
 * from sits above it, and lifecycle never moves one.
 * @param inputs The inputs.
 * @param board The board.
 * @param variants The variants to list.
 * @param at The depth of the first level of states and the board's row.
 * @returns The rows.
 */
function stateRows(
	inputs: NavigatorRowInputs,
	board: CatalogBoard,
	variants: readonly ListedVariant[],
	at: StatePlacement,
): Unplaced<StateRow>[] {
	const ids = new Set(variants.map((variant) => variant.id));
	const children = new Map<string | null, ListedVariant[]>();
	for (const variant of variants) {
		const parent = variant.parentId !== null && ids.has(variant.parentId) ? variant.parentId : null;
		children.set(parent, [...(children.get(parent) ?? []), variant]);
	}
	const rows: Unplaced<StateRow>[] = [];
	/**
	 * List one variant and the variants derived from it.
	 * @param parent The parent variant id, or null for the roots.
	 * @param depth Their depth.
	 * @param parentRow The row they sit under.
	 */
	const walk = (parent: string | null, depth: number, parentRow: string): void => {
		for (const variant of children.get(parent) ?? []) {
			const id = `state:${variant.key}`;
			const nesting = depth - at.depth;
			rows.push(
				stateRow(inputs, board, variant, {
					id,
					depth,
					parentId: parentRow,
					boardDepth: at.depth - 1,
					nesting,
				}),
			);
			walk(variant.id, depth + 1, id);
		}
	};
	walk(null, at.depth, at.parentId);
	return rows;
}

/** Where one state row sits. */
interface StatePlace {
	readonly id: string;
	readonly depth: number;
	readonly parentId: string;
	readonly boardDepth: number;
	readonly nesting: number;
}

/**
 * One state row.
 * @param inputs The inputs.
 * @param board The board.
 * @param variant The variant.
 * @param place Its id, depth and parent row.
 * @returns The row.
 */
function stateRow(
	inputs: NavigatorRowInputs,
	board: CatalogBoard,
	variant: ListedVariant,
	place: StatePlace,
): Unplaced<StateRow> {
	return {
		kind: "state",
		...place,
		board,
		variant,
		dimmed: false,
		match: matchIn(variant.name, inputs.query),
		onScreen: lettersWhere(inputs.panes, (pane) => pane.key === variant.key),
		active: inputs.activeKey === variant.key,
	};
}

/**
 * Whether a board lists its states under it: the person opened them, or it
 * is the board being read and has more than one.
 * @param inputs The inputs.
 * @param id The board row's id.
 * @param board The board.
 * @returns True when the states are listed.
 */
function statesShown(inputs: NavigatorRowInputs, id: string, board: CatalogBoard): boolean {
	return (
		board.variants.length > 1 &&
		(inputs.statesOpen.has(id) || sameName(inputs.activeBoard, board.name))
	);
}

/**
 * Whether a node is open: a filter opens everything it reaches through.
 * @param inputs The inputs.
 * @param node The node.
 * @returns True when its children are listed.
 */
function isOpen(inputs: NavigatorRowInputs, node: OutlineNode<CatalogBoard>): boolean {
	return inputs.query.length > 0 || inputs.expanded(node.id);
}

/** Where a node's rows go and how deep they sit. */
interface Placement {
	readonly depth: number;
	readonly parentId: string | null;
}

/** A board node of the outline. */
type BoardNode = Extract<OutlineNode<CatalogBoard>, { kind: "board" }>;

/**
 * Which states a board lists under it: those the filter finds while one is
 * on, otherwise all of them when its states are shown, else none.
 * @param inputs The inputs.
 * @param node The board's node.
 * @returns The variants listed.
 */
function listedStates(inputs: NavigatorRowInputs, node: BoardNode): readonly ListedVariant[] {
	if (inputs.query.length > 0) return matchingStates(node.board, inputs.query);
	return statesShown(inputs, node.id, node.board) ? node.board.variants : [];
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
 * The row of one board.
 * @param inputs The inputs.
 * @param node The board's node.
 * @param at Its depth and parent row.
 * @param statesOpen Whether its states are listed under it.
 * @returns The row.
 */
function boardRow(
	inputs: NavigatorRowInputs,
	node: BoardNode,
	at: Placement,
	statesOpen: boolean,
): Unplaced<BoardRow> {
	const { board } = node;
	const open = isOpen(inputs, node);
	const match = inputs.query.length > 0 ? boardMatch(node, inputs.query) : null;
	return {
		kind: "board",
		id: node.id,
		depth: at.depth,
		parentId: at.parentId,
		board,
		label: node.label,
		dimmed: inputs.query.length > 0 && match === null,
		match,
		hasChildren: node.children.length > 0,
		expanded: open && node.children.length > 0,
		otherStates: Math.max(0, board.variants.length - 1),
		statesOpen,
		onScreen: lettersWhere(inputs.panes, (pane) => sameName(pane.board, board.name)),
		active: sameName(inputs.activeBoard, board.name),
		activity: activityOn(inputs, board),
		innerActivity: !open && anyActivity(inputs, node.children),
		unbuilt: unbuiltBoard(board),
	};
}

/**
 * The rows of one board node and, when open, everything under it.
 * @param inputs The inputs.
 * @param node The board's node.
 * @param at Its depth and parent row.
 * @returns The rows.
 */
function boardRows(
	inputs: NavigatorRowInputs,
	node: BoardNode,
	at: Placement,
): Unplaced<NavigatorRow>[] {
	const states = listedStates(inputs, node);
	const row = boardRow(inputs, node, at, states.length > 0);
	const stateList = stateRows(inputs, node.board, states, {
		depth: at.depth + 1,
		parentId: node.id,
	});
	const below = isOpen(inputs, node)
		? nodeRows(inputs, node.children, { depth: at.depth + 1, parentId: node.id })
		: [];
	return [row, ...stateList, ...below];
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
	node: Extract<OutlineNode<CatalogBoard>, { kind: "folder" }>,
	at: Placement,
): Unplaced<NavigatorRow>[] {
	const open = isOpen(inputs, node);
	const match = inputs.query.length > 0 ? matchIn(node.name, inputs.query) : null;
	const row: Unplaced<FolderRow> = {
		kind: "folder",
		id: node.id,
		depth: at.depth,
		parentId: at.parentId,
		name: node.name,
		count: node.count,
		expanded: open,
		dimmed: inputs.query.length > 0 && match === null,
		match,
		innerActivity: !open && anyActivity(inputs, node.children),
	};
	const below = open
		? nodeRows(inputs, node.children, { depth: at.depth + 1, parentId: node.id })
		: [];
	return [row, ...below];
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
	at: Placement,
): Unplaced<NavigatorRow>[] {
	return nodes
		.filter((node) => inputs.query.length === 0 || reaches(node, inputs.query))
		.flatMap((node) =>
			node.kind === "board" ? boardRows(inputs, node, at) : folderRows(inputs, node, at),
		);
}

/**
 * The siblings key of one row: its parent and whether it is a state.
 * @param row The row.
 * @returns The key.
 */
function siblingsOf(row: Unplaced<NavigatorRow>): string {
	return `${row.parentId ?? ""}|${row.kind === "state" ? "state" : "node"}`;
}

/**
 * Give every row its place among the siblings it is drawn with.
 * @param rows The rows in order.
 * @returns The rows with their positions.
 */
function placeRows(rows: readonly Unplaced<NavigatorRow>[]): NavigatorRow[] {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(siblingsOf(row), (counts.get(siblingsOf(row)) ?? 0) + 1);
	const seen = new Map<string, number>();
	return rows.map((row) => {
		const group = siblingsOf(row);
		const position = (seen.get(group) ?? 0) + 1;
		seen.set(group, position);
		return { ...row, position, siblings: counts.get(group) ?? position };
	});
}

/**
 * The navigator's rows, in the order they are drawn.
 * @param inputs The outline, what is open, the filter, the panes and the activity.
 * @returns The rows.
 */
function navigatorRows(inputs: NavigatorRowInputs): NavigatorRow[] {
	return placeRows(nodeRows(inputs, inputs.outline, { depth: 0, parentId: null }));
}

/**
 * How many boards the filter found, and how many there are.
 * @param rows The rows drawn.
 * @param total How many boards the vault lists.
 * @returns The found and total counts.
 */
function filterCount(
	rows: readonly NavigatorRow[],
	total: number,
): { readonly found: number; readonly total: number } {
	const found = rows.filter((row) => row.kind === "board" && !row.dimmed).length;
	return { found, total };
}

export {
	filterCount,
	navigatorRows,
	type BoardRow,
	type FolderRow,
	type NavigatorRow,
	type NavigatorRowInputs,
	type PaneMark,
	type StateRow,
};
