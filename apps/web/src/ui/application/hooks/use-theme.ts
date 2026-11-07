import { useEffect, useState } from "react";

import { applyTheme, initialTheme } from "#ui/application/clients/theme.ts";
import type { ThemeChoice } from "#ui/shell/rules/contracts.ts";

/**
 * The theme as state, applied to the document.
 * @returns The theme and its setter.
 */
function useTheme(): [ThemeChoice, (theme: ThemeChoice) => void] {
	const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);
	return [theme, setTheme];
}

export { useTheme };
