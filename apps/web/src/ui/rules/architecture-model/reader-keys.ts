// The keys of a reading. They work wherever the reader is, also while presenting, when
// no tree is on screen: Backspace goes up, `[` and `]` walk the siblings, Enter opens
// what is selected or else selects the first card, `F` focuses what is selected and
// `0` fits the whole picture.

/** A move of the reader. */
type ReaderMove = "up" | "previous" | "next" | "open" | "focus" | "fit";

const MOVES: Readonly<Record<string, ReaderMove>> = {
	Backspace: "up",
	"[": "previous",
	"]": "next",
	Enter: "open",
	f: "focus",
	F: "focus",
	"0": "fit",
};

/** Where a key belongs to what has focus, and Enter to what it activates. */
const TAKES_TEXT = 'input, textarea, select, [contenteditable="true"]';
const TAKES_KEYS = '[role="menu"], [role="listbox"], [role="dialog"], [role="combobox"]';
const TAKES_ENTER =
	'a, button, summary, [role="button"], [role="treeitem"], [role="tab"], [role="option"]';

/**
 * Whether a key belongs to what has focus and not to the reading.
 * @param key The key.
 * @param target Where it was pressed.
 * @returns True when the reading leaves it alone.
 */
function keyBelongsElsewhere(key: string, target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (target.closest(`${TAKES_TEXT}, ${TAKES_KEYS}`) !== null) return true;
	return key === "Enter" && target.closest(TAKES_ENTER) !== null;
}

/**
 * Whether a key is spent, or held with a modifier that makes it somebody else's shortcut.
 * @param event The key event.
 * @returns True when the reading leaves it alone.
 */
function isShortcut(event: KeyboardEvent): boolean {
	return event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * The move a key asks for.
 * @param event The key event.
 * @returns The move, or null for a key that is not a move here.
 */
function readerMove(event: KeyboardEvent): ReaderMove | null {
	if (isShortcut(event) || keyBelongsElsewhere(event.key, event.target)) return null;
	return MOVES[event.key] ?? null;
}

export { readerMove, type ReaderMove };
