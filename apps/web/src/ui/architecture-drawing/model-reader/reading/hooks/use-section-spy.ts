// Which section of a scrolling page is being read, from where the page is
// scrolled to: the last section whose top has reached a line a little below
// the top of the page's room, or the first while none has. A page scrolled to
// its end is reading its last section, which may be too short to reach the
// line. The scroll position is the browser's, so this is read from the page as
// an outside store rather than kept as state.

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
 * The last section whose top has reached the read line, or the first. At the end of the page, the
 * last section.
 * @param page The page that scrolls.
 * @param sections Each section's key, in order.
 * @returns The key, or null when there are no sections.
 */
function sectionAt(page: HTMLElement, sections: readonly string[]): string | null {
	if (atEnd(page)) return sections.at(-1) ?? null;
	const line = page.getBoundingClientRect().top + READ_LINE;
	return sections.findLast((key) => reaches(page, key, line)) ?? sections[0] ?? null;
}

/**
 * Whether a section's top has reached a line.
 * @param page The page that holds it.
 * @param key The section.
 * @param line The line, in the page's coordinates.
 * @returns Whether it has.
 */
function reaches(page: HTMLElement, key: string, line: number): boolean {
	const section = page.querySelector(`[data-about-section="${key}"]`);
	return section !== null && section.getBoundingClientRect().top <= line;
}

/**
 * Whether a page that scrolls is scrolled to its end.
 * @param page The page.
 * @returns Whether it is.
 */
function atEnd(page: HTMLElement): boolean {
	const { scrollTop, scrollHeight, clientHeight } = page;
	return scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - 1;
}

export { useSectionSpy };
