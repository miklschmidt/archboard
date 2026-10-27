// What a key does in the navigator's tree, decided from the rows alone, as
// the WAI-ARIA tree pattern has it: the arrows walk the visible rows; right
// opens a closed row, then steps into it; left closes an open row, then steps
// out to the row it sits under. While a filter is on, which opens everything
// it reaches, right and left only walk. Enter opens a board or a variant where
// the person is reading and Alt+Enter opens it beside; on a repository, a
// folder or an Earlier row, Enter opens or closes it, and on a repository that
// holds nothing it does nothing. Pure: the component carries the answer out.

import { paneCanShow, rowOpen } from "#ui/rules/shell/navigator-rows.ts";
import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";

/** What one key asks the tree to do. */
type OutlineKeyAction =
	| { readonly kind: "focus"; readonly id: string }
	| { readonly kind: "expand"; readonly id: string; readonly open: boolean }
	| { readonly kind: "open"; readonly row: NavigatorRow; readonly beside: boolean };

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
 * Whether a key may open or close a row: never while a filter is on.
 * @param row The row.
 * @param event The key and whether a filter is on.
 * @returns True when the row opens and closes by key.
 */
function togglesByKey(row: NavigatorRow, event: OutlineKeyEvent): boolean {
	return !event.filtering && rowOpen(row) !== undefined;
}

/**
 * What right does: open a closed row, or step into an open one.
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
	if (togglesByKey(row, event) && rowOpen(row) === false)
		return { kind: "expand", id: row.id, open: true };
	const next = rows[index + 1];
	return next?.parentId === row.id ? { kind: "focus", id: next.id } : null;
}

/**
 * What left does: close an open row, or step out to the row it sits under.
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
	if (togglesByKey(row, event) && rowOpen(row) === true)
		return { kind: "expand", id: row.id, open: false };
	return row.parentId === null ? null : { kind: "focus", id: row.parentId };
}

/**
 * What Enter or Space does: a repository, a folder or an Earlier row opens or
 * closes, a board or a variant opens.
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
	if (paneCanShow(row) || (row.kind === "repository" && row.model !== undefined))
		return { kind: "open", row, beside: event.altKey };
	const open = rowOpen(row);
	return open === undefined ? null : { kind: "expand", id: row.id, open: !open };
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

export { outlineKey, type OutlineKeyAction, type OutlineKeyEvent };
