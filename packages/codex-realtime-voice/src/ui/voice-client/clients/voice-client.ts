// One page view's voice client through the real browser: the transport and media owner of the
// page, a WebSocket, the tab's session id kept in `sessionStorage`, and browser timers.

import { createBrowserWorkbenchMediaOwner } from "#ui/media/clients/media-owner.ts";
import { createBrowserWorkbenchTransport } from "#ui/transport/clients/transport.ts";
import { openVoiceClient } from "#ui/voice-client/clients/open-voice-client.ts";
import type { VoiceClient, VoiceClientOptions } from "#ui/voice-client/state/contract.ts";

const TAB_SESSION_KEY = "codex-realtime-voice:tab";

/**
 * Connect one page view to the voice server through the real browser.
 * @param options The socket path and the chat.
 * @returns The client. Call `connect()` to open the socket.
 */
function createVoiceClient(options: VoiceClientOptions): VoiceClient {
	return openVoiceClient(options, {
		transport: createBrowserWorkbenchTransport(),
		media: createBrowserWorkbenchMediaOwner(),
		/**
		 * A browser WebSocket.
		 * @param url Where it connects.
		 * @returns The socket.
		 */
		openSocket: (url) => new WebSocket(url),
		/**
		 * The id kept for this tab.
		 * @returns The id.
		 */
		tabSessionId: () => storedTabSessionId(TAB_SESSION_KEY),
		/**
		 * The page's own location.
		 * @returns The URL.
		 */
		pageUrl: () => location.href,
		/**
		 * A browser timer.
		 * @param delayMs How long to wait.
		 * @param run What runs then.
		 * @returns How to cancel it.
		 */
		after: (delayMs, run) => {
			const timer = setTimeout(run, delayMs);
			return () => clearTimeout(timer);
		},
	});
}

/** The id this page names while storage cannot hold one; a reload then starts another. */
let pageTabSessionId: string | null = null;

/**
 * The tab's session id, minted once and kept in `sessionStorage`. Storage that
 * refuses, as a privacy setting can make it, leaves one id for this page.
 * @param key The storage key.
 * @returns The id.
 */
function storedTabSessionId(key: string): string {
	try {
		const id = sessionStorage.getItem(key) ?? crypto.randomUUID();
		sessionStorage.setItem(key, id);
		return id;
	} catch {
		pageTabSessionId ??= crypto.randomUUID();
		return pageTabSessionId;
	}
}

export { createVoiceClient };
