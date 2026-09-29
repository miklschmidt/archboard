// Which browser tab each pane on screen belongs to (TASK-373).
//
// A pane's socket names its tab's session (`?tabSession=`), which both panes of one tab share and
// every other tab mints for itself. Keyed by client id, and held while the pane's socket is: the
// pane's authoritative socket records it, and the same socket's close forgets it.

import type { TabSessionId } from "@/server/codex-workbench";

const tabSessionByClient = new Map<string, TabSessionId>();

/**
 * Remember which tab a pane belongs to, as its authoritative socket named it.
 * @param clientId The pane's client id.
 * @param tabSessionId The tab session the socket named, or null when it named none.
 */
function noteTabSession(clientId: string, tabSessionId: TabSessionId | null): void {
	if (tabSessionId === null) {
		tabSessionByClient.delete(clientId);
	} else {
		tabSessionByClient.set(clientId, tabSessionId);
	}
}

/**
 * The tab a pane belongs to.
 * @param clientId The pane's client id.
 * @returns Its tab session, or null while its socket named none.
 */
function tabSessionOf(clientId: string): TabSessionId | null {
	return tabSessionByClient.get(clientId) ?? null;
}

/**
 * Forget the tab of a pane whose socket has gone.
 * @param clientId The pane's client id.
 */
function forgetTabSession(clientId: string): void {
	tabSessionByClient.delete(clientId);
}

/** Forget every pane's tab, because the server is stopping and there is no screen any more. */
function forgetTabSessions(): void {
	tabSessionByClient.clear();
}

export { forgetTabSession, forgetTabSessions, noteTabSession, tabSessionOf };
