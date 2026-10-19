// Whether the person asked for reduced motion, followed live.

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Hear the media query change.
 * @param listener What to call.
 * @returns Stops listening.
 */
function subscribe(listener: () => void): () => void {
	const media = window.matchMedia(QUERY);
	media.addEventListener("change", listener);
	return () => media.removeEventListener("change", listener);
}

/**
 * Whether reduced motion is preferred now.
 * @returns True when it is.
 */
function read(): boolean {
	return window.matchMedia(QUERY).matches;
}

/**
 * Whether the person prefers reduced motion.
 * @returns True when the media query matches.
 */
function useReducedMotion(): boolean {
	return useSyncExternalStore(subscribe, read, read);
}

export { useReducedMotion };
