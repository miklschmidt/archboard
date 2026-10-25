// The panes a tab session's Codex context is read through, and the owners it is read from
// (ADR 0050). A tab session presents through one of its open panes, hears the boards of the vaults
// its panes are in, and tells each workhorse the changes of its own checkout.

import { panesInOrder } from "@archboard/server-lifecycle/panes";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import type { CodexWorkbenchDomainScope as CodexWorkbenchComponents } from "@archboard/codex-realtime-voice/server";
import type { CodexWorkbenchTabSession } from "@archboard/codex-realtime-voice/server";
import type { CodexWorkbenchWorkhorse } from "@archboard/codex-realtime-voice/server";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import { presentingPane } from "#server/rules/pane/presenting-pane.ts";
import type {
	ContextPane,
	SemanticInputOwners,
} from "#server/projections/semantic-context/semantic-input.ts";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { panes, paneVaults } from "#server/services/panes/registry.ts";
import { tabSessionOf } from "#server/services/panes/tab-sessions.ts";

const presentingBySession = new WeakMap<
	CodexWorkbenchTabSession,
	{ readonly paneId: string; readonly vault: string }
>();

/**
 * The checkout of the vault a pane is in now: the directory that holds the vault.
 * @param clientId The pane's client id.
 * @returns The checkout.
 * @throws {Error} When the pane is in no vault.
 */
function paneCheckoutOf(clientId: string): string {
	const vault = paneVaults.get(clientId) ?? panes.get(clientId)?.vault;
	if (vault === undefined) {
		throw new Error(`The browser pane ${clientId} is in no vault.`);
	}
	return checkoutOfVault(vault);
}

/**
 * The checkout a tab that shows no conversation yet is pinned to (ADR 0050): that of its focused
 * pane, where the person was last, else the asking pane's own. Every pane of a tab reads the
 * conversation as the page loads, in no fixed order, so the first reader alone would leave the
 * choice to timing.
 * @param clientId The asking pane's client id.
 * @returns The checkout.
 * @throws {Error} When the pane is in no vault.
 */
function pinnedCheckoutOf(clientId: string): string {
	const tabSessionId = tabSessionOf(clientId);
	const focused =
		tabSessionId === null
			? undefined
			: panesOfTabSession(tabSessionId).find((pane) => pane.focused);
	return paneCheckoutOf(focused?.clientId ?? clientId);
}

/**
 * The panes of one browser tab on screen, in reading order.
 * @param tabSessionId The tab's session.
 * @returns The panes.
 */
function panesOfTabSession(tabSessionId: TabSessionId): PaneRegistration[] {
	return panesInOrder(Array.from(panes.values()))
		.map(({ pane }) => pane)
		.filter((pane) => tabSessionOf(pane.clientId) === tabSessionId);
}

/**
 * The pane of a tab session that work nobody's command started presents through: the one it
 * presented through last while that is open, else the focused one, else the first. The session
 * remembers it and its vault, so its context is still filed under that pane, and it still hears
 * that vault's changes, while none of its panes is open.
 * @param session The tab session.
 * @param open The session's open panes.
 * @returns The pane, or null while none of the session's panes is open.
 */
function presentingPaneOf(
	session: CodexWorkbenchTabSession,
	open: readonly PaneRegistration[] = panesOfTabSession(session.id),
): PaneRegistration | null {
	if (open.length === 0) {
		return null;
	}
	const pane = presentingPane(presentingBySession.get(session)?.paneId ?? null, open);
	presentingBySession.set(session, { paneId: pane.paneId, vault: pane.vault });
	return pane;
}

/**
 * Whether a tab session hears a settled change to a board of a vault: one its panes are in, or,
 * while none of them is open, the vault of the pane it presented through last. A reload closes
 * every pane of a tab for a moment, and what another agent wrote meanwhile is still its news.
 * @param session The tab session.
 * @param vault The vault of the changed board.
 * @returns True when the change is the session's news.
 */
function hearsVault(session: CodexWorkbenchTabSession, vault: string): boolean {
	const open = panesOfTabSession(session.id);
	if (open.length === 0) {
		return presentingBySession.get(session)?.vault === vault;
	}
	// Remember the presenting pane's vault now, for while none of the panes is open.
	presentingPaneOf(session, open);
	return open.some((pane) => pane.vault === vault);
}

/**
 * The open pane a tab session's fresh read presents through.
 * @param session The tab session.
 * @returns The pane.
 * @throws {Error} When none of the session's panes is open.
 */
function openPaneOf(session: CodexWorkbenchTabSession): PaneRegistration {
	const pane = presentingPaneOf(session);
	if (pane === null) {
		throw new Error("No canvas pane of this browser tab is open to present its conversation.");
	}
	return pane;
}

/**
 * The pane an operation's context is read through. A browser command names the exact pane that
 * sent it, by client id, which must still be on screen: a pane id repeats in every browser tab.
 * Work nobody's command started names none, and presents through an open pane of its session.
 * @param session The tab session the operation belongs to.
 * @param clientId The exact pane that sent it, or null.
 * @returns The pane.
 */
function operationPane(
	session: CodexWorkbenchTabSession,
	clientId: string | null,
): PaneRegistration {
	if (clientId === null) {
		return openPaneOf(session);
	}
	const pane = panes.get(clientId);
	if (pane === undefined) {
		throw new Error(`The Codex context pane is not open: ${clientId}.`);
	}
	return pane;
}

/**
 * Whether a workhorse has board-change delivery bound to a thread of its own.
 * @param workhorse The workhorse.
 * @returns True once its delivery is bound.
 */
function deliveryBound(workhorse: CodexWorkbenchWorkhorse): boolean {
	return workhorse.components.semanticDelivery.snapshot().binding !== null;
}

/**
 * The conversation a pane's news is for: its own tab's, once a workhorse of it has board-change
 * delivery bound.
 * @param components The generation.
 * @param clientId The pane's client id.
 * @returns The tab session, or null while the pane's tab has no bound conversation.
 */
function boundSessionOf(
	components: CodexWorkbenchComponents,
	clientId: string,
): CodexWorkbenchTabSession | null {
	const tabSessionId = tabSessionOf(clientId);
	const session = components.sessions.list().find(({ id }) => id === tabSessionId);
	return session !== undefined && [...session.workhorses.values()].some(deliveryBound)
		? session
		: null;
}

/**
 * What a context's identities are read from: the tab session's coordinator and voice, and the
 * workhorse the context is told to, with its link.
 * @param components The generation.
 * @param session The tab session.
 * @param workhorse The workhorse, or null when the context is told to none.
 * @returns The owners.
 */
function semanticOwners(
	components: CodexWorkbenchComponents,
	session: CodexWorkbenchTabSession,
	workhorse: CodexWorkbenchWorkhorse | null,
): SemanticInputOwners {
	const { coordinator, realtime } = session.components;
	return {
		threadLink: components.threadLink,
		workhorse:
			workhorse === null ? null : { start: workhorse.components.workhorse, key: workhorse.key },
		coordinator,
		realtime,
	};
}

/**
 * The workhorse of one checkout of a session, refused when the session has none there.
 * @param session The tab session.
 * @param checkout The checkout.
 * @returns The workhorse.
 * @throws {Error} When the session has no workhorse in that checkout.
 */
function requireWorkhorse(
	session: CodexWorkbenchTabSession,
	checkout: string,
): CodexWorkbenchWorkhorse {
	const workhorse = session.workhorses.get(checkout);
	if (workhorse === undefined) {
		throw new Error(`This browser tab has no workhorse in ${checkout}.`);
	}
	return workhorse;
}

/**
 * The pane a settled change is filed under for one session: its presenting pane while one is
 * open, else the pane it presented through last, which has no presentation to report. A session
 * hears every board update except its own writes, so a closed pane or a pane looking at another
 * board cannot be the thing that stops the news.
 * @param session The tab session.
 * @returns The pane.
 * @throws {Error} When the session never had a pane on screen.
 */
function changePane(session: CodexWorkbenchTabSession): ContextPane {
	const open = presentingPaneOf(session);
	if (open !== null) {
		return { paneId: open.paneId, clientId: open.clientId };
	}
	const remembered = presentingBySession.get(session);
	if (remembered === undefined) {
		throw new Error("No pane of this browser tab was ever open to file its context under.");
	}
	return { paneId: remembered.paneId, clientId: null };
}

export {
	boundSessionOf,
	changePane,
	deliveryBound,
	hearsVault,
	openPaneOf,
	operationPane,
	paneCheckoutOf,
	panesOfTabSession,
	pinnedCheckoutOf,
	presentingPaneOf,
	requireWorkhorse,
	semanticOwners,
};
