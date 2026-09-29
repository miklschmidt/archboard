// The tab session every pane of this browser tab names to the server (TASK-373).
//
// Kept in sessionStorage, which belongs to one tab: a reload keeps the id, and a new tab or
// window starts without one and mints its own. A tab the browser duplicated starts with a copy
// of the original's storage, so it shares the original's session.

const TAB_SESSION_STORAGE_KEY = "archboard.tabSession";

/** The id this page uses while storage cannot hold one, so every pane still names the same. */
let pageFallback: string | null = null;

/**
 * The tab's own session id: the stored one, else a new one that is stored for the next load.
 * @returns The id.
 */
function tabSessionId(): string {
	try {
		const stored = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
		if (stored !== null && stored.length > 0) {
			return stored;
		}
		const minted = crypto.randomUUID();
		window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, minted);
		return minted;
	} catch {
		// Storage can be unavailable; this page keeps one id, and a reload starts another.
		pageFallback ??= crypto.randomUUID();
		return pageFallback;
	}
}

export { TAB_SESSION_STORAGE_KEY, tabSessionId };
