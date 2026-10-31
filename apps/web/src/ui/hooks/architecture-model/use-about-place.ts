import { useCallback, useMemo, useRef } from "react";

/**
 * Where About was scrolled to on one subject. The page goes while the diagram is read and comes
 * back where the reader left it. The place is kept outside React's state, because a page that
 * scrolls has no reason to draw again.
 * @param subject What the page describes.
 * @returns How far down the page was, and the way to keep that.
 */
function useAboutPlace(subject: string) {
	const scrolled = useRef({ subject, top: 0 });
	const recall = useCallback(
		(): number => (scrolled.current.subject === subject ? scrolled.current.top : 0),
		[subject],
	);
	const keep = useCallback(
		(top: number): void => {
			scrolled.current = { subject, top };
		},
		[subject],
	);
	return useMemo(() => ({ recall, keep }), [recall, keep]);
}

export { useAboutPlace };
