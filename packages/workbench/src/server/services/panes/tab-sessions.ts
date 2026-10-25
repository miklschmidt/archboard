import type { TabSessions } from "#runtime/protocol/voice/extension.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

let installed: TabSessions | null = null;
/**
 * Attach pane registration and browser activation to the core-owned tab sessions.
 * @param tabs The current workbench's tab session store.
 * @returns The cleanup that detaches this store if it remains installed.
 */
function installWorkbenchTabSessions(tabs: TabSessions): () => void {
	if (installed !== null) throw new Error("The browser tab sessions are already installed.");
	installed = tabs;
	return () => {
		if (installed === tabs) installed = null;
	};
}
const tabSessions: TabSessions = {
	/**
	 * Record the tab session that a browser socket names.
	 * @param client The browser client id.
	 * @param id The tab session id, or null when the socket names none.
	 * @returns Nothing after the installed store records the registration.
	 */
	note: (client, id) => installed?.note(client, id),
	/**
	 * Read the tab session that a browser socket names.
	 * @param client The browser client id.
	 * @returns The tab session id, or null when no store or registration exists.
	 */
	of: (client) => installed?.of(client) ?? null,
	/**
	 * Forget a disconnected browser's tab registration.
	 * @param client The browser client id.
	 * @returns Nothing after the installed store releases the registration.
	 */
	forget: (client) => installed?.forget(client),
	/**
	 * Forget every browser registration in the installed store.
	 * @returns Nothing after the installed store releases the registrations.
	 */
	forgetAll: () => installed?.forgetAll(),
	/**
	 * Subscribe to tab sessions that lose their last browser registration.
	 * @param listener Receives ended tab session ids.
	 * @returns The subscription cleanup.
	 */
	onEnded: (listener) => {
		if (installed === null) throw new Error("The workbench tab sessions are not installed.");
		return installed.onEnded(listener);
	},
	/**
	 * Read the tab's shown checkout and pin its first value when necessary.
	 * @param id The tab session id.
	 * @param pin Supplies the initial checkout if the tab shows none.
	 * @returns The shown checkout.
	 */
	shown: (id, pin) => {
		if (installed === null) throw new Error("The workbench tab sessions are not installed.");
		return installed.shown(id, pin);
	},
	/**
	 * Read the tab's shown checkout without pinning an initial value.
	 * @param id The tab session id.
	 * @returns The shown checkout, or null when none exists.
	 */
	current: (id) => installed?.current(id) ?? null,
	/**
	 * Change the tab's shown conversation after browser activation.
	 * @param id The tab session id.
	 * @param checkout The checkout whose conversation the browser activated.
	 * @returns True when the shown checkout changes.
	 */
	show: (id, checkout) => {
		if (installed === null) throw new Error("The workbench tab sessions are not installed.");
		return installed.show(id, checkout);
	},
	/**
	 * Subscribe to tabs whose shown conversations change.
	 * @param listener Receives each changed tab session id.
	 * @returns The subscription cleanup.
	 */
	onShownChange: (listener) => {
		if (installed === null) throw new Error("The workbench tab sessions are not installed.");
		return installed.onShownChange(listener);
	},
};

/**
 * Remember which tab a pane belongs to, as its authoritative socket named it.
 * @param clientId The pane's client id.
 * @param tabSessionId The tab session the socket named, or null when it named none.
 */
function noteTabSession(clientId: string, tabSessionId: TabSessionId | null): void {
	tabSessions.note(clientId, tabSessionId);
}

/**
 * The tab a pane belongs to.
 * @param clientId The pane's client id.
 * @returns Its tab session, or null while its socket named none.
 */
function tabSessionOf(clientId: string): TabSessionId | null {
	return tabSessions.of(clientId);
}

/**
 * Forget the tab of a pane whose socket has gone.
 * @param clientId The pane's client id.
 */
function forgetTabSession(clientId: string): void {
	tabSessions.forget(clientId);
}

/**
 * The checkout whose conversation a pane's tab shows (ADR 0050). A pane whose socket named no tab
 * shows its own checkout's.
 * @param clientId The pane's client id.
 * @param own The checkout of the pane's own vault, which pins a tab that shows none yet.
 * @returns The shown checkout.
 */
function shownCheckoutOf(clientId: string, own: () => string): string {
	const tabSessionId = tabSessions.of(clientId);
	return tabSessionId === null ? own() : tabSessions.shown(tabSessionId, own);
}

/**
 * The checkout whose conversation a tab shows.
 * @param tabSessionId The tab.
 * @returns It, or null before anything read it.
 */
function currentShownCheckout(tabSessionId: TabSessionId): string | null {
	return tabSessions.current(tabSessionId);
}

/**
 * Show a checkout's conversation in a tab, because the person activated it.
 * @param tabSessionId The tab.
 * @param checkout The checkout.
 * @returns True when the tab showed another checkout's before.
 */
function showConversation(tabSessionId: TabSessionId, checkout: string): boolean {
	return tabSessions.show(tabSessionId, checkout);
}

/**
 * Hear each tab whose shown conversation changed.
 * @param listener Told the tab's id.
 * @returns How to stop listening.
 */
function onShownChange(listener: (tabSessionId: TabSessionId) => void): () => void {
	return tabSessions.onShownChange(listener);
}

/** Forget every pane's tab, because the server is stopping and there is no screen any more. */
function forgetTabSessions(): void {
	tabSessions.forgetAll();
}

export {
	installWorkbenchTabSessions,
	currentShownCheckout,
	forgetTabSession,
	forgetTabSessions,
	noteTabSession,
	onShownChange,
	showConversation,
	shownCheckoutOf,
	tabSessionOf,
};
export type { TabSessions };
