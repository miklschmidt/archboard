// What the navigator lists: the reading's architecture, or the files of its code (TASK-649). The
// choice is the person's, kept in this browser, and one for the whole window, because there is one
// navigator and it speaks for the focused pane. A link or agent show that names a file opens in
// Code, so it shows the file. After that the choice holds: Architecture keeps a pane's file in its
// address, and Code shows it again.

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
	chooseNavigatorMode,
	navigatorModeNow,
	onNavigatorModeChange,
} from "#ui/application/clients/navigator-mode.ts";
import type { NavigatorMode } from "#ui/shell/rules/contracts.ts";

/** The navigator's mode and the way to change it. */
interface NavigatorModeState {
	readonly mode: NavigatorMode;
	readonly setMode: (mode: NavigatorMode) => void;
	/** Leave Code, as dragging the code view shut does. */
	readonly leaveCode: () => void;
}

/**
 * What the navigator lists, and the way to choose.
 * @returns The mode and its moves.
 */
function useNavigatorMode(): NavigatorModeState {
	const mode = useSyncExternalStore(onNavigatorModeChange, navigatorModeNow, navigatorModeNow);
	const setMode = useCallback((next: NavigatorMode): void => {
		chooseNavigatorMode(next);
	}, []);
	const leaveCode = useCallback((): void => chooseNavigatorMode("architecture"), []);
	return useMemo(() => ({ mode, setMode, leaveCode }), [mode, setMode, leaveCode]);
}

export { useNavigatorMode };
