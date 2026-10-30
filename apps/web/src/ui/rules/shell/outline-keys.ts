import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";

/** One keyboard action on the repository list. */
type OutlineKeyAction =
	| { readonly kind: "focus"; readonly id: string }
	| { readonly kind: "open"; readonly row: NavigatorRow; readonly beside: boolean };

/** The key and its adjacent-pane modifier. */
interface OutlineKeyEvent {
	readonly key: string;
	readonly altKey: boolean;
}

/**
 * Move through repositories or open the focused model.
 * @param rows The visible repository rows.
 * @param focusedId The focused repository.
 * @param event The keyboard gesture.
 * @returns The requested action, or no action for an unavailable model.
 */
function outlineKey(
	rows: readonly NavigatorRow[],
	focusedId: string,
	event: OutlineKeyEvent,
): OutlineKeyAction | null {
	const index = rows.findIndex((row) => row.id === focusedId);
	const row = rows[index];
	if (row === undefined) return null;
	const targets: Readonly<Record<string, number>> = {
		ArrowDown: Math.min(index + 1, rows.length - 1),
		ArrowUp: Math.max(index - 1, 0),
		Home: 0,
		End: rows.length - 1,
	};
	const target = targets[event.key];
	if (target !== undefined) return { kind: "focus", id: rows[target]!.id };
	if ((event.key === "Enter" || event.key === " ") && row.model !== undefined)
		return { kind: "open", row, beside: event.altKey };
	return null;
}

export { outlineKey, type OutlineKeyAction };
