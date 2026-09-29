// Which browser tab each pane on screen belongs to, and when a tab has gone for good (TASK-373).
//
// A pane's socket names its tab's session (`?tabSession=`), which both panes of one tab share and
// every other tab mints for itself. Keyed by client id, and held while the pane's socket is: the
// pane's authoritative socket records it, and the same socket's close forgets it.
//
// A tab session is present while any pane of it is. When its last pane goes, it has a grace to
// come back in, because a reload closes every socket of the tab and opens them again; a pane of it
// that returns within the grace keeps the conversation. Once the grace passes with no pane back,
// the session has ended, and whoever listens is told once. This outlives every Codex child: a tab
// that was present before a restart is still present after it.

import { logger } from "@/runtime/engine/logger";
import { TAB_SESSION_GRACE_MS } from "@/shared/timing/timing";
import type { CodexWorkbenchComponents } from "@/server/archboard/codex-workbench-generation";
import type { TabSessionId } from "@/server/codex-workbench";

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
		},
		/**
		 * Hear each tab session that ended.
		 * @param listener Told the session's id.
		 * @returns How to stop listening.
		 */
		onEnded: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	} satisfies TabSessions);
}

const tabSessions = createTabSessions();

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

/** Forget every pane's tab, because the server is stopping and there is no screen any more. */
function forgetTabSessions(): void {
	tabSessions.forgetAll();
}

/**
 * End each of one Codex generation's tab sessions once its tab has gone for good: no pane of it
 * came back within the grace. Its lease goes first, since no socket of it is left to hold one,
 * then everything the session ran.
 * @param components The generation's gateway and tab sessions.
 * @returns How to stop, when the generation is no longer the active one.
 */
function endTabSessionsOnceGone(
	components: Pick<CodexWorkbenchComponents, "gateway" | "sessions">,
): () => void {
	return tabSessions.onEnded((tabSessionId) => {
		components.gateway.endSession(tabSessionId);
		void components.sessions
			.end(tabSessionId)
			.catch((error: unknown) => logger.error("Ending a browser tab's session failed:", error));
	});
}

export {
	createTabSessions,
	endTabSessionsOnceGone,
	forgetTabSession,
	forgetTabSessions,
	noteTabSession,
	tabSessionOf,
};
export type { TabSessions };
