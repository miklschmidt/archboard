// The tab each pane belongs to and the conversation each tab shows, as the voice agent keeps them
// from the panes' own socket connections.

import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import { voiceTabs } from "#server/panes/services/voice-agent.ts";

/**
 * The agent's tabs.
 * @returns Them.
 * @throws {Error} While no agent runs.
 */
function requireTabs(): NonNullable<ReturnType<typeof voiceTabs>> {
	const tabs = voiceTabs();
	if (tabs === null) throw new Error("The workbench tab sessions are not installed.");
	return tabs;
}

/**
 * The tab a pane belongs to.
 * @param clientId The pane's client id.
 * @returns Its tab session, or null while its socket named none.
 */
function tabSessionOf(clientId: string): TabSessionId | null {
	return voiceTabs()?.of(clientId) ?? null;
}

/**
 * The checkout whose conversation a pane's tab shows. A pane whose socket named no tab
 * shows its own checkout's.
 * @param clientId The pane's client id.
 * @param own The checkout of the pane's own vault, which pins a tab that shows none yet.
 * @returns The shown checkout.
 */
function shownCheckoutOf(clientId: string, own: () => string): string {
	const tabSessionId = tabSessionOf(clientId);
	return tabSessionId === null ? own() : requireTabs().shown(tabSessionId, own);
}

/**
 * The checkout whose conversation a tab shows.
 * @param tabSessionId The tab.
 * @returns It, or null before anything read it.
 */
function currentShownCheckout(tabSessionId: TabSessionId): string | null {
	return voiceTabs()?.current(tabSessionId) ?? null;
}

/**
 * Show a checkout's conversation in a tab, because the person activated it.
 * @param tabSessionId The tab.
 * @param checkout The checkout.
 * @returns True when the tab showed another checkout's before.
 */
function showConversation(tabSessionId: TabSessionId, checkout: string): boolean {
	return requireTabs().show(tabSessionId, checkout);
}

/**
 * Hear each tab whose shown conversation changed.
 * @param listener Told the tab's id.
 * @returns How to stop listening.
 */
function onShownChange(listener: (tabSessionId: TabSessionId) => void): () => void {
	return requireTabs().onShownChange(listener);
}

export { currentShownCheckout, onShownChange, showConversation, shownCheckoutOf, tabSessionOf };
