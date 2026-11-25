import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
	applyThemeDom,
	chooseTheme,
	onThemeChange,
	themeNow,
	themePreferenceNow,
	type ThemePreference,
} from "#ui/application/clients/theme.ts";
import type { ThemeChoice } from "#ui/shell/rules/contracts.ts";

/**
 * The theme as state, applied to the document and synchronized with external updates.
 * @returns The effective theme and its setter.
 */
function useTheme(): [ThemeChoice, (theme: ThemeChoice) => void] {
	const theme = useSyncExternalStore(onThemeChange, themeNow, themeNow);
	useEffect(() => {
		applyThemeDom(theme);
	}, [theme]);
	const setTheme = useCallback((next: ThemeChoice): void => {
		chooseTheme(next);
	}, []);
	return [theme, setTheme];
}

/**
 * The stored theme preference (`light`, `dark`, or `system`), for reporting to agents.
 * @returns The current theme preference.
 */
function useThemePreference(): ThemePreference {
	return useSyncExternalStore(onThemeChange, themePreferenceNow, themePreferenceNow);
}

export { useTheme, useThemePreference };
