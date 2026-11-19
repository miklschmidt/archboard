// The width a person last dragged a column of the shell to, kept in this browser. A browser that
// keeps nothing, or a width outside what the column can be, gives the shell's own width.

/** What a column can be, and what it is when the browser keeps nothing. */
interface ColumnWidths {
	/** Where the browser keeps the width. */
	readonly key: string;
	readonly min: number;
	readonly max: number;
	/** The shell's own width. */
	readonly initial: number;
}

/**
 * The width the person last gave a column, or the shell's own.
 * @param column What the column can be.
 * @returns The width in pixels, within what it can be.
 */
function storedWidth(column: ColumnWidths): number {
	try {
		const value = Number(window.localStorage.getItem(column.key));
		return Number.isFinite(value) && value >= column.min && value <= column.max
			? value
			: column.initial;
	} catch {
		return column.initial;
	}
}

/**
 * Keep a column's width, when the browser lets us.
 * @param column What the column can be.
 * @param width The width in pixels.
 */
function storeWidth(column: ColumnWidths, width: number): void {
	try {
		window.localStorage.setItem(column.key, String(Math.round(width)));
	} catch {
		// The width still holds for this session.
	}
}

export { storeWidth, storedWidth, type ColumnWidths };
