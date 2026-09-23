// What a key does in the navigator's tree, decided from the rows alone: the
// arrows walk the visible rows, right and left open, close and follow
// ancestry, Enter opens a board where the person is reading and Alt+Enter
// opens it beside. Pure: the component carries the answer out.

import type { NavigatorRow } from "@/ui/shell/lib/navigator-rows";

/** What one key asks the tree to do. */
type OutlineKeyAction =
	| { readonly kind: "focus"; readonly id: string }
	| { readonly kind: "expand"; readonly id: string; readonly open: boolean }
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
 * What right does: open a closed row, or step into an open one.
 * @param rows The rows.
 * @param index The focused row's index.
 * @returns The action, or null.
 */
function rightAction(rows: readonly NavigatorRow[], index: number): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	if (expandable(row) && !isExpanded(row)) return { kind: "expand", id: row.id, open: true };
	const next = rows[index + 1];
	return next?.parentId === row.id ? { kind: "focus", id: next.id } : null;
}

/**
 * What left does: close an open row, or step out to the row it sits under.
 * @param rows The rows.
 * @param index The focused row's index.
 * @returns The action, or null.
 */
function leftAction(rows: readonly NavigatorRow[], index: number): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	if (expandable(row) && isExpanded(row)) return { kind: "expand", id: row.id, open: false };
	return row.parentId === null ? null : { kind: "focus", id: row.parentId };
}

/**
 * What Enter or Space does: a folder opens or closes, anything else opens.
 * @param rows The rows.
 * @param index The focused row's index.
 * @param beside Whether Alt was held: open in the other pane.
 * @returns The action, or null.
 */
function enterAction(
	rows: readonly NavigatorRow[],
	index: number,
	beside: boolean,
): OutlineKeyAction | null {
	const row = rows[index];
	if (row === undefined) return null;
	if (row.kind === "folder") return { kind: "expand", id: row.id, open: !row.expanded };
	return { kind: "open", row, beside };
}

/** What each key that is not an up or down key does. */
const HORIZONTAL: Readonly<
	Record<
		string,
		(rows: readonly NavigatorRow[], index: number, altKey: boolean) => OutlineKeyAction | null
	>
> = { ArrowRight: rightAction, ArrowLeft: leftAction, Enter: enterAction, " ": enterAction };

/**
 * What a key does to the tree.
 * @param rows The rows drawn.
 * @param focusedId The focused row.
 * @param event The key and whether Alt was held.
 * @param event.key The key.
 * @param event.altKey Whether Alt was held.
 * @returns The action, or null for a key the tree does not handle.
 */
function outlineKey(
	rows: readonly NavigatorRow[],
	focusedId: string,
	event: { readonly key: string; readonly altKey: boolean },
): OutlineKeyAction | null {
	const index = rows.findIndex((row) => row.id === focusedId);
	if (index < 0) return null;
	const vertical = verticalTarget(rows, index, event.key);
	if (vertical !== null) return { kind: "focus", id: vertical };
	return HORIZONTAL[event.key]?.(rows, index, event.altKey) ?? null;
}

export { expandable, outlineKey, type OutlineKeyAction };
