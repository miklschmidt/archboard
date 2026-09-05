// The composer's keyboard decision, pure and DOM-free, so one cheap owner can
// prove Enter, Shift+Enter and IME composition without a browser.

/** The facts of one key event the decision reads. */
interface ComposerKeyEvent {
	readonly key: string;
	readonly shiftKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly altKey: boolean;
	/** The event's own composition flag, set while an IME session is open. */
	readonly isComposing: boolean;
}

/**
 * `submit` sends the message and the default is prevented. `newline` and
 * `pass` both leave the textarea's default alone; they are separate names so a
 * test can say which one a key produced.
 */
type ComposerKeyIntent = "submit" | "newline" | "pass";

/**
 * Decide what Enter does. `composing` is the caller's own composition state,
 * set by `compositionstart` and cleared by `compositionend`. Both it and the
 * event flag are consulted: the flag is absent on the synthetic key events some
 * IMEs and test drivers produce, and the Enter that confirms a candidate must
 * insert text rather than send a message to the workhorse.
 * @param event The key event.
 * @param composing Whether an IME composition is open.
 * @returns The intent.
 */
function composerKeyIntent(event: ComposerKeyEvent, composing: boolean): ComposerKeyIntent {
	if (event.key !== "Enter" || event.isComposing || composing) {
		return "pass";
	}
	if (event.shiftKey) {
		return "newline";
	}
	return hasOtherModifier(event) ? "pass" : "submit";
}

/**
 * Whether a modifier other than Shift is held.
 * @param event The key event.
 * @returns True for Ctrl, Meta or Alt.
 */
function hasOtherModifier(event: ComposerKeyEvent): boolean {
	return event.ctrlKey || event.metaKey || event.altKey;
}

export { composerKeyIntent, type ComposerKeyEvent, type ComposerKeyIntent };
