// The keys that take a person to the navigator's filter from anywhere in the
// shell: `/` while nothing takes text, and the platform's command key with K.

import { useEffect, type RefObject } from "react";

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
 * Whether a key event asks for the filter.
 * @param event The key event.
 * @returns True for `/` outside a field, or Ctrl/Cmd+K anywhere.
 */
function asksForFilter(event: KeyboardEvent): boolean {
	if (event.altKey || event.shiftKey) return false;
	const command = event.metaKey || event.ctrlKey;
	return command ? event.key.toLowerCase() === "k" : event.key === "/" && !typingIn(event);
}

/**
 * Focus the filter when a person asks for it from anywhere in the shell.
 * @param input The filter field.
 */
function useFindShortcut(input: RefObject<HTMLInputElement | null>): void {
	useEffect(() => {
		/**
		 * Take the key when it asks for the filter.
		 * @param event The key event.
		 */
		const onKeyDown = (event: KeyboardEvent): void => {
			// A presented pane keeps its keys: the filter is not on screen.
			if (document.fullscreenElement !== null) return;
			if (event.defaultPrevented || !asksForFilter(event)) return;
			event.preventDefault();
			input.current?.focus();
			input.current?.select();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [input]);
}

export { useFindShortcut };
