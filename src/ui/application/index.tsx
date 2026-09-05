// The application root: owns the theme choice and hands the shell its view.

import { useCallback, useEffect, useMemo, useState } from "react";

import { EXAMPLE_ACTIONS, EXAMPLE_VIEW } from "@/ui/application/lib/presentation-example";
import { applyTheme, initialTheme } from "@/ui/application/lib/theme";
import { TooltipProvider } from "@/ui/components/tooltip";
import {
	Shell,
	type ShellActions,
	type ShellPresentation,
	type ShellView,
	type ThemeChoice,
} from "@/ui/shell";

/**
 * The root component.
 * @returns The shell inside its providers.
 */
function Application(): React.JSX.Element {
	const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
	const [presentation, setPresentation] = useState<ShellPresentation | null>(null);
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);
	const handleTheme = useCallback((next: ThemeChoice) => setTheme(next), []);
	const handlePresent = useCallback((next: ShellPresentation | null) => setPresentation(next), []);
	const view = useMemo<ShellView>(
		() => ({ ...EXAMPLE_VIEW, theme, presentation }),
		[theme, presentation],
	);
	const actions = useMemo<ShellActions>(
		() => ({ ...EXAMPLE_ACTIONS, setTheme: handleTheme, present: handlePresent }),
		[handleTheme, handlePresent],
	);
	return (
		<TooltipProvider>
			<Shell view={view} actions={actions} />
		</TooltipProvider>
	);
}

export { Application };
