// The key that asks for the search over a board's parts, and how the field says
// it. It is one key for the pane that has focus, whether its sidebar is shown or
// not: the sidebar's frame hears it and brings the field up (use-search-request.ts).
//
// It is the key that finds a board, Ctrl or Command with K, widened with Shift
// to the parts of every board. Ctrl or Command with Shift and F is the shell's:
// it presents the active pane.

import { usesCommandKey } from "@archboard/ui-kit/components";

/**
 * Whether a key event asks for the search: Ctrl or Command, Shift and K, pressed
 * once and not held down.
 * @param event The key event.
 * @returns Whether it does.
 */
function asksForSearch(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		event.shiftKey &&
		!event.altKey &&
		!event.repeat &&
		event.key.toLowerCase() === "k"
	);
}

/**
 * The shortcut as the field says it.
 * @returns The words on its key cap.
 */
function searchShortcutLabel(): string {
	return usesCommandKey() ? "⌘⇧K" : "Ctrl ⇧ K";
}

/**
 * The shortcut as `aria-keyshortcuts` spells it.
 * @returns The key combination.
 */
function searchShortcutKeys(): string {
	return `${usesCommandKey() ? "Meta" : "Control"}+Shift+K`;
}

export { asksForSearch, searchShortcutKeys, searchShortcutLabel };
