// The navigator's tree: the rows in order, one tab stop, and the keys that
// walk it. A printable key typed into the tree goes to the filter, so a person
// who starts typing while a row is focused finds what they typed.

import { useCallback, useRef, useState, type JSX, type KeyboardEvent } from "react";

import { OutlineRow, type RowHandlers } from "@/ui/shell/components/OutlineRow";
import type { NavigatorRow } from "@/ui/shell/lib/navigator-rows";
import { outlineKey, type OutlineKeyAction } from "@/ui/shell/lib/outline-keys";

/** Inputs for the tree. */
interface BoardOutlineProps extends Omit<RowHandlers, "focusable" | "onFocusRow" | "onRowKeyDown"> {
	readonly rows: readonly NavigatorRow[];
	/** The row that holds the tab stop until the person moves it: the board being read. */
	readonly homeId: string | null;
	/** A printable key typed in the tree, handed to the filter. */
	readonly onTypeAhead: (text: string) => void;
}

/**
 * Whether a key event types a character rather than commanding something.
 * @param event The key event.
 * @returns True for a single printable character without Ctrl, Cmd or Alt.
 */
function typesCharacter(event: KeyboardEvent<HTMLElement>): boolean {
	return (
		event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey
	);
}

/**
 * The navigator's tree.
 * @param props The rows, the row that starts with the tab stop, and the handlers.
 * @returns The tree.
 */
function BoardOutline(props: BoardOutlineProps): JSX.Element {
	const { rows, homeId, onOpen, onExpand, onTypeAhead } = props;
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
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>): void => {
			if (stop === undefined) return;
			if (typesCharacter(event)) {
				event.preventDefault();
				onTypeAhead(event.key);
				return;
			}
			const action = outlineKey(rows, stop, event);
			if (action === null) return;
			event.preventDefault();
			perform(action);
		},
		[rows, stop, onTypeAhead, perform],
	);
	return (
		<div
			ref={tree}
			role="tree"
			aria-label="Boards"
			tabIndex={-1}
			className="flex flex-col gap-px px-2 py-1.5 outline-none"
		>
			{rows.map((row) => (
				<OutlineRow
					key={row.id}
					row={row}
					focusable={row.id === stop}
					onFocusRow={setFocusedId}
					onOpen={onOpen}
					onExpand={onExpand}
					onToggleStates={props.onToggleStates}
					onRowKeyDown={handleKeyDown}
				/>
			))}
		</div>
	);
}

export { BoardOutline, type BoardOutlineProps };
