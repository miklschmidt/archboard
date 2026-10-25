// The call that changes which checkout's conversation a tab's agent dock shows (ADR 0050).
//
// The person's own acts in the browser activate a checkout: focusing a pane, opening a board,
// drilling down, or picking a workhorse from the dock's list. The browser
// names the pane the act happened in, and the server reads the checkout from the vault that pane
// is in. A pick from the list names the checkout itself, and is taken only for a checkout the tab
// already works in: that of a live workhorse of the tab, or of one of its panes. A workhorse starts
// in the checkout it is shown for, so any other directory is refused rather than shown.
//
// Only the browser's own page reaches this call. Nothing an agent does goes through it, so what an
// agent does to a pane never changes the conversation somebody is typing in.

import type { Request, Response } from "express";

import {
	ShownConversationRequestSchema,
	type ShownConversationRefusal,
	type ShownConversationReply,
} from "@archboard/workbench/browser-contract";
import { logger } from "@archboard/diagnostics/logger";
import { type TabSessionId } from "@archboard/codex-realtime-voice/server";
import {
	codexWiring,
	paneCheckoutOf,
	panesOfTabSession,
	currentShownCheckout,
	showConversation,
	tabSessionOf,
} from "@archboard/workbench/server";
import { panes, paneVaults } from "@archboard/workbench/panes";
import { bodyOf, vaultOfRequest } from "@archboard/workbench/host";

/** The pane an activation happened in, and the tab it belongs to. */
interface ActivatedPane {
	readonly clientId: string;
	readonly tabSessionId: TabSessionId;
}

/**
 * Refuse a call with one of the reasons the contract names.
 * @param res The response.
 * @param status The HTTP status.
 * @param code The reason.
 * @param error What happened, and what the caller can do next.
 */
function refuse(
	res: Response,
	status: number,
	code: ShownConversationRefusal | "BAD_REQUEST",
	error: string,
): void {
	res.status(status).json({ success: false, code, error });
}

/**
 * The checkouts a tab may be shown: those of its live workhorses, of its panes, and the one it
 * shows now.
 * @param tabSessionId The tab.
 * @returns The checkouts.
 */
function showableCheckouts(tabSessionId: TabSessionId): ReadonlySet<string> {
	const live = codexWiring.codex.liveWorkhorseCheckouts?.(tabSessionId) ?? [];
	const shown = currentShownCheckout(tabSessionId);
	return new Set([
		...live,
		...panesOfTabSession(tabSessionId).map((pane) => paneCheckoutOf(pane.clientId)),
		...(shown === null ? [] : [shown]),
	]);
}

/**
 * The registered pane an activation names, refusing one the server does not know in a tab, or one
 * in another vault than the call names.
 * @param res The response.
 * @param clientId The pane's client id.
 * @param vault The vault the call names.
 * @returns The pane and its tab, or null once refused.
 */
function activatedPane(res: Response, clientId: string, vault: string): ActivatedPane | null {
	const pane = panes.get(clientId);
	const tabSessionId = tabSessionOf(clientId);
	if (pane === undefined || tabSessionId === null) {
		refuse(
			res,
			404,
			"PANE_UNKNOWN",
			`No pane ${clientId} is on screen in a browser tab. Reload the page, then try again.`,
		);
		return null;
	}
	if ((paneVaults.get(clientId) ?? pane.vault) !== vault) {
		refuse(
			res,
			409,
			"VAULT_MISMATCH",
			`Pane ${clientId} is not in the vault "${vault}". Name the vault the pane is in.`,
		);
		return null;
	}
	return { clientId, tabSessionId };
}

/**
 * The checkout an activation shows: the one picked from the list, or that of the pane's own vault.
 * A pick is refused unless the tab works in that checkout.
 * @param res The response.
 * @param pane The pane the activation happened in.
 * @param picked The checkout picked from the list, if one was.
 * @returns The checkout, or null once refused.
 */
function shownFor(res: Response, pane: ActivatedPane, picked: string | undefined): string | null {
	if (picked === undefined) {
		return paneCheckoutOf(pane.clientId);
	}
	if (showableCheckouts(pane.tabSessionId).has(picked)) {
		return picked;
	}
	refuse(
		res,
		409,
		"CHECKOUT_NOT_SHOWABLE",
		`This tab has no workhorse and no pane in ${picked}. Pick a checkout from the list, or open one of its boards.`,
	);
	return null;
}

/**
 * Show the conversation of the checkout the person activated, in every pane of the pane's tab.
 * @param req The request: `{ clientId, checkout? }`, in the vault of that pane.
 * @param res Its response: the shown checkout, and whether the call changed it.
 */
function shownConversationRoute(req: Request, res: Response): void {
	const vault = vaultOfRequest(req);
	const { vault: _named, ...body } = bodyOf(req);
	const parsed = ShownConversationRequestSchema.safeParse(body);
	if (!parsed.success) {
		refuse(
			res,
			400,
			"BAD_REQUEST",
			"Send `{ clientId, checkout? }`: the pane, and a picked checkout.",
		);
		return;
	}
	const pane = activatedPane(res, parsed.data.clientId, vault);
	if (pane === null) {
		return;
	}
	const shown = shownFor(res, pane, parsed.data.checkout);
	if (shown === null) {
		return;
	}
	const changed = showConversation(pane.tabSessionId, shown);
	if (changed) {
		logger.info(`Tab ${pane.tabSessionId} shows the conversation of ${shown}`);
	}
	res.json({ success: true, shown, changed } satisfies ShownConversationReply);
}

export { shownConversationRoute };
