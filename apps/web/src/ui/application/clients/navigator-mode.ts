// Persist which navigator listing mode (Architecture or Code) this browser window shows.

import type { NavigatorMode } from "#ui/shell/rules/contracts.ts";

const STORAGE_KEY = "archboard.navigator.mode";

/** A pane's file in the address: `fileA`, `fileB`. */
const FILE_PARAMETER = /^file[A-Z]$/u;

/**
 * Whether the page's address names a file in any pane.
 * @returns True when it does.
 */
function addressNamesFile(): boolean {
	if (typeof window === "undefined") return false;
	return [...new URLSearchParams(window.location.search).keys()].some((key) =>
		FILE_PARAMETER.test(key),
	);
}

/**
 * The mode the window starts in: Code for a link to a file, else the person's last choice.
 * @returns The mode.
 */
function rememberedMode(): NavigatorMode {
	if (addressNamesFile()) return "code";
	try {
		return window.localStorage.getItem(STORAGE_KEY) === "code" ? "code" : "architecture";
	} catch {
		return "architecture";
	}
}

let current: NavigatorMode | undefined;
const listeners = new Set<() => void>();

/**
 * The navigator mode now.
 * @returns The mode.
 */
function navigatorModeNow(): NavigatorMode {
	current ??= rememberedMode();
	return current;
}

/**
 * Switch the navigator mode and persist it in browser storage.
 * @param mode The next mode.
 */
function chooseNavigatorMode(mode: NavigatorMode): void {
	if (mode === navigatorModeNow()) return;
	current = mode;
	try {
		window.localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// The choice still holds for this session.
	}
	for (const listener of listeners) listener();
}

/**
 * Subscribe to navigator mode changes.
 * @param listener Called after each mode change.
 * @returns Unsubscribe callback.
 */
function onNavigatorModeChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export { chooseNavigatorMode, navigatorModeNow, onNavigatorModeChange };
