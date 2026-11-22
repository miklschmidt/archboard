// The server's end of a tab's architecture feed, for a test that runs the tab's own code: the
// sockets the tab opens, what each one follows, and the frames the test sends down it.

import {
	architectureFeedRequestSchema,
	type ArchitectureFeedFrame,
} from "@archboard/model/contract";

/** One socket of the tab, as the server sees it. */
interface FeedSocket {
	readonly readyState: number;
	/** What the socket follows: vaults, and `repositories` while it follows the machine. */
	readonly topics: ReadonlySet<string>;
	/** Close as the server does when it stops. */
	close(): void;
	/**
	 * Send the tab one frame.
	 * @param frame The frame.
	 */
	receive(frame: ArchitectureFeedFrame): void;
}

/**
 * Put the server's end of the feed in place of the page's WebSocket. Install it after the page
 * exists, because a socket is an event target of the page.
 * @returns The sockets, the refusal switch, and the way back to the page's WebSocket.
 */
function installFeedServer() {
	const sockets: FeedSocket[] = [];
	let refusing = false;
	/** One socket of the tab, as the page's WebSocket. */
	class PageSocket extends EventTarget implements FeedSocket {
		static readonly CONNECTING = 0;
		static readonly OPEN = 1;
		static readonly CLOSED = 3;
		readyState: number = PageSocket.CONNECTING;
		readonly topics = new Set<string>();

		/** Open at once, as a local server does, or close when the server does not answer. */
		constructor() {
			super();
			sockets.push(this);
			queueMicrotask(() => {
				if (refusing) {
					this.close();
					return;
				}
				this.readyState = PageSocket.OPEN;
				this.dispatchEvent(new Event("open"));
			});
		}

		/**
		 * Keep what the tab asks the server to follow.
		 * @param text One request.
		 */
		send(text: string): void {
			const request = architectureFeedRequestSchema().parse(JSON.parse(text));
			const topic = "vault" in request ? request.vault : request.topic;
			if (request.type === "subscribe") this.topics.add(topic);
			else this.topics.delete(topic);
		}

		/** Close as the browser does, once. */
		close(): void {
			if (this.readyState === PageSocket.CLOSED) return;
			this.readyState = PageSocket.CLOSED;
			this.dispatchEvent(new Event("close"));
		}

		/**
		 * Send the tab one frame.
		 * @param frame The frame.
		 */
		receive(frame: ArchitectureFeedFrame): void {
			this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
		}
	}
	const page = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
	Object.defineProperty(globalThis, "WebSocket", { value: PageSocket, configurable: true });
	return {
		sockets: sockets as readonly FeedSocket[],
		/**
		 * The socket the tab opened last.
		 * @returns It, once the tab opened one.
		 */
		latest: (): FeedSocket | undefined => sockets.at(-1),
		/**
		 * Refuse the sockets the tab opens from now on, or stop refusing them.
		 * @param refuse Whether to refuse.
		 */
		refuse: (refuse: boolean): void => {
			refusing = refuse;
		},
		/** Forget the sockets of the last test. */
		reset: (): void => {
			sockets.length = 0;
			refusing = false;
		},
		/** Give the page its WebSocket back. */
		uninstall: (): void => {
			if (page) Object.defineProperty(globalThis, "WebSocket", page);
			else Reflect.deleteProperty(globalThis, "WebSocket");
		},
	};
}

export { installFeedServer, type FeedSocket };
