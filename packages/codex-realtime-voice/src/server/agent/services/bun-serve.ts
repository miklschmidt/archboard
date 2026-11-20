import {
	admitsOrigin,
	assertSocketPath,
	surfaceOf,
	type UpgradeRequest,
} from "#server/agent/services/admission.ts";
import type { VoiceConnection, VoiceRoute, VoiceSocket } from "#server/agent/services/connect.ts";

// The agent's sockets on one path of a `Bun.serve` server: the upgrade, its admission, and each
// socket's frames and close, all through `connect`, so its origin check is the one `connect`
// applies to every `{ request }` route.

/**
 * The `data` of a socket this adapter upgraded. The shared `websocket` handlers serve a socket
 * whose `data` is one of these and give every other socket to the host's own handlers.
 */
class VoiceSocketData {
	connection: VoiceConnection | null = null;

	/**
	 * Keep the upgrade request for the socket's `open`.
	 * @param request The upgrade's URL and headers.
	 */
	constructor(readonly request: UpgradeRequest) {}
}

type Fetched = Response | undefined | Promise<Response | undefined>;

/** Where the agent's sockets connect on a `Bun.serve` server, and the host's other handlers. */
export interface VoiceAgentBunOptions<HostData> {
	/** The socket path, such as `/voice`. Every other request goes to `fetch`. */
	readonly path: string;
	/** The admitted checkout the sockets work in. Default: the only listed checkout. */
	readonly checkout?: string;
	/**
	 * The host's handler of every request that is not a socket upgrade on `path`. It may upgrade
	 * sockets of its own with any other `data`. Default: answer 404.
	 */
	readonly fetch?: (request: Request, server: Bun.Server<HostData | VoiceSocketData>) => Fetched;
	/**
	 * The host's handlers of its own sockets. Their options, such as `maxPayloadLength`, apply to
	 * every socket of the server, because Bun has one handler set per server.
	 */
	readonly websocket?: Bun.WebSocketHandler<HostData>;
}

/** The `fetch` and `websocket` of `Bun.serve` options, with the agent's sockets in them. */
export interface VoiceAgentBunHandlers<HostData> {
	readonly fetch: (request: Request, server: Bun.Server<HostData | VoiceSocketData>) => Fetched;
	readonly websocket: Bun.WebSocketHandler<HostData | VoiceSocketData>;
}

type HostSocket<HostData> = Bun.ServerWebSocket<HostData>;
type AgentSocket = Bun.ServerWebSocket<VoiceSocketData>;
type AnySocket<HostData> = Bun.ServerWebSocket<HostData | VoiceSocketData>;

/** Bun's `readyState` of an open socket, which numbers its states as the WebSocket standard does. */
const OPEN = 1;

/**
 * Whether a socket of the server is one this adapter upgraded.
 * @param ws The socket.
 * @returns True for the agent's socket.
 */
function isVoice<HostData>(ws: AnySocket<HostData>): ws is AgentSocket {
	return ws.data instanceof VoiceSocketData;
}

/**
 * Whether a socket of the server is one the host upgraded itself.
 * @param ws The socket.
 * @returns True for the host's socket.
 */
function isHost<HostData>(ws: AnySocket<HostData>): ws is HostSocket<HostData> {
	return !(ws.data instanceof VoiceSocketData);
}

/**
 * Route one socket event to the agent's handler or to the host's, by the socket's `data`.
 * @param voice The agent's handler.
 * @param host The host's handler, when it has one.
 * @returns The server's handler of the event.
 */
function route<HostData, Rest extends unknown[]>(
	voice: (ws: AgentSocket, ...rest: Rest) => void,
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
 * Adapt Bun's socket to what `connect` sends with. `ws.send` answers the bytes it sent, -1 when it
 * queued the frame under backpressure, which Bun still sends in order, and 0 when it dropped the
 * frame over the server's `backpressureLimit`. Bun keeps the socket open after a drop, so the
 * adapter ends it: the browser reconnects and reads the state again instead of missing a frame on
 * an open socket.
 * @param ws The open socket.
 * @returns The socket as `connect` takes it.
 */
function socketOf(ws: AgentSocket): VoiceSocket {
	return {
		/**
		 * Send one text frame, and end the socket and throw when Bun dropped it.
		 * @param data The frame's text.
		 */
		send: (data) => {
			if (ws.readyState !== OPEN) throw new Error("The voice socket is not open.");
			if (ws.send(data) !== 0) return;
			ws.terminate();
			throw new Error(
				"The voice socket dropped a message over its backpressure limit, so it was closed. The browser reconnects to read the state again.",
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
 * Hand one frame of an agent socket to its connection. A binary frame, text that is not JSON and
 * JSON that is no voice request close the socket with 1003; a request that cannot be answered
 * closes it with 1011, and the browser reconnects to read the state.
 * @param ws The socket.
 * @param message The frame.
 */
function receive(ws: AgentSocket, message: string | Buffer): void {
	const { connection } = ws.data;
	if (connection === null) return;
	let frame: unknown;
	try {
		if (typeof message !== "string") throw new Error("binary message");
		frame = JSON.parse(message);
	} catch {
		ws.close(1003, "Send a JSON request.");
		return;
	}
	const handling = connection.receive(frame);
	if (handling === false) {
		ws.close(1003, "Send a voice request.");
		return;
	}
	void handling.catch(() => ws.close(1011, "The connection ended. Reconnect to read its state."));
}

/**
 * Serve the agent's sockets on one path of a `Bun.serve` server. An upgrade that `connect` would
 * refuse is refused before it upgrades: 403 for an origin, 400 for a URL without its tab session
 * and chat. A request that is not a socket upgrade on the path goes to the host's `fetch`, and a
 * socket the host upgraded goes to the host's `websocket` handlers.
 * @param connect The agent's `connect`.
 * @param origins The origins the agent admits beside its loopback default.
 * @param options The path, checkout and the host's own handlers.
 * @returns The handlers for `Bun.serve`.
 * @throws {TypeError} When the path could never admit a socket.
 */
export function serveBunBrowserSockets<HostData>(
	connect: (socket: VoiceSocket, route: VoiceRoute) => VoiceConnection,
	origins: ReadonlySet<string>,
	options: VoiceAgentBunOptions<HostData>,
): VoiceAgentBunHandlers<HostData> {
	const { path, checkout, websocket: host } = options;
	assertSocketPath(path);
	const other = options.fetch ?? (() => new Response(null, { status: 404 }));
	/**
	 * Upgrade an admitted request on the path, or refuse it.
	 * @param request The request.
	 * @param server The receiving server.
	 * @returns Nothing once upgraded, else the refusal.
	 */
	const upgrade = (request: Request, server: Bun.Server<HostData | VoiceSocketData>) => {
		const asked: UpgradeRequest = { url: request.url, headers: request.headers };
		if (!admitsOrigin(asked, origins)) return new Response(null, { status: 403 });
		if (surfaceOf(asked) === null) return new Response(null, { status: 400 });
		const voiceServer = server as Bun.Server<VoiceSocketData>;
		return voiceServer.upgrade(request, { data: new VoiceSocketData(asked) })
			? undefined
			: new Response(null, { status: 400 });
	};
	return {
		/**
		 * Upgrade a socket on the path, and pass every other request on.
		 * @param request The request.
		 * @param server The receiving server.
		 * @returns The host's answer, the refusal, or nothing once upgraded.
		 */
		fetch: (request, server) => {
			const upgrading = request.headers.get("upgrade")?.toLowerCase() === "websocket";
			if (!upgrading || new URL(request.url).pathname !== path) return other(request, server);
			return upgrade(request, server);
		},
		websocket: {
			...host,
			open: route(
				(ws) => {
					ws.data.connection = connect(socketOf(ws), {
						request: ws.data.request,
						...(checkout === undefined ? {} : { checkout }),
					});
				},
				(ws) => host?.open?.(ws),
			),
			message: route<HostData, [string | Buffer<ArrayBuffer>]>(receive, (ws, message) =>
				host?.message(ws, message),
			),
			close: route<HostData, [number, string]>(
				(ws) => void ws.data.connection?.close(),
				(ws, code, reason) => host?.close?.(ws, code, reason),
			),
			drain: route(ignore, (ws) => host?.drain?.(ws)),
			...hostPings(host),
		},
	};
}
