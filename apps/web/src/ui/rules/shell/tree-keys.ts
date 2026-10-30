// The keys of a tree in the left column, whatever it lists: the arrows walk the rows,
// Right opens a closed row and then steps in, Left closes an open row and then steps out,
// and Enter or Space opens the row's destination, beside the reading with Alt.

/** What the keys need to know about a drawn row. */
interface TreeKeyRow {
	readonly id: string;
	/** The row that holds it, or null at the top. */
	readonly parent: string | null;
	/** Whether it holds rows of its own. */
	readonly branch: boolean;
	/** Whether the rows it holds are drawn. */
	readonly open: boolean;
}

/** One keyboard action on a tree. */
type TreeKeyAction<Row> =
	| { readonly kind: "focus"; readonly id: string }
	| { readonly kind: "toggle"; readonly row: Row }
	| { readonly kind: "open"; readonly row: Row; readonly beside: boolean };

/** The key and its adjacent-pane modifier. */
interface TreeKeyEvent {
	readonly key: string;
	readonly altKey: boolean;
}

/** The keys that open a row's destination. */
const OPENING_KEYS: ReadonlySet<string> = new Set(["Enter", " "]);

/**
 * What Right does: open a closed row, then step in.
 * @param rows The drawn rows, in order.
 * @param index Where the row is.
 * @param row The row.
 * @returns The action, or null at the end of the way.
 */
function stepIn<Row extends TreeKeyRow>(
	rows: readonly Row[],
	index: number,
	row: Row,
): TreeKeyAction<Row> | null {
	if (!row.branch) return null;
	if (!row.open) return { kind: "toggle", row };
	const inside = rows[index + 1];
	return inside === undefined ? null : { kind: "focus", id: inside.id };
}

/**
 * What Left does: close an open row, then step out.
 * @param row The row.
 * @returns The action, or null at the top.
 */
function stepOut<Row extends TreeKeyRow>(row: Row): TreeKeyAction<Row> | null {
	if (row.branch && row.open) return { kind: "toggle", row };
	return row.parent === null ? null : { kind: "focus", id: row.parent };
}

/**
 * The row that a key walks to.
 * @param rows The drawn rows, in order.
 * @param index Where the focused row is.
 * @param key The key.
 * @returns The row's id, or undefined for a key that does not walk.
 */
function walkedTo(rows: readonly TreeKeyRow[], index: number, key: string): string | undefined {
	const targets: Readonly<Record<string, number>> = {
		ArrowDown: Math.min(index + 1, rows.length - 1),
		ArrowUp: Math.max(index - 1, 0),
		Home: 0,
		End: rows.length - 1,
	};
	const target = targets[key];
	return target === undefined ? undefined : rows[target]?.id;
}

/**
 * Walk a tree, fold a row, or open a row's destination.
 * @param rows The drawn rows, in order.
 * @param focusedId The row with focus.
 * @param event The keyboard gesture.
 * @returns The action, or null for a key that does nothing here.
 */
function treeKey<Row extends TreeKeyRow>(
	rows: readonly Row[],
	focusedId: string,
	event: TreeKeyEvent,
): TreeKeyAction<Row> | null {
	const index = rows.findIndex((row) => row.id === focusedId);
	const row = rows[index];
	if (row === undefined) return null;
	const walked = walkedTo(rows, index, event.key);
	if (walked !== undefined) return { kind: "focus", id: walked };
	if (event.key === "ArrowRight") return stepIn(rows, index, row);
	if (event.key === "ArrowLeft") return stepOut(row);
	return OPENING_KEYS.has(event.key) ? { kind: "open", row, beside: event.altKey } : null;
}

export { treeKey, type TreeKeyAction, type TreeKeyRow };
