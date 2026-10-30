import {
	ArchitectureFeedFrameSchema,
	type ArchitectureEvent,
	type ArchitectureFeedFrame,
} from "@archboard/board/model";
import { PANE_MS } from "@archboard/timing";

/** What one vault's feed hears from the socket. */
interface FeedFollower {
	readonly event: (event: ArchitectureEvent) => void;
	readonly lost: () => void;
}

/**
 * Decode one frame at the network boundary.
 * @param data The frame's data.
 * @returns The frame, or null when it is not one.
 */
function decodedFrame(data: unknown): ArchitectureFeedFrame | null {
	try {
		const frame = ArchitectureFeedFrameSchema.safeParse(JSON.parse(String(data)));
		return frame.success ? frame.data : null;
	} catch {
		return null;
	}
}

/**
 * The one socket of a tab that carries architecture events for every vault it
 * reads. A browser allows a server six HTTP/1.1 connections, so a stream for
 * each repository in the navigator would leave no request able to start.
 * @returns How a vault's feed follows and stops following its vault.
 */
function createFeedSocket() {
	const followers = new Map<string, FeedFollower>();
	let socket: WebSocket | null = null;
	/**
	 * Ask the server for one change, when the socket can carry it. A socket that
	 * is still opening subscribes every follower when it opens.
	 * @param type What to change.
	 * @param vault The vault.
	 */
	function tell(type: "subscribe" | "unsubscribe", vault: string): void {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, vault }));
	}
	/**
	 * Route one frame to the feed of its vault. A frame that makes no sense says
	 * nothing about which vault it is for, so every feed stops trusting its reading.
	 * @param message The socket message.
	 */
	function receive(message: MessageEvent<unknown>): void {
		const frame = decodedFrame(message.data);
		if (frame === null) for (const follower of followers.values()) follower.lost();
		else if (frame.type === "architecture_unavailable") followers.get(frame.vault)?.lost();
		else followers.get(frame.vault)?.event(frame);
	}
	/** Open the socket while anything follows a vault, and open it again after it drops. */
	function connect(): void {
		if (socket !== null || followers.size === 0) return;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const opening = new WebSocket(`${protocol}//${window.location.host}/api/architecture/events`);
		socket = opening;
		opening.addEventListener("open", () => {
			for (const vault of followers.keys()) tell("subscribe", vault);
		});
		opening.addEventListener("message", receive);
		opening.addEventListener("close", () => {
			socket = null;
			for (const follower of followers.values()) follower.lost();
			setTimeout(connect, PANE_MS.socketReconnect);
		});
	}
	return {
		/**
		 * Follow one vault.
		 * @param vault The vault.
		 * @param follower What hears its events.
		 * @returns The function that stops following it.
		 */
		follow(vault: string, follower: FeedFollower): () => void {
			followers.set(vault, follower);
			connect();
			tell("subscribe", vault);
			return () => {
				followers.delete(vault);
				tell("unsubscribe", vault);
				if (followers.size === 0) socket?.close(1000);
			};
		},
	};
}

export { createFeedSocket };
