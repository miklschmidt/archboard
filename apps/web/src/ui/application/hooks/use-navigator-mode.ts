// What the navigator lists: the reading's architecture, or the files of its code (TASK-649). The
// choice is the person's, kept in this browser, and one for the whole window, because there is one
// navigator and it speaks for the focused pane. A link that names a file opens in Code, so it shows
// the file. After that the choice holds: Architecture keeps a pane's file in its address, and Code
// shows it again.

import { useCallback, useMemo, useState } from "react";

import type { NavigatorMode } from "#ui/shell/rules/contracts.ts";

const STORAGE_KEY = "archboard.navigator.mode";

/** A pane's file in the address: `fileA`, `fileB`. */
const FILE_PARAMETER = /^file[A-Z]$/u;

/**
 * Whether the page's address names a file in any pane.
 * @returns True when it does.
 */
function addressNamesFile(): boolean {
	return [...new URLSearchParams(window.location.search).keys()].some((key) =>
		FILE_PARAMETER.test(key),
	);
}

/**
 * The mode the window starts in: Code for a link to a file, else the person's last choice.
 * @returns The mode.
 */
function initialMode(): NavigatorMode {
	if (addressNamesFile()) return "code";
	try {
		return window.localStorage.getItem(STORAGE_KEY) === "code" ? "code" : "architecture";
	} catch {
		return "architecture";
	}
}

/**
 * Keep the choice, when the browser lets us.
 * @param mode The mode.
 */
function storeMode(mode: NavigatorMode): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// The choice still holds for this session.
	}
}

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
	const [mode, setState] = useState(initialMode);
	const setMode = useCallback((next: NavigatorMode): void => {
		setState(next);
		storeMode(next);
	}, []);
	const leaveCode = useCallback((): void => setMode("architecture"), [setMode]);
	return useMemo(() => ({ mode, setMode, leaveCode }), [mode, setMode, leaveCode]);
}

export { useNavigatorMode };
