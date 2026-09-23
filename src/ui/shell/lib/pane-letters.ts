// The letter each pane is called by in the chrome: A, then B.

/** Pane letters in reading order; a third pane would be a number. */
const PANE_LETTERS = ["A", "B"] as const;

/**
 * The letter a pane is called by in the chrome.
 * @param index The pane's position in reading order.
 * @returns `A`, `B`, or the one-based position beyond that.
 */
function paneLetter(index: number): string {
	return PANE_LETTERS[index] ?? String(index + 1);
}

export { paneLetter };
