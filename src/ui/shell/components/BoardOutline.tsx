// The navigator's tree: the rows in order, one tab stop, and the keys that
// walk it. A printable key typed into the tree goes to the filter, so a person
// who starts typing while a row is focused finds what they typed.

import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
} from "react";

import { OutlineRow } from "@/ui/shell/components/OutlineRow";
import type { RowHandlers } from "@/ui/shell/components/TreeRow";
import type { EarlierRow, NavigatorRow, VariantRow } from "@/ui/shell/types/navigator-rows";
import { outlineKey, type OutlineKeyAction } from "@/ui/shell/lib/outline-keys";
import { rowSelected } from "@/ui/shell/lib/navigator-rows";
import { ROW_GUTTER } from "@/ui/shell/lib/tree-grid";
import { treeGuides } from "@/ui/shell/lib/tree-guides";
import { timelineLanes, type Lane } from "#web/ui/rules/variant-lifecycle/timeline.ts";

/**
 * The timeline lanes of every board's variants: each run of a board's variant
 * and Earlier rows is one line with branches, its first level the main line.
 * @param rows The rows, in order.
 * @returns Each such row's lane, by row id.
 */
function variantLanes(rows: readonly NavigatorRow[]): ReadonlyMap<string, Lane> {
	const lanes = new Map<string, Lane>();
	for (const run of variantRuns(rows)) {
		const base = Math.min(...run.map((row) => row.depth));
		const found = timelineLanes(run.map((row) => row.depth - base));
		run.forEach((row, index) => lanes.set(row.id, found[index]!));
	}
	return lanes;
}

/**
 * The runs of one board's variant and Earlier rows, in order.
 * @param rows The rows.
 * @returns The runs.
 */
function variantRuns(rows: readonly NavigatorRow[]): (VariantRow | EarlierRow)[][] {
	const runs: (VariantRow | EarlierRow)[][] = [];
	let last: string | null = null;
	for (const row of rows) {
		if (row.kind !== "variant" && row.kind !== "earlier") {
			last = null;
			continue;
		}
		if (last !== row.board.key) runs.push([]);
		runs.at(-1)!.push(row);
		last = row.board.key;
	}
	return runs;
}

/**
 * The depth of the first level of the timeline each variant and Earlier row is
 * on, which is where the guides give way to the timeline.
 * @param rows The rows, in order.
 * @returns That depth, by row id.
 */
function timelineDepths(rows: readonly NavigatorRow[]): ReadonlyMap<string, number> {
	const depths = new Map<string, number>();
	for (const run of variantRuns(rows)) {
		const first = Math.min(...run.map((row) => row.depth));
		for (const row of run) depths.set(row.id, first);
	}
	return depths;
}

/** Inputs for the tree. */
interface BoardOutlineProps extends Omit<RowHandlers, "focusable" | "onFocusRow" | "onRowKeyDown"> {
	readonly rows: readonly NavigatorRow[];
	/** The row that holds the tab stop until the person moves it: the selected row. */
	readonly homeId: string | null;
	/** A printable key typed in the tree, handed to the filter. */
	readonly onTypeAhead: (text: string) => void;
	/** A filter is on: the tree lists what it found, and nothing opens or closes. */
	readonly filtering: boolean;
}

/** The tree keeps the gutter a row's tone keeps from the column's edges. */
const TREE_STYLE: CSSProperties = { paddingInline: ROW_GUTTER };

/** Keys that command rather than type: Space opens, and "/" is the find shortcut. */
const NOT_TYPED: ReadonlySet<string> = new Set([" ", "/"]);

/**
 * Whether a key event types a character rather than commanding something.
 * @param event The key event.
 * @returns True for a single printable character without Ctrl, Cmd or Alt.
 */
function typesCharacter(event: KeyboardEvent<HTMLElement>): boolean {
	return (
		event.key.length === 1 &&
		!NOT_TYPED.has(event.key) &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey
	);
}

/**
 * The navigator's tree.
 * @param props The rows, the row that starts with the tab stop, and the handlers.
 * @returns The tree.
 */
function BoardOutline(props: BoardOutlineProps): JSX.Element {
	const { rows, homeId, onOpen, onExpand, onChooseCheckout, onTypeAhead, filtering } = props;
	const lanes = useMemo(() => variantLanes(rows), [rows]);
	const guides = useMemo(() => treeGuides(rows, rowSelected, timelineDepths(rows)), [rows]);
	const tree = useRef<HTMLDivElement>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const stop = [focusedId, homeId, rows[0]?.id].find(
		(id): id is string => typeof id === "string" && rows.some((row) => row.id === id),
	);
	const focusRow = useCallback((id: string): void => {
		setFocusedId(id);
		tree.current
			?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
			?.focus({ preventScroll: false });
	}, []);
	const perform = useCallback(
		(action: OutlineKeyAction): void => {
			if (action.kind === "focus") focusRow(action.id);
			else if (action.kind === "expand") onExpand(action.id, action.open);
			else onOpen(action.row, action.beside);
		},
		[focusRow, onExpand, onOpen],
	);
	// The rows as they are when a key is pressed: read then, so the handler every
	// row holds keeps one identity while news changes one row (TASK-385.04).
	const rowsNow = useRef(rows);
	useLayoutEffect(() => {
		rowsNow.current = rows;
	}, [rows]);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>): void => {
			if (stop === undefined) return;
			if (typesCharacter(event)) {
				event.preventDefault();
				onTypeAhead(event.key);
				return;
			}
			const action = outlineKey(rowsNow.current, stop, {
				key: event.key,
				altKey: event.altKey,
				filtering,
			});
			if (action === null) return;
			event.preventDefault();
			perform(action);
		},
		[stop, onTypeAhead, perform, filtering],
	);
	return (
		<div
			ref={tree}
			role="tree"
			aria-label="Boards"
			tabIndex={-1}
			style={TREE_STYLE}
			className="flex flex-col py-2 outline-none"
		>
			{rows.map((row) => (
				<OutlineRow
					key={row.id}
					row={row}
					lane={lanes.get(row.id)}
					guides={guides.get(row.id)}
					focusable={row.id === stop}
					onFocusRow={setFocusedId}
					onOpen={onOpen}
					onExpand={onExpand}
					onChooseCheckout={onChooseCheckout}
					onRowKeyDown={handleKeyDown}
				/>
			))}
		</div>
	);
}

export { BoardOutline, type BoardOutlineProps };
