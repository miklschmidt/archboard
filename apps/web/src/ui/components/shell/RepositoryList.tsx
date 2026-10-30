// The navigator's tree: the rows in order, one tab stop, and the keys that
// walk it. A printable key typed into the tree goes to the filter, so a person
// who starts typing while a row is focused finds what they typed.

import {
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
} from "react";

import { RepositoryLine } from "#ui/components/shell/RepositoryLine.tsx";
import type { RowHandlers } from "#ui/components/shell/TreeRow.tsx";
import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";
import { outlineKey, type OutlineKeyAction } from "#ui/rules/shell/outline-keys.ts";
import { ROW_GUTTER } from "#ui/rules/shell/tree-grid.ts";

/** Inputs for the tree. */
interface RepositoryListProps extends Omit<
	RowHandlers,
	"focusable" | "onFocusRow" | "onRowKeyDown"
> {
	readonly rows: readonly NavigatorRow[];
	/** The row that holds the tab stop until the person moves it: the selected row. */
	readonly homeId: string | null;
	/** A printable key typed in the tree, handed to the filter. */
	readonly onTypeAhead: (text: string) => void;
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
function RepositoryList(props: RepositoryListProps): JSX.Element {
	const { rows, homeId, onOpen, onChooseCheckout, onTypeAhead } = props;
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
			else onOpen(action.row, action.beside);
		},
		[focusRow, onOpen],
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
			});
			if (action === null) return;
			event.preventDefault();
			perform(action);
		},
		[stop, onTypeAhead, perform],
	);
	return (
		<div
			ref={tree}
			role="tree"
			aria-label="Repositories"
			tabIndex={-1}
			style={TREE_STYLE}
			className="flex flex-col py-2 outline-none"
		>
			{rows.map((row) => (
				<RepositoryLine
					key={row.id}
					row={row}
					focusable={row.id === stop}
					onFocusRow={setFocusedId}
					onOpen={onOpen}
					onChooseCheckout={onChooseCheckout}
					onRowKeyDown={handleKeyDown}
				/>
			))}
		</div>
	);
}

export { RepositoryList, type RepositoryListProps };
