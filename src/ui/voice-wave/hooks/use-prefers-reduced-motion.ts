// The reduced-motion preference, followed live, for the wave's own use.

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Subscribes to the reduced-motion media query.
 * @param onChange Called when the preference changes.
 * @returns The unsubscribe function.
 */
function subscribeReducedMotion(onChange: () => void): () => void {
	const query = window.matchMedia(REDUCED_MOTION_QUERY);
	query.addEventListener("change", onChange);
	return () => {
		query.removeEventListener("change", onChange);
	};
}

/**
 * The current reduced-motion preference.
 * @returns True when the person asked for reduced motion.
 */
function readReducedMotion(): boolean {
	return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * The preference when there is no window to ask.
 * @returns False.
 */
function readReducedMotionOnServer(): boolean {
	return false;
}

/**
 * Whether the person prefers reduced motion, kept current with the media query.
 * @returns True when motion should be reduced.
 */
function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readReducedMotionOnServer);
}

export { usePrefersReducedMotion };
