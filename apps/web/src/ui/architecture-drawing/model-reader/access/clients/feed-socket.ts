import type { QueryClient } from "@tanstack/react-query";
import {
	architectureFeedFrameSchema,
	type architectureFeedRequestSchema,
	type ArchitectureEvent,
	type ArchitectureFeedFrame,
} from "@archboard/model/contract";
import { after } from "@archboard/timing";
import type { z } from "zod";

/** The listing of the repositories of this machine, as one frame carries it. */
type RepositoriesFrame = Extract<ArchitectureFeedFrame, { type: "repositories" }>;

/** What hears one topic of the socket: a vault's events, or the repositories of the machine. */
interface FeedFollower<Heard> {
	readonly event: (heard: Heard) => void;
	readonly lost: (disconnected: boolean) => void;
}

/** What the socket asks the server to send it. */
type FeedRequest = z.infer<ReturnType<typeof architectureFeedRequestSchema>>;

/**
 * Decode one frame at the network boundary.
 * @param data The frame's data.
 * @returns The frame, or null when it is not one.
 */
function decodedFrame(data: unknown): ArchitectureFeedFrame | null {
	try {
		const frame = architectureFeedFrameSchema().safeParse(JSON.parse(String(data)));
		return frame.success ? frame.data : null;
	} catch {
		return null;
	}
}

/**
 * The one socket of a tab that carries architecture events for every vault it
 * reads, and the repositories of the machine. A browser allows a server six
 * HTTP/1.1 connections, so a stream for each repository in the navigator would
 * leave no request able to start.
 * @returns How a vault's feed and the repositories follow and stop following.
 */
function createFeedSocket() {
	const followers = new Map<string, FeedFollower<ArchitectureEvent>>();
	let machine: FeedFollower<RepositoriesFrame> | null = null;
	let socket: WebSocket | null = null;
	let retry: (() => void) | null = null;
	/**
	 * Every follower, of a vault or of the machine.
	 * @returns Them.
	 */
	function everyone(): Pick<FeedFollower<unknown>, "lost">[] {
		return machine === null ? [...followers.values()] : [...followers.values(), machine];
	}
	/**
	 * Ask the server for one change, when the socket can carry it. A socket that
	 * is still opening subscribes every follower when it opens.
	 * @param request The subscription change.
	 */
	function tell(request: FeedRequest): void {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(request));
	}
	/**
	 * Route one frame to its follower. A frame that makes no sense says nothing
	 * about what it is for, so every follower stops trusting what it holds.
	 * @param message The socket message.
	 */
	function receive(message: MessageEvent<unknown>): void {
		const frame = decodedFrame(message.data);
		if (frame === null) for (const follower of everyone()) follower.lost(false);
		else if (frame.type === "repositories") machine?.event(frame);
		else toVault(frame);
	}
	/**
	 * Route a frame of one vault to the feed of that vault.
	 * @param frame The frame.
	 */
	function toVault(frame: Exclude<ArchitectureFeedFrame, RepositoriesFrame>): void {
		const follower = followers.get(frame.vault);
		if (frame.type === "architecture_unavailable") follower?.lost(false);
		else follower?.event(frame);
	}
	/** Open the socket while anything follows, and open it again after it drops. */
	function connect(): void {
		if (socket !== null || everyone().length === 0) return;
		retry?.();
		retry = null;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const opening = new WebSocket(`${protocol}//${window.location.host}/api/architecture/events`);
		socket = opening;
		opening.addEventListener("open", () => {
			if (socket !== opening) return;
			for (const vault of followers.keys()) tell({ type: "subscribe", vault });
			if (machine !== null) tell({ type: "subscribe", topic: "repositories" });
		});
		opening.addEventListener("message", (message) => {
			if (socket === opening) receive(message);
		});
		opening.addEventListener("close", () => {
			if (socket !== opening) return;
			socket = null;
			retry = after("pane.socketReconnect", connect);
			for (const follower of everyone()) follower.lost(true);
		});
	}
	/** Close the socket once nothing follows. */
	function release(): void {
		if (everyone().length > 0) return;
		retry?.();
		retry = null;
		const closing = socket;
		socket = null;
		closing?.close(1000);
	}
	return {
		/**
		 * Follow one vault.
		 * @param vault The vault.
		 * @param follower What hears its events.
		 * @returns The function that stops following it.
		 */
		follow(vault: string, follower: FeedFollower<ArchitectureEvent>): () => void {
			followers.set(vault, follower);
			connect();
			tell({ type: "subscribe", vault });
			return () => {
				followers.delete(vault);
				tell({ type: "unsubscribe", vault });
				release();
			};
		},
		/**
		 * Follow the repositories of the machine. The server sends the listing when the socket
		 * subscribes, again after every reconnect, and whenever it changes.
		 * @param follower What hears each listing.
		 * @returns The function that stops following them.
		 */
		followRepositories(follower: FeedFollower<RepositoriesFrame>): () => void {
			machine = follower;
			connect();
			tell({ type: "subscribe", topic: "repositories" });
			return () => {
				machine = null;
				tell({ type: "unsubscribe", topic: "repositories" });
				release();
			};
		},
	};
}

/** One socket per query cache, shared by every vault it reads and by its repositories. */
const sockets = new WeakMap<QueryClient, ReturnType<typeof createFeedSocket>>();

/**
 * The feed socket of a tab, made when something first follows through it.
 * @param client The tab's query cache.
 * @returns Its socket.
 */
function feedSocket(client: QueryClient): ReturnType<typeof createFeedSocket> {
	let socket = sockets.get(client);
	if (socket === undefined) {
		socket = createFeedSocket();
		sockets.set(client, socket);
	}
	return socket;
}

export { feedSocket };
