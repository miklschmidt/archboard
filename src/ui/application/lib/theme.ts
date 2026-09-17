// Persist the theme a person chose in browser storage.

import type { ThemeChoice } from "@/ui/shell";

const THEME_STORAGE_KEY = "archboard.theme";

/**
 * Whether a stored value is a theme.
 * @param value What storage held.
 * @returns True for the two themes.
 */
function isThemeChoice(value: string | null): value is ThemeChoice {
	return value === "light" || value === "dark";
}

/**
 * The theme to start with: the stored choice, else the system preference.
 * @returns A theme.
 */
function initialTheme(): ThemeChoice {
	let stored: string | null = null;
	try {
		stored = window.localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		stored = null;
	}
	if (isThemeChoice(stored)) {
		return stored;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Put the theme on the root element, where the stylesheet reads it, and
 * remember it.
 * @param theme The chosen theme.
 */
function applyTheme(theme: ThemeChoice): void {
	const root = document.documentElement;
	const previous = root.dataset["theme"];
	if (previous === undefined) {
		// The first theme of the page: nothing has been drawn in another palette,
		// so there is no cross-fade to prevent, and forcing a style flush here
		// would only recalculate the whole stylesheet once more before first paint.
		root.dataset["theme"] = theme;
	} else if (previous !== theme) {
		// One frame without transitions: the palette swaps whole, never cross-fades.
		root.dataset["themeSwitching"] = "";
		root.dataset["theme"] = theme;
		void root.offsetWidth;
		window.requestAnimationFrame(() => {
			delete root.dataset["themeSwitching"];
		});
	}
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage can be unavailable; the choice still applies for this session.
	}
}

export { THEME_STORAGE_KEY, initialTheme, applyTheme };
