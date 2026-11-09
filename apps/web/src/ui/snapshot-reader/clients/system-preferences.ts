// The snapshot page has no settings: it follows the system's preferences.

const DARK = "(prefers-color-scheme: dark)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Put the system's theme on the root element, where the stylesheet reads it, now and whenever the
 * preference changes.
 * @param root The root element of the page.
 */
function followSystemTheme(root: HTMLElement): void {
	const media = window.matchMedia(DARK);
	/** Put the preferred theme on the root. */
	const apply = (): void => {
		root.dataset["theme"] = media.matches ? "dark" : "light";
	};
	apply();
	media.addEventListener("change", apply);
}

/**
 * Whether the system asks for reduced motion, so that the camera lands at once.
 * @returns True when it does.
 */
function prefersReducedMotion(): boolean {
	return window.matchMedia(REDUCED_MOTION).matches;
}

export { followSystemTheme, prefersReducedMotion };
