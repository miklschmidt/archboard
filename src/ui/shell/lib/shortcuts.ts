// The shell's keyboard shortcuts, in one place: the key test the application
// runs on the document and the words the tooltip shows beside the action.

/** The key that presents the active pane, with the platform's command modifier. */
const PRESENT_KEY = "F";

/**
 * Whether this platform uses the Command key where others use Control.
 * @returns True on Apple platforms.
 */
function usesCommandKey(): boolean {
	return /Mac|iPhone|iPad|iPod/u.test(globalThis.navigator.platform);
}

/**
 * The shortcut for presenting the active pane, as a person reads it.
 * @returns `Cmd+Shift+F` on Apple platforms, `Ctrl+Shift+F` elsewhere.
 */
function presentShortcutLabel(): string {
	return `${usesCommandKey() ? "Cmd" : "Ctrl"}+Shift+${PRESENT_KEY}`;
}

/**
 * Whether a key event is the present shortcut: the platform's command
 * modifier with Shift and F, and no other modifier.
 * @param event The key event.
 * @returns True when the shortcut was pressed.
 */
function isPresentShortcut(event: KeyboardEvent): boolean {
	const command = usesCommandKey() ? event.metaKey : event.ctrlKey;
	return (
		command &&
		event.shiftKey &&
		!event.altKey &&
		event.key.toUpperCase() === PRESENT_KEY &&
		!event.repeat
	);
}

export { isPresentShortcut, presentShortcutLabel };
