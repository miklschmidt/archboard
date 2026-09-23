// What a key does in the navigator's tree, decided from the rows alone: the
// arrows walk the visible rows; right opens a row's boards, then its states,
// then steps in; left closes its states, then its boards, then steps out —
// and while a filter is on, which opens everything it reaches, right and left
// only walk. Enter opens a board where the person is reading and Alt+Enter
// opens it beside. Pure: the component carries the answer out.

import type { NavigatorRow } from "@/ui/shell/lib/navigator-rows";

/** What one key asks the tree to do. */
type OutlineKeyAction =
	| { readonly kind: "focus"; readonly id: string }
	| { readonly kind: "expand"; readonly id: string; readonly open: boolean }
	| { readonly kind: "states"; readonly id: string; readonly open: boolean }
	| { readonly kind: "open"; readonly row: NavigatorRow; readonly beside: boolean };

/**
 * Whether a row opens and closes: a folder, or a board with boards under it.
 * @param row The row.
 * @returns True when it has a disclosure.
 */
function expandable(row: NavigatorRow): boolean {
	return row.kind === "folder" || (row.kind === "board" && row.hasChildren);
}

/**
 * Whether a row's children are listed.
 * @param row The row.
 * @returns True when open.
 */
function isExpanded(row: NavigatorRow): boolean {
	return row.kind !== "state" && row.expanded;
}

/**
 * The row an up, down, Home or End key moves to.
 * @param rows The rows.
 * @param index The focused row's index.
 * @param key The key.
 * @returns The row's id, or null when the key does not move.
 */
function verticalTarget(rows: readonly NavigatorRow[], index: number, key: string): string | null {
	const targets: Readonly<Record<string, number>> = {
		ArrowDown: Math.min(index + 1, rows.length - 1),
		ArrowUp: Math.max(index - 1, 0),
		Home: 0,
		End: rows.length - 1,
	};
	const target = targets[key];
	return target === undefined ? null : (rows[target]?.id ?? null);
}

/**
 * What opening a row by key does: its boards first, then its states.
 * @param row The row.
 * @returns The action, or null when nothing under it is closed.
 */
function openingAction(row: NavigatorRow): OutlineKeyAction | null {
	if (expandable(row) && !isExpanded(row)) return { kind: "expand", id: row.id, open: true };
	if (row.kind === "board" && row.otherStates > 0 && !row.statesOpen) {
		return { kind: "states", id: row.id, open: true };
	}
	return null;
}

/**
 * What right does: open what is closed under a row, or step into it.
 * @param rows The rows.
 * @param index The focused row's index.
 * @param event The key and whether a filter is on.
 * @returns The action, or null.
 */
function rightAction(
	rows: readonly NavigatorRow[],
	index: number,
	event: OutlineKeyEvent,
): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	const opening = event.filtering ? null : openingAction(row);
	if (opening !== null) return opening;
	const next = rows[index + 1];
	return next?.parentId === row.id ? { kind: "focus", id: next.id } : null;
}

/**
 * What closing a row by key does: its states first, then its boards.
 * @param row The row.
 * @returns The action, or null when nothing under it is open.
 */
function closingAction(row: NavigatorRow): OutlineKeyAction | null {
	if (row.kind === "board" && row.statesOpen) return { kind: "states", id: row.id, open: false };
	if (expandable(row) && isExpanded(row)) return { kind: "expand", id: row.id, open: false };
	return null;
}

/**
 * What left does: close what is open under a row, or step out to the row it sits under.
 * @param rows The rows.
 * @param index The focused row's index.
 * @param event The key and whether a filter is on.
 * @returns The action, or null.
 */
function leftAction(
	rows: readonly NavigatorRow[],
	index: number,
	event: OutlineKeyEvent,
): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	const closing = event.filtering ? null : closingAction(row);
	if (closing !== null) return closing;
	return row.parentId === null ? null : { kind: "focus", id: row.parentId };
}

/**
 * What Enter or Space does: a folder opens or closes, anything else opens.
 * @param rows The rows.
 * @param index The focused row's index.
 * @param event The key and whether Alt was held: open in the other pane.
 * @returns The action, or null.
 */
function enterAction(
	rows: readonly NavigatorRow[],
	index: number,
	event: OutlineKeyEvent,
): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	if (row.kind === "folder") return { kind: "expand", id: row.id, open: !row.expanded };
	return { kind: "open", row, beside: event.altKey };
}

/** A key with what it is pressed with. */
interface OutlineKeyEvent {
	readonly key: string;
	/** Alt was held: open beside. */
	readonly altKey: boolean;
	/** A filter is on: everything it reaches is open, and nothing opens or closes. */
	readonly filtering: boolean;
}

/** What each key that is not an up or down key does. */
const HORIZONTAL: Readonly<
	Record<
		string,
		(
			rows: readonly NavigatorRow[],
			index: number,
			event: OutlineKeyEvent,
		) => OutlineKeyAction | null
	>
> = { ArrowRight: rightAction, ArrowLeft: leftAction, Enter: enterAction, " ": enterAction };

/**
 * What a key does to the tree.
 * @param rows The rows drawn.
 * @param focusedId The focused row.
 * @param event The key, whether Alt was held, and whether a filter is on.
 * @returns The action, or null for a key the tree does not handle.
 */
function outlineKey(
	rows: readonly NavigatorRow[],
	focusedId: string,
	event: OutlineKeyEvent,
): OutlineKeyAction | null {
	const index = rows.findIndex((row) => row.id === focusedId);
	if (index < 0) return null;
	const vertical = verticalTarget(rows, index, event.key);
	if (vertical !== null) return { kind: "focus", id: vertical };
	return HORIZONTAL[event.key]?.(rows, index, event) ?? null;
}

export { expandable, outlineKey, type OutlineKeyAction, type OutlineKeyEvent };
