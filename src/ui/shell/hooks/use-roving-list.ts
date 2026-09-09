// A roving tabindex for one list of controls: the list is a single tab stop,
// the arrow keys move focus between its visible items, Home and End reach the
// ends, and the item last focused keeps the stop so Tab returns to it. The
// items activate themselves: they are buttons, so Enter and Space are theirs.

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

/** The attributes one item spreads onto its control. */
interface RovingItemAttributes {
	tabIndex: 0 | -1;
	"data-roving-id": string;
	onFocus: () => void;
}

/** Inputs for a component that is one roving item. */
interface RovingItemProps {
	roving: RovingItemAttributes;
}

/** One list's roving state, spread onto its items and its container. */
interface RovingList {
	/**
	 * The attributes for one item.
	 * @param id The item's stable id within the list.
	 * @returns Its tab stop and focus report.
	 */
	item: (id: string) => RovingItemAttributes;
	/** The container's key handler: the arrows, Home and End. */
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * The index the key moves to.
 * @param key The key pressed.
 * @param index The focused item's index.
 * @param count How many items the list has.
 * @returns The next index, or null for a key the list does not handle.
 */
function targetIndex(key: string, index: number, count: number): number | null {
	switch (key) {
		case "ArrowDown":
			return Math.min(index + 1, count - 1);
		case "ArrowUp":
			return Math.max(index - 1, 0);
		case "Home":
			return 0;
		case "End":
			return count - 1;
		default:
			return null;
	}
}

/**
 * The list's visible items in document order. A collapsed group's rows are
 * in the tree but not on screen, so the arrows skip them.
 * @param container The list element.
 * @returns The focusable items.
 */
function visibleItems(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>("[data-roving-id]")].filter(
		(item) => item.offsetParent !== null,
	);
}

/**
 * One list's roving tabindex.
 * @param ids Every item id the list renders, in order; the first holds the stop until an item is focused.
 * @returns The list's item attributes and key handler.
 */
function useRovingList(ids: readonly string[]): RovingList {
	const [activeId, setActiveId] = useState<string | null>(null);
	// An item that has gone gives the stop back to the first.
	const current = activeId !== null && ids.includes(activeId) ? activeId : (ids[0] ?? null);
	const item = useCallback(
		(id: string): RovingItemAttributes => ({
			tabIndex: current === id ? 0 : -1,
			"data-roving-id": id,
			/** Focus, from a click or the arrows, moves the tab stop here. */
			onFocus: (): void => {
				setActiveId(id);
			},
		}),
		[current],
	);
	const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>): void => {
		const items = visibleItems(event.currentTarget);
		const index = items.findIndex((candidate) => candidate === document.activeElement);
		const next = index === -1 ? null : targetIndex(event.key, index, items.length);
		const target = next === null ? undefined : items[next];
		if (target === undefined) {
			return;
		}
		event.preventDefault();
		target.focus();
	}, []);
	return useMemo(() => ({ item, onKeyDown }), [item, onKeyDown]);
}

export { useRovingList, type RovingItemAttributes, type RovingItemProps, type RovingList };
