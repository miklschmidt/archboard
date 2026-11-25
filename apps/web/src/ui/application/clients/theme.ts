// Persist the theme a person or agent chose in browser storage.

import type { ThemeChoice } from "#ui/shell/rules/contracts.ts";

/** Theme preference: an explicit theme, or following the operating system. */
type ThemePreference = ThemeChoice | "system";

const THEME_STORAGE_KEY = "archboard.theme";

/**
 * Whether a stored value is an explicit theme choice.
 * @param value What storage held.
 * @returns True for light or dark.
 */
function isThemeChoice(value: string | null): value is ThemeChoice {
	return value === "light" || value === "dark";
}

/**
 * Read the operating system's dark-mode preference.
 * @returns The resolved theme choice.
 */
function systemTheme(): ThemeChoice {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return "light";
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The remembered preference: light, dark, or system when nothing is stored.
 * @returns The theme preference.
 */
function rememberedPreference(): ThemePreference {
	try {
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
		return isThemeChoice(stored) ? stored : "system";
	} catch {
		return "system";
	}
}

let preference: ThemePreference | undefined;
let listeningMedia = false;
const listeners = new Set<() => void>();

/** Notify every subscriber when either the stored preference or system theme changes. */
function notify(): void {
	for (const listener of listeners) listener();
}

/** Follow OS color-scheme changes while the preference is `system`. */
function ensureSystemListener(): void {
	if (listeningMedia || typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return;
	}
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	if (typeof media.addEventListener !== "function") return;
	listeningMedia = true;
	media.addEventListener("change", () => {
		if (themePreferenceNow() === "system") {
			applyThemeDom(systemTheme());
			notify();
		}
	});
}

/**
 * The theme preference now: light, dark, or system.
 * @returns The theme preference.
 */
function themePreferenceNow(): ThemePreference {
	preference ??= rememberedPreference();
	return preference;
}

/**
 * The effective theme applied to the page right now.
 * @returns Light or dark.
 */
function themeNow(): ThemeChoice {
	const current = themePreferenceNow();
	return current === "system" ? systemTheme() : current;
}

/**
 * The theme to start with: the stored choice, else the system preference.
 * @returns A theme.
 */
function initialTheme(): ThemeChoice {
	return themeNow();
}

/**
 * Put the effective theme on the document root without rewriting storage.
 * @param theme The resolved theme.
 */
function applyThemeDom(theme: ThemeChoice): void {
	if (typeof document === "undefined") return;
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
}

/**
 * Put the theme on the root element, where the stylesheet reads it, and
 * remember it.
 * @param theme The chosen theme.
 */
function applyTheme(theme: ThemeChoice): void {
	applyThemeDom(theme);
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage can be unavailable; the choice still applies for this session.
	}
}

/**
 * Choose a theme preference (`light`, `dark`, or `system`), apply it immediately, and notify subscribers.
 * @param next The desired theme preference.
 */
function chooseTheme(next: ThemePreference): void {
	ensureSystemListener();
	const previousPreference = themePreferenceNow();
	const previousEffective = themeNow();
	preference = next;
	try {
		if (next === "system") {
			window.localStorage.removeItem(THEME_STORAGE_KEY);
		} else {
			window.localStorage.setItem(THEME_STORAGE_KEY, next);
		}
	} catch {
		// Storage can be unavailable; the choice still applies for this session.
	}
	const resolved = themeNow();
	applyThemeDom(resolved);
	if (previousPreference !== next || previousEffective !== resolved) {
		notify();
	}
}

/**
 * Subscribe to theme changes.
 * @param listener Called after each theme or preference change.
 * @returns Unsubscribe callback.
 */
function onThemeChange(listener: () => void): () => void {
	ensureSystemListener();
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export {
	applyTheme,
	applyThemeDom,
	chooseTheme,
	initialTheme,
	onThemeChange,
	themeNow,
	themePreferenceNow,
	type ThemePreference,
};
