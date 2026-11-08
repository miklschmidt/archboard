// Whether an element has come near the visible part of the list it scrolls in, so that what it
// costs to draw can wait until a reader can reach it.

import { useEffect, useState } from "react";

/** How far outside the visible part of its list an element already counts as near. */
const NEAR = "600px 0px";

/**
 * Whether an element has come near the visible part of the list it scrolls in. The list is the
 * nearest element marked `data-scroll-root`, or the page. Once near, an element stays near.
 * A browser that cannot tell counts every element as near.
 * @returns The ref for the element, and whether it has come near.
 */
function useNearScroll(): {
	readonly ref: (element: Element | null) => void;
	readonly near: boolean;
} {
	const [element, setElement] = useState<Element | null>(null);
	const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
	useEffect(() => {
		if (element === null || near) return undefined;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) setNear(true);
			},
			{ root: element.closest("[data-scroll-root]"), rootMargin: NEAR },
		);
		observer.observe(element);
		return (): void => {
			observer.disconnect();
		};
	}, [element, near]);
	return { ref: setElement, near };
}

export { useNearScroll };
