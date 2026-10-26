import { STATUS_CODES, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData } from "ws";
import {
	admitUpgrade,
	assertSocketOrigin,
	assertSocketPath,
	openBrowserSocket,
	type BrowserPort,
} from "#server/services/agent/admission.ts";

/** Where browser sockets connect, and the one origin they must come from. */
export interface VoiceAgentAttachOptions {
	/**
	 * The absolute socket path, such as `/api/voice`. Upgrades to any other path are left to the
	 * server's other listeners, so a server with no other listener must end those itself.
	 */
	readonly path: string;
	/**
	 * The listener's own HTTP origin exactly, such as `http://127.0.0.1:4100`, with no path or
	 * trailing slash. A socket whose `Host` header names another host, or whose `Origin` header
	 * names another origin, is refused with 403.
	 */
	readonly origin: string;
	/**
	 * The admitted checkout every socket on this path works in. The browser never selects it.
	 * Optional when the agent admits exactly one listed checkout.
	 */
	readonly checkout?: string;
}

/**
 * Decode the binary representations that ws uses for text frames.
 * @param raw The complete frame bytes.
 * @returns The JSON request text.
 */
function requestText(raw: RawData): string {
	if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
	if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
	return raw.toString("utf8");
}

/**
 * Serve the agent's browser sockets on one path of a `node:http` server.
 *
 * A socket names its tab session and chat in the query (`?tabSessionId=…&chatId=…`). Its browser
 * identity is derived from those two, so a reconnecting chat replaces its earlier socket.
 * @param server The HTTP server; Bun runs `node:http` servers.
 * @param browser The agent's browser port.
 * @param options The path, origin and checkout of these sockets.
 * @returns Detach: stops accepting, closes this path's sockets and waits for their work.
 * @throws {TypeError} When the path or origin could never admit a socket.
 */
export function attachBrowserSockets(
	server: Server,
	browser: BrowserPort,
	options: Required<VoiceAgentAttachOptions>,
): () => Promise<void> {
	const { path, origin, checkout } = options;
	assertSocketPath(path);
	assertSocketOrigin(origin);
	const sockets = new WebSocketServer({ noServer: true });
	/**
	 * Accept an upgrade to this path from the listener's own origin.
	 * @param request The upgrade request.
	 * @param socket The raw connection.
	 * @param head The first packet of the upgraded stream.
	 */
	const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
		const surface = admitUpgrade(
			{ url: request.url ?? "/", host: request.headers.host, origin: request.headers.origin },
			path,
			origin,
		);
		if (surface === "other") return;
		if (typeof surface === "number") {
			socket.end(`HTTP/1.1 ${surface} ${STATUS_CODES[surface]}\r\nConnection: close\r\n\r\n`);
			return;
		}
		sockets.handleUpgrade(request, socket, head, (connection) => {
			connection.on("error", () => connection.terminate());
			const session = openBrowserSocket(browser, connection, surface, checkout);
			if (session === null) return;
			connection.on("close", () => void session.end());
			connection.on("message", (raw, binary) => session.receive(binary ? null : requestText(raw)));
		});
	};
	server.on("upgrade", upgrade);
	let detaching: Promise<void> | undefined;
	return () =>
		(detaching ??= (async () => {
			server.off("upgrade", upgrade);
			for (const socket of sockets.clients) socket.terminate();
			await new Promise<void>((resolve) => sockets.close(() => resolve()));
			await browser.drain();
		})());
}
