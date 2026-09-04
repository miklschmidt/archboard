/**
 * Archboard owns the composer's keyboard, so the reviewed primitive's own Enter
 * handling is switched off with `submitMode="none"` and this decision runs
 * instead. Keeping the decision here — pure, with no DOM — is what lets one
 * cheap owner prove Enter, Shift+Enter, and IME composition without a browser.
 */
export interface ComposerKeyEvent {
	readonly key: string;
	readonly shiftKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly altKey: boolean;
	/** The event's own composition flag, set while an IME session is open. */
	readonly isComposing: boolean;
}

/**
 * `submit` sends the message and the default is prevented. `newline` and `pass`
 * both leave the textarea's default alone; they are separate names so a test
 * can say which one a key produced, and so multiline insertion is a stated fact
 * rather than the absence of one.
 */
export type ComposerKeyIntent = "submit" | "newline" | "pass";

/**
 * `composing` is the module's own composition state, set by `compositionstart`
 * and cleared by `compositionend`. Both it and the event flag are consulted:
 * the flag is absent on the synthetic key events some IMEs and test drivers
 * produce, and the Enter that confirms a candidate must insert text rather than
 * send a message to the workhorse.
 */
export function composerKeyIntent(event: ComposerKeyEvent, composing: boolean): ComposerKeyIntent {
	if (event.key !== "Enter") return "pass";
	if (event.isComposing || composing) return "pass";
	if (event.shiftKey) return "newline";
	if (event.ctrlKey || event.metaKey || event.altKey) return "pass";
	return "submit";
}
