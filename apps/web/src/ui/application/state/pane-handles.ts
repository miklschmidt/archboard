// The imperative handles the application keeps outside React state: each
// pane's session, reported by its `ApplicationPane`, and the socket
// conversation that pane's session attaches to each of its sockets. Nothing
// renders from these; actions read them when a person acts.

import {
	createSocketConversation,
	type SocketConversation,
	type SocketConversationOptions,
} from "@archboard/codex-realtime-voice/browser";
import type { PaneSession } from "#ui/panes/pane-session/rules/session-contracts.ts";

/** Where every pane's voice is played and heard. */
type BrowserWorkbenchMediaOwnerOptions = NonNullable<SocketConversationOptions["media"]>;

/** The handles by pane id. */
class PaneHandles {
	readonly #sessions = new Map<string, PaneSession>();
	readonly #conversations = new Map<string, SocketConversation>();
	readonly #media: BrowserWorkbenchMediaOwnerOptions;

	/**
	 * The handles, with where each pane's voice is played and heard.
	 * @param media Where a recording page (TASK-304) hears the voice, and nothing otherwise.
	 */
	constructor(media: BrowserWorkbenchMediaOwnerOptions = {}) {
		this.#media = media;
	}

	/**
	 * The session a pane reported, or null before it did.
	 * @param paneId The pane.
	 * @returns The session, or null.
	 */
	session(paneId: string): PaneSession | null {
		return this.#sessions.get(paneId) ?? null;
	}

	/**
	 * Every session, in no particular order.
	 * @returns The sessions.
	 */
	sessions(): readonly PaneSession[] {
		return [...this.#sessions.values()];
	}

	/**
	 * A pane reported its session, or went.
	 * @param paneId The pane.
	 * @param session The session, or null once the pane unmounted.
	 */
	setSession(paneId: string, session: PaneSession | null): void {
		if (session === null) {
			this.#sessions.delete(paneId);
			// The session disposed the pane's conversation.
			this.#conversations.delete(paneId);
			return;
		}
		this.#sessions.set(paneId, session);
	}

	/**
	 * The socket conversation of a pane, created on first use. The pane's session disposes it
	 * when the pane closes.
	 * @param paneId The pane.
	 * @returns The conversation.
	 */
	conversation(paneId: string): SocketConversation {
		const existing = this.#conversations.get(paneId);
		if (existing !== undefined) {
			return existing;
		}
		const created = createSocketConversation({ chatId: paneId, media: this.#media });
		this.#conversations.set(paneId, created);
		return created;
	}
}

export { PaneHandles, type BrowserWorkbenchMediaOwnerOptions, type PaneSession };
