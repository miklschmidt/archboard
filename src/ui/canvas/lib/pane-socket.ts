// One pane's socket to the canvas server: opened with the pane's client id,
// reconnected after an abnormal close, and identified by generation so a
// listener on a superseded socket can tell it is stale.

import { SOCKET_RECONNECT_MS } from "@/shared/timing/timing";
import {
	createCanvasPaneRegistration,
	type CanvasPaneRegistration,
} from "@/ui/canvas/workbench-socket";
import type { WebSocketMessage } from "@/ui/types";

/** A socket generation: the socket and its registration latch. */
interface PaneSocketGeneration {
	readonly socket: WebSocket;
	readonly generation: number;
	readonly registration: CanvasPaneRegistration;
}

/** What the connector tells its pane. */
interface PaneSocketListener {
	readonly opened: (current: PaneSocketGeneration) => void;
	readonly message: (data: WebSocketMessage) => void;
	/** The current socket closed; a reconnection follows unless the close was clean. */
	readonly closed: (current: PaneSocketGeneration) => void;
	/** A socket closed, current or not; the workbench must release it either way. */
	readonly retired: (socket: WebSocket) => void;
	readonly errored: (current: PaneSocketGeneration) => void;
}

/** One pane's connection to the canvas server. */
interface PaneSocketConnector {
	/** Open a socket unless one is open or connecting. */
	readonly connect: () => void;
	/** The current generation, or null before the first connect or after close. */
	readonly current: () => PaneSocketGeneration | null;
	/** Whether the current generation is this one. */
	readonly isCurrent: (generation: PaneSocketGeneration) => boolean;
	/** The registration latch of the current socket, or null. */
	readonly registration: () => CanvasPaneRegistration | null;
	/** Forget the registration of the current socket; it is retired. */
	readonly dropRegistration: () => void;
	/** Close the current socket cleanly and refuse further connects. */
	readonly close: () => void;
}

/**
 * The socket URL for this pane.
 * @param clientId The pane's identity to the server.
 * @returns The URL.
 */
function socketUrl(clientId: string): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/?clientId=${encodeURIComponent(clientId)}`;
}

/**
 * Decode one socket frame.
 * @param raw The frame's data.
 * @returns The message, or null when the frame is not JSON.
 */
function parseMessage(raw: unknown): WebSocketMessage | null {
	if (typeof raw !== "string") {
		return null;
	}
	try {
		// The server sends its own message shapes; the browser trusts them.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion
		return JSON.parse(raw) as WebSocketMessage;
	} catch {
		return null;
	}
}

/**
 * Whether a socket is open or on its way.
 * @param socket The socket, if any.
 * @returns True while connecting or open.
 */
function isLive(socket: WebSocket | null): boolean {
	return (
		socket !== null &&
		(socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
	);
}

/**
 * Create the connector for one pane.
 * @param clientId The pane's identity to the server.
 * @param listener What the pane hears.
 * @returns The connector.
 */
function createPaneSocketConnector(
	clientId: string,
	listener: PaneSocketListener,
): PaneSocketConnector {
	let current: PaneSocketGeneration | null = null;
	let registration: CanvasPaneRegistration | null = null;
	let generationCounter = 0;
	let closed = false;

	/**
	 * Whether a generation is the current one.
	 * @param generation The generation.
	 * @returns True when nothing has superseded it.
	 */
	function isCurrent(generation: PaneSocketGeneration): boolean {
		return current === generation;
	}

	/**
	 * Wire one socket's events.
	 * @param generation The generation the socket belongs to.
	 */
	function listen(generation: PaneSocketGeneration): void {
		const { socket } = generation;
		socket.addEventListener("open", () => {
			if (!closed && isCurrent(generation)) {
				listener.opened(generation);
			}
		});
		socket.addEventListener("message", (event) => {
			const data = parseMessage(event.data);
			if (data !== null) {
				listener.message(data);
			}
		});
		socket.addEventListener("close", (event) => {
			const wasCurrent = isCurrent(generation);
			if (wasCurrent) {
				registration = null;
			}
			listener.retired(socket);
			if (!wasCurrent) {
				return;
			}
			listener.closed(generation);
			if (event.code !== 1000 && !closed) {
				setTimeout(connect, SOCKET_RECONNECT_MS);
			}
		});
		socket.addEventListener("error", () => {
			if (!closed && isCurrent(generation)) {
				listener.errored(generation);
			}
		});
	}

	/** Open a socket unless one is open or connecting. */
	function connect(): void {
		if (closed || isLive(current?.socket ?? null)) {
			return;
		}
		const socket = new WebSocket(socketUrl(clientId));
		const generation = ++generationCounter;
		const next: PaneSocketGeneration = {
			socket,
			generation,
			registration: createCanvasPaneRegistration(socket, generation),
		};
		current = next;
		registration = next.registration;
		listen(next);
	}

	/** Close the current socket cleanly and refuse further connects. */
	function close(): void {
		closed = true;
		registration = null;
		generationCounter += 1;
		current?.socket.close(1000);
		current = null;
	}

	/**
	 * The current generation.
	 * @returns The generation, or null.
	 */
	function currentGeneration(): PaneSocketGeneration | null {
		return current;
	}

	/**
	 * The registration latch of the current socket.
	 * @returns The registration, or null.
	 */
	function currentRegistration(): CanvasPaneRegistration | null {
		return registration;
	}

	/** Forget the registration of the current socket. */
	function dropRegistration(): void {
		registration = null;
	}

	return {
		connect,
		current: currentGeneration,
		isCurrent,
		registration: currentRegistration,
		dropRegistration,
		close,
	};
}

export {
	createPaneSocketConnector,
	type PaneSocketConnector,
	type PaneSocketGeneration,
	type PaneSocketListener,
};
