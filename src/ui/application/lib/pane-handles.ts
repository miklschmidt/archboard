// The imperative handles the application keeps outside React state: each
// pane's session, reported by its `CanvasPane`, and the browser media owner
// that follows the pane's workbench transport generations. Nothing renders
// from these; actions read them when a person acts.

import { createBrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import type { BrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import type { CanvasSession } from "@/ui/canvas/use-canvas-session";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The session of one pane, over the production transport. */
type PaneSession = CanvasSession<BrowserWorkbenchTransport>;

/** The handles by pane id. */
class PaneHandles {
	readonly #sessions = new Map<string, PaneSession>();
	readonly #media = new Map<string, BrowserWorkbenchMediaOwner>();

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
			// The session disposed the socket owner, which disposed the media.
			this.#media.delete(paneId);
			return;
		}
		this.#sessions.set(paneId, session);
	}

	/**
	 * The media owner that follows a pane's transport generations, created on
	 * first use. The pane's socket owner disposes it when the pane closes.
	 * @param paneId The pane.
	 * @returns The media owner.
	 */
	media(paneId: string): BrowserWorkbenchMediaOwner {
		const existing = this.#media.get(paneId);
		if (existing !== undefined) {
			return existing;
		}
		const created = createBrowserWorkbenchMediaOwner();
		this.#media.set(paneId, created);
		return created;
	}
}

export { PaneHandles, type PaneSession };
