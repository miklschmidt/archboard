// Which section of a scrolling page is being read, from where the page is
// scrolled to: the last section whose top has reached a line a little below
// the top of the page's room, or the first while none has. The page's last
// section is as tall as the page's room (`AboutPage`), so every section can
// reach the line and be marked. The scroll position is the browser's, so this
// is read from the page as an outside store rather than kept as state.

import { useCallback, useSyncExternalStore } from "react";

/** How far below the top of the page's room a section's top counts as being read. */
const READ_LINE = 96;

/**
 * Nothing to stop listening to.
 */
function ignore(): void {
	// The page is not there yet, so nothing was listened to.
}

/**
 * The section being read.
 * @param page The page that scrolls, or null before it is there.
 * @param sections Each section's key, in the order the page lays them out.
 * @returns The key of the section being read, or null when the page has none.
 */
function useSectionSpy(page: HTMLElement | null, sections: readonly string[]): string | null {
	const subscribe = useCallback(
		(changed: () => void): (() => void) => {
			if (page === null) return ignore;
			page.addEventListener("scroll", changed, { passive: true });
			return () => {
				page.removeEventListener("scroll", changed);
			};
		},
		[page],
	);
	const read = useCallback(
		(): string | null => (page === null ? (sections[0] ?? null) : sectionAt(page, sections)),
		[page, sections],
	);
	return useSyncExternalStore(subscribe, read, read);
}

/**
 * The last section whose top has reached the read line, or the first.
 * @param page The page that scrolls.
 * @param sections Each section's key, in order.
 * @returns The key, or null when there are no sections.
 */
function sectionAt(page: HTMLElement, sections: readonly string[]): string | null {
	const line = page.getBoundingClientRect().top + READ_LINE;
	let found = sections[0] ?? null;
	for (const key of sections) {
		const section = page.querySelector(`[data-about-section="${key}"]`);
		if (section !== null && section.getBoundingClientRect().top <= line) found = key;
	}
	return found;
}

export { useSectionSpy };
