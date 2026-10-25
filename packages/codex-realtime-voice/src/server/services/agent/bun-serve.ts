import {
	admitUpgrade,
	assertSocketOrigin,
	assertSocketPath,
	openBrowserSocket,
	type AdmittedConnection,
	type BrowserPort,
	type BrowserSocketSession,
	type SocketSurface,
	type UpgradeRequest,
} from "#server/services/agent/admission.ts";
import type { VoiceAgentAttachOptions } from "#server/services/agent/attach.ts";

/**
 * The `data` of a socket this adapter upgraded. The shared `websocket` handlers serve a socket
 * whose `data` is one of these and give every other socket to the host's own handlers.
 */
class VoiceSocket {
	/**
	 * Keep the admitted surface for the socket's `open`.
	 * @param surface The socket's pane, tab session and browser id.
	 */
	constructor(readonly surface: SocketSurface) {}
}

type Fetched = Response | undefined | Promise<Response | undefined>;

/**
 * Where the agent's browser sockets connect on a `Bun.serve` server, and the host's own handlers
 * of everything else on it.
 */
export interface VoiceAgentBunOptions<HostData> extends Omit<VoiceAgentAttachOptions, "origin"> {
	/**
	 * The server's own HTTP origin exactly, such as `http://127.0.0.1:4100`. Default: the origin of
	 * the receiving server's `url`, so a server on port 0 needs none. Name it when the browser
	 * reaches the server under another name than the one it listens on.
	 */
	readonly origin?: string;
	/**
	 * The host's handler of every request that is not a socket upgrade on `path`. It may upgrade
	 * sockets of its own with any other `data`. Default: answer 404.
	 */
	readonly fetch?: (request: Request, server: Bun.Server<HostData | VoiceSocket>) => Fetched;
	/**
	 * The host's handlers of its own sockets. Their options, such as `maxPayloadLength`, apply to
	 * every socket of the server, because Bun has one handler set per server.
	 */
	readonly websocket?: Bun.WebSocketHandler<HostData>;
}

/** The `fetch` and `websocket` of `Bun.serve` options, with the agent's sockets in them. */
export interface VoiceAgentBunHandlers<HostData> {
	readonly fetch: (request: Request, server: Bun.Server<HostData | VoiceSocket>) => Fetched;
	readonly websocket: Bun.WebSocketHandler<HostData | VoiceSocket>;
}

type HostSocket<HostData> = Bun.ServerWebSocket<HostData>;
type AnySocket<HostData> = Bun.ServerWebSocket<HostData | VoiceSocket>;

/**
 * Whether a socket of the server is one this adapter upgraded.
 * @param ws The socket.
 * @returns True for the agent's socket.
 */
function isVoice<HostData>(ws: AnySocket<HostData>): ws is Bun.ServerWebSocket<VoiceSocket> {
	return ws.data instanceof VoiceSocket;
}

/**
 * Whether a socket of the server is one the host upgraded itself.
 * @param ws The socket.
 * @returns True for the host's socket.
 */
function isHost<HostData>(ws: AnySocket<HostData>): ws is HostSocket<HostData> {
	return !(ws.data instanceof VoiceSocket);
}

/**
 * Route one socket event to the agent's handler or to the host's, by the socket's `data`.
 * @param voice The agent's handler.
 * @param host The host's handler, when it has one.
 * @returns The server's handler of the event.
 */
function route<HostData, Rest extends unknown[]>(
	voice: (ws: Bun.ServerWebSocket<VoiceSocket>, ...rest: Rest) => void,
	host: ((ws: HostSocket<HostData>, ...rest: Rest) => void | Promise<void>) | undefined,
) {
	return (ws: AnySocket<HostData>, ...rest: Rest): void | Promise<void> => {
		if (isVoice(ws)) voice(ws, ...rest);
		else if (isHost(ws)) return host?.(ws, ...rest);
	};
}

/** An event that the agent's sockets need no handler of: drain, ping and pong. */
function ignore(): void {}

/**
 * The host's ping and pong handlers, routed so that they see only the host's sockets. A handler
 * the host leaves out stays out, so that Bun answers pings itself.
 * @param host The host's handlers.
 * @returns The routed handlers the host has.
 */
function hostPings<HostData>(host: Bun.WebSocketHandler<HostData> | undefined) {
	return {
		...(host?.ping === undefined
			? {}
			: { ping: route<HostData, [Buffer]>(ignore, (ws, data) => host.ping?.(ws, data)) }),
		...(host?.pong === undefined
			? {}
			: { pong: route<HostData, [Buffer]>(ignore, (ws, data) => host.pong?.(ws, data)) }),
	};
}

/**
 * Read what admission needs from a request, when it asks for a WebSocket.
 * @param request The request.
 * @returns The upgrade's URL and headers, or null for a request that upgrades nothing.
 */
function upgradeOf(request: Request): UpgradeRequest | null {
	if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return null;
	return {
		url: request.url,
		host: request.headers.get("host") ?? undefined,
		origin: request.headers.get("origin") ?? undefined,
	};
}

/**
 * Adapt Bun's socket to what the browser port sends with. `ws.send` answers the bytes it sent,
 * -1 when it queued the frame under backpressure, which Bun still sends in order, and 0 when it
 * dropped the frame over the server's `backpressureLimit`. Bun keeps the socket open after a drop,
 * so the adapter ends it: the browser reconnects and reads the state again instead of missing a
 * frame on an open socket, and the port releases it instead of waiting for its confirmation.
 * @param ws The open socket.
 * @returns The socket as the browser port's connection.
 */
function connectionOf(ws: Bun.ServerWebSocket<VoiceSocket>): AdmittedConnection {
	return {
		/**
		 * Read the socket's state now, as the send checks it before each message.
		 * @returns Bun's ready state, which numbers its states as `ws` does.
		 */
		get readyState() {
			return ws.readyState;
		},
		/**
		 * Send one text frame, and end the socket and report the error when Bun dropped it.
		 * @param data The frame's text.
		 * @param callback Receives null once Bun took the frame, or the drop.
		 */
		send: (data, callback) => {
			if (ws.send(data) !== 0) {
				callback(null);
				return;
			}
			ws.terminate();
			callback(
				new Error(
					"The browser socket dropped a message over its backpressure limit, so it was closed. The browser reconnects to read the state again.",
				),
			);
		},
		/**
		 * Close the socket with a code and reason.
		 * @param code The close code.
		 * @param reason The close reason.
		 */
		close: (code, reason) => {
			ws.close(code, reason);
		},
	};
}

/**
 * Serve the agent's browser sockets on one path of a `Bun.serve` server, with the admission of
 * the `node:http` adapter. A request that is not a socket upgrade on the path goes to the host's
 * `fetch`, and a socket the host upgraded goes to the host's `websocket` handlers.
 * @param browser The agent's browser port.
 * @param options The path, origin, checkout and the host's own handlers.
 * @returns The handlers for `Bun.serve`, and detach: refuses later sockets on the path with 503,
 * closes the open ones and waits for their work.
 * @throws {TypeError} When the path or the named origin could never admit a socket.
 */
export function serveBunBrowserSockets<HostData>(
	browser: BrowserPort,
	options: VoiceAgentBunOptions<HostData> & { readonly checkout: string },
): { readonly handlers: VoiceAgentBunHandlers<HostData>; readonly detach: () => Promise<void> } {
	const { path, origin, checkout, websocket: host } = options;
	assertSocketPath(path);
	if (origin !== undefined) assertSocketOrigin(origin);
	const other = options.fetch ?? (() => new Response(null, { status: 404 }));
	const sessions = new Map<Bun.ServerWebSocket<VoiceSocket>, BrowserSocketSession>();
	let detaching: Promise<void> | undefined;
	/**
	 * Upgrade an admitted request, unless the agent shut down.
	 * @param request The request.
	 * @param server The receiving server.
	 * @param surface The socket's admitted surface.
	 * @returns Nothing once upgraded, else the refusal.
	 */
	const upgrade = (
		request: Request,
		server: Bun.Server<HostData | VoiceSocket>,
		surface: SocketSurface,
	): Response | undefined => {
		if (detaching !== undefined)
			return new Response("The voice agent stopped. Restart the server.", { status: 503 });
		const voiceServer = server as Bun.Server<VoiceSocket>;
		return voiceServer.upgrade(request, { data: new VoiceSocket(surface) })
			? undefined
			: new Response(null, { status: 400 });
	};
	/**
	 * Register an opened socket in the browser port, unless the agent shut down meanwhile.
	 * @param ws The opened socket.
	 */
	const open = (ws: Bun.ServerWebSocket<VoiceSocket>): void => {
		if (detaching !== undefined) {
			ws.close(1011, "The voice agent stopped. Restart the server.");
			return;
		}
		const session = openBrowserSocket(browser, connectionOf(ws), ws.data.surface, checkout);
		if (session !== null) sessions.set(ws, session);
	};
	/**
	 * Release a closed socket in the browser port.
	 * @param ws The closed socket.
	 */
	const close = (ws: Bun.ServerWebSocket<VoiceSocket>): void => {
		const session = sessions.get(ws);
		sessions.delete(ws);
		void session?.end();
	};
	const handlers: VoiceAgentBunHandlers<HostData> = {
		/**
		 * Upgrade a socket on the path, refuse an inadmissible one, and pass the rest on.
		 * @param request The request.
		 * @param server The receiving server.
		 * @returns The host's answer, the refusal, or nothing once upgraded.
		 */
		fetch: (request, server) => {
			const asked = upgradeOf(request);
			const surface =
				asked === null ? "other" : admitUpgrade(asked, path, origin ?? server.url.origin);
			if (surface === "other") return other(request, server);
			if (typeof surface === "number") return new Response(null, { status: surface });
			return upgrade(request, server, surface);
		},
		websocket: {
			...host,
			open: route(open, (ws) => host?.open?.(ws)),
			message: route(
				(ws, message: string | Buffer<ArrayBuffer>) =>
					sessions.get(ws)?.receive(typeof message === "string" ? message : null),
				(ws, message) => host?.message(ws, message),
			),
			close: route<HostData, [number, string]>(close, (ws, code, reason) =>
				host?.close?.(ws, code, reason),
			),
			drain: route(ignore, (ws) => host?.drain?.(ws)),
			...hostPings(host),
		},
	};
	return {
		handlers,
		/**
		 * Refuse later sockets, close the open ones in the port, and wait for their work, once.
		 * @returns Resolves when the port drained.
		 */
		detach: () =>
			(detaching ??= (async () => {
				const ends = [...sessions].map(([ws, session]) => {
					ws.terminate();
					return session.end();
				});
				await Promise.all(ends);
				await browser.drain();
			})()),
	};
}
