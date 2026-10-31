import { useCallback, useMemo, useRef } from "react";

/**
 * Where About was scrolled to on one subject. The page goes while the diagram is read and comes
 * back where the reader left it, or at the section a reader asked for until they scroll on from
 * it. The place is kept outside React's state, because a page that scrolls has no reason to draw
 * again.
 * @param subject What the page describes.
 * @returns How far down the page was, the section asked for, and the ways to change them.
 */
function useAboutPlace(subject: string) {
	const scrolled = useRef({ subject, top: 0 });
	const section = useRef<string | null>(null);
	const recall = useCallback(
		(): number => (scrolled.current.subject === subject ? scrolled.current.top : 0),
		[subject],
	);
	const keep = useCallback(
		(top: number): void => {
			scrolled.current = { subject, top };
			section.current = null;
		},
		[subject],
	);
	const asked = useCallback((): string | null => section.current, []);
	const ask = useCallback((key: string): void => {
		section.current = key;
	}, []);
	return useMemo(() => ({ recall, keep, asked, ask }), [recall, keep, asked, ask]);
}

export { useAboutPlace };
