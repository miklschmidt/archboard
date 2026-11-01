// The keys that bring up Find from anywhere in the shell: `/` while nothing takes
// text, and the platform's command key with K.

import { useEffect } from "react";

/**
 * Whether a key event started where a person is typing.
 * @param event The key event.
 * @returns True inside a field, a text area or editable content.
 */
function typingIn(event: KeyboardEvent): boolean {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Whether a key event asks for Find.
 * @param event The key event.
 * @returns True for `/` outside a field, or Ctrl/Cmd+K anywhere.
 */
function asksForFind(event: KeyboardEvent): boolean {
	if (event.altKey || event.shiftKey) return false;
	const command = event.metaKey || event.ctrlKey;
	return command ? event.key.toLowerCase() === "k" : event.key === "/" && !typingIn(event);
}

/**
 * Bring up Find when a person asks for it from anywhere in the shell.
 * @param onFind Bring it up.
 */
function useFindShortcut(onFind: () => void): void {
	useEffect(() => {
		/**
		 * Take the key when it asks for Find.
		 * @param event The key event.
		 */
		const onKeyDown = (event: KeyboardEvent): void => {
			// A presented pane keeps its keys.
			if (document.fullscreenElement !== null) return;
			if (event.defaultPrevented || !asksForFind(event)) return;
			event.preventDefault();
			onFind();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onFind]);
}

export { useFindShortcut };
