import { TAB_SESSION_GRACE_MS } from "@archboard/timing";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

/** The panes on screen by tab, and when each tab that has none left ends. */
interface TabSessions {
	/** Remember which tab a pane belongs to, as its authoritative socket named it. */
	readonly note: (clientId: string, tabSessionId: TabSessionId | null) => void;
	/** The tab a pane belongs to, or null while its socket named none. */
	readonly of: (clientId: string) => TabSessionId | null;
	/** Forget the tab of a pane whose socket has gone; its tab's grace starts if it was the last. */
	readonly forget: (clientId: string) => void;
	/** Forget every pane and every grace, because the server is stopping. Nothing ends. */
	readonly forgetAll: () => void;
	/** Hear each tab session that ended, once the grace passed with no pane of it back. */
	readonly onEnded: (listener: (tabSessionId: TabSessionId) => void) => () => void;
	/**
	 * The checkout whose conversation a tab shows. A tab that shows none yet is pinned to the
	 * checkout the asker names.
	 */
	readonly shown: (tabSessionId: TabSessionId, pin: () => string) => string;
	/** The checkout whose conversation a tab shows, or null before anything read it. */
	readonly current: (tabSessionId: TabSessionId) => string | null;
	/** Show a checkout's conversation in a tab, as the person activated it; true when it changed. */
	readonly show: (tabSessionId: TabSessionId, checkout: string) => boolean;
	/** Hear each tab whose shown conversation changed. */
	readonly onShownChange: (listener: (tabSessionId: TabSessionId) => void) => () => void;
}

/**
 * Add a listener to a set, and say how to take it out again.
 * @param listeners The set.
 * @param listener The listener.
 * @returns How to stop listening.
 */
function subscribe<Listener>(listeners: Set<Listener>, listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * The panes on screen by tab, and the grace each tab with no pane left has to come back in.
 * @param graceMs How long a tab with no pane left still holds its conversation.
 * @returns The tab sessions.
 */
function createTabSessions(graceMs: number = TAB_SESSION_GRACE_MS): TabSessions {
	const byClient = new Map<string, TabSessionId>();
	const graces = new Map<TabSessionId, ReturnType<typeof setTimeout>>();
	const listeners = new Set<(tabSessionId: TabSessionId) => void>();
	const shownByTab = new Map<TabSessionId, string>();
	const shownListeners = new Set<(tabSessionId: TabSessionId) => void>();

	/**
	 * Whether any pane on screen belongs to a tab.
	 * @param tabSessionId The tab.
	 * @returns True while one does.
	 */
	const present = (tabSessionId: TabSessionId): boolean =>
		[...byClient.values()].includes(tabSessionId);

	/**
	 * Start a tab's grace once its last pane has gone.
	 * @param tabSessionId The tab a pane just left.
	 */
	const left = (tabSessionId: TabSessionId): void => {
		if (present(tabSessionId) || graces.has(tabSessionId)) {
			return;
		}
		const grace = setTimeout(() => {
			graces.delete(tabSessionId);
			shownByTab.delete(tabSessionId);
			for (const listener of listeners) listener(tabSessionId);
		}, graceMs);
		grace.unref();
		graces.set(tabSessionId, grace);
	};

	/**
	 * A pane of a tab is on screen: the tab is not ending.
	 * @param tabSessionId The tab.
	 */
	const arrived = (tabSessionId: TabSessionId): void => {
		clearTimeout(graces.get(tabSessionId));
		graces.delete(tabSessionId);
	};

	return Object.freeze({
		/**
		 * Remember which tab a pane belongs to; a pane that moved tabs leaves the old one.
		 * @param clientId The pane's client id.
		 * @param tabSessionId The tab its socket named, or null.
		 */
		note: (clientId, tabSessionId) => {
			const previous = byClient.get(clientId);
			if (tabSessionId === null) {
				byClient.delete(clientId);
			} else {
				byClient.set(clientId, tabSessionId);
				arrived(tabSessionId);
			}
			if (previous !== undefined && previous !== tabSessionId) {
				left(previous);
			}
		},
		/**
		 * The tab a pane belongs to.
		 * @param clientId The pane's client id.
		 * @returns Its tab session, or null.
		 */
		of: (clientId) => byClient.get(clientId) ?? null,
		/**
		 * Forget a pane whose socket has gone.
		 * @param clientId The pane's client id.
		 */
		forget: (clientId) => {
			const previous = byClient.get(clientId);
			byClient.delete(clientId);
			if (previous !== undefined) {
				left(previous);
			}
		},
		/** Forget every pane and every grace, ending nothing. */
		forgetAll: () => {
			byClient.clear();
			for (const grace of graces.values()) clearTimeout(grace);
			graces.clear();
			shownByTab.clear();
		},
		/**
		 * Hear each tab session that ended.
		 * @param listener Told the session's id.
		 * @returns How to stop listening.
		 */
		onEnded: (listener) => subscribe(listeners, listener),
		/**
		 * The checkout whose conversation a tab shows, pinned on the first read.
		 * @param tabSessionId The tab.
		 * @param pin The checkout to pin a tab that shows none yet to.
		 * @returns The shown checkout.
		 */
		shown: (tabSessionId, pin) => {
			const shown = shownByTab.get(tabSessionId);
			if (shown !== undefined) {
				return shown;
			}
			const pinned = pin();
			shownByTab.set(tabSessionId, pinned);
			return pinned;
		},
		/**
		 * The checkout whose conversation a tab shows.
		 * @param tabSessionId The tab.
		 * @returns It, or null before anything read it.
		 */
		current: (tabSessionId) => shownByTab.get(tabSessionId) ?? null,
		/**
		 * Show a checkout's conversation in a tab, telling every listener when that changed it.
		 * @param tabSessionId The tab.
		 * @param checkout The checkout.
		 * @returns True when the tab showed another one before.
		 */
		show: (tabSessionId, checkout) => {
			if (shownByTab.get(tabSessionId) === checkout) {
				return false;
			}
			shownByTab.set(tabSessionId, checkout);
			for (const listener of shownListeners) listener(tabSessionId);
			return true;
		},
		/**
		 * Hear each tab whose shown conversation changed.
		 * @param listener Told the tab's id.
		 * @returns How to stop listening.
		 */
		onShownChange: (listener) => subscribe(shownListeners, listener),
	} satisfies TabSessions);
}

export { createTabSessions };
export type { TabSessions };
