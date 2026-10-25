import type { VoiceClient } from "@archboard/codex-realtime-voice/browser";

/** What the page needs of a client to follow the page lifecycle. */
type PageClient = Pick<VoiceClient, "connect" | "dispose">;

/**
 * Keep one connected voice client for the page view. The page disposes its client when it hides,
 * so a hidden page holds no socket and no microphone. A disposed client never connects again, so
 * when the browser restores the page from its back-forward cache the page makes and connects a
 * new client. The tab session id lives in `sessionStorage`, so the new client resumes the tab's
 * conversation while its tab session lasts.
 * @param create Makes a client.
 * @param show Draws the page over a client.
 * @param page The window whose lifecycle the client follows.
 */
function followPageLifecycle<Client extends PageClient>(
	create: () => Client,
	show: (client: Client) => void,
	page: Window = window,
): void {
	let client: Client;
	/** Make a client, draw the page over it and connect it. */
	const begin = () => {
		client = create();
		show(client);
		void client.connect();
	};
	begin();
	page.addEventListener("pagehide", () => void client.dispose());
	page.addEventListener("pageshow", (event) => {
		if (event.persisted) begin();
	});
}

export { followPageLifecycle };
