// The person activating a checkout (ADR 0050). The agent dock shows the
// conversation of the checkout the person last activated: by focusing a pane,
// by opening a board in one, or by picking a workhorse from the dock's list.
// What an agent does to a pane never activates anything, so only the places
// where the person acts call this, and the server keeps the one answer.

import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import { showConversation } from "@/ui/pane-session";

/** What the person activated in one pane: its own checkout, unless they picked one. */
interface Activated {
	/** The vault the pane is in now, when the page has not heard it yet: a board just opened moved it. */
	readonly vault?: string;
	/** A checkout picked from the dock's list. */
	readonly checkout?: string;
}

/** Say which checkout the person activated, injectable for checks. */
type ConversationActivation = (paneId: string, activated?: Activated) => Promise<boolean>;

/**
 * The pane the person acted in, as the server knows it, or null before it knows the pane.
 * @param records The panes.
 * @param paneId The pane.
 * @param activated What the person activated in it.
 * @returns Its identity to the server and the vault it is in.
 */
function paneOf(
	records: PaneRecords,
	paneId: string,
	activated: Activated,
): { readonly clientId: string; readonly vault: string } | null {
	const { clientId, vault } = recordFor(records, paneId).status;
	const now = activated.vault ?? vault;
	return now === null || clientId === "" ? null : { clientId, vault: now };
}

/**
 * The activation over the server: the pane names its tab, and a pick names its checkout.
 * @param records Reads the panes as they are when the person acts.
 * @param send Says it to the server.
 * @returns The activation.
 */
function conversationActivation(
	records: () => PaneRecords,
	send: typeof showConversation = showConversation,
): ConversationActivation {
	return async (paneId, activated = {}) => {
		const pane = paneOf(records(), paneId, activated);
		if (pane === null) return false;
		const { checkout } = activated;
		try {
			await send(pane.vault, {
				clientId: pane.clientId,
				...(checkout === undefined ? {} : { checkout }),
			});
			return true;
		} catch {
			// The dock goes on showing what it showed, which the server still says.
			return false;
		}
	};
}

export { conversationActivation, type ConversationActivation };
