// The keys a presented walkthrough answers to, wherever focus is in the pane.
//
// A presentation is stepped the way slides are: arrows, Space and Page keys
// move a step, Home and End go to the ends, Escape leaves. They are heard on
// the window, before the diagram's own keys, because a presentation is the one
// thing the pane is doing while it lasts and Escape must leave it rather than
// clear a selection underneath. A key typed into a field is left alone.

import { useEffect } from "react";

/** How far each stepping key moves. */
const STEP_KEYS: Readonly<Record<string, number>> = {
	ArrowRight: 1,
	ArrowDown: 1,
	PageDown: 1,
	" ": 1,
	ArrowLeft: -1,
	ArrowUp: -1,
	PageUp: -1,
};

/** What the keys do. */
interface PresentationKeys {
	/** Which step is shown. */
	readonly index: number;
	/** How many steps there are. */
	readonly count: number;
	/**
	 * Show a step.
	 * @param index The step.
	 */
	readonly go: (index: number) => void;
	/** Leave the presentation. */
	readonly leave: () => void;
}

/**
 * The step a key moves to.
 * @param key The key.
 * @param index The step shown.
 * @param count How many steps there are.
 * @returns The step, or null when the key is not a stepping key.
 */
function stepFor(key: string, index: number, count: number): number | null {
	const step = STEP_KEYS[key];
	if (step !== undefined) {
		return Math.min(count - 1, Math.max(0, index + step));
	}
	if (key === "Home") {
		return 0;
	}
	return key === "End" ? count - 1 : null;
}

/**
 * Whether a key was typed into something that takes text or a choice.
 * @param target Where the key went.
 * @returns True for a field.
 */
function typedIntoField(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
	);
}

/**
 * Whether a key is one a presentation leaves alone: already handled, typed into
 * a field, or held with a modifier that makes it somebody else's shortcut.
 * @param event The key.
 * @returns True to ignore it.
 */
function notOurs(event: KeyboardEvent): boolean {
	return event.defaultPrevented || typedIntoField(event.target) || event.metaKey || event.ctrlKey;
}

/**
 * Listen for a presentation's keys while it is open.
 * @param keys The step shown, how many there are, and what stepping and leaving do.
 * @param open Whether a walkthrough is presented.
 */
function usePresentationKeys(keys: PresentationKeys, open: boolean): void {
	const { index, count, go, leave } = keys;
	useEffect(() => {
		if (!open) {
			return undefined;
		}
		/**
		 * Step, or leave, for one key.
		 * @param event The key.
		 */
		function onKey(event: KeyboardEvent): void {
			if (notOurs(event)) {
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				leave();
				return;
			}
			const next = stepFor(event.key, index, count);
			if (next === null) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (next !== index) {
				go(next);
			}
		}
		window.addEventListener("keydown", onKey, { capture: true });
		return (): void => window.removeEventListener("keydown", onKey, { capture: true });
	}, [open, index, count, go, leave]);
}

export { stepFor, usePresentationKeys };
