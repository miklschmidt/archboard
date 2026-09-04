import { useEffect, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
	return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(REDUCED_MOTION) : null;
}

/**
 * Whether this person asked for reduced motion.
 *
 * The canonical theme remains the only owner of motion *values*: it collapses
 * the control and status durations under its own media query, and nothing here
 * redeclares them. This hook exists for the one thing a stylesheet cannot
 * express — that a per-animation-frame subscription should not be opened at
 * all. The level meter is the only consumer, and it is supplemental to a named
 * status that is always rendered, so refusing to run it costs no information.
 */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState<boolean>(() => query()?.matches ?? false);
	useEffect(() => {
		const media = query();
		if (media === null) return;
		const update = (): void => setReduced(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	return reduced;
}
