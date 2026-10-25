import { createHash } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerCodexBrowserSocketSend } from "#server/services/browser-socket/socket.ts";
import type { createCodexWorkbench } from "#server/services/owner/workbench.ts";

/** Where browser sockets connect, and the one origin they must come from. */
export interface VoiceAgentAttachOptions {
	/** The socket path, such as `/api/voice`. Upgrades to any other path are left to the server's other listeners. */
	readonly path: string;
	/**
	 * The listener's own HTTP origin, such as `http://127.0.0.1:4100`. A socket whose `Host`
	 * header names another host, or whose `Origin` header names another origin, is refused with 403.
	 */
	readonly origin: string;
	/**
	 * The admitted checkout every socket on this path works in. The browser never selects it.
	 * Optional when the agent admits exactly one listed checkout.
	 */
	readonly checkout?: string;
}

type BrowserPort = ReturnType<typeof createCodexWorkbench>["browser"];

const PANE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Compare a request's `Host` and `Origin` headers to the exact listener origin.
 * @param request The upgrade request.
 * @param expected The listener's HTTP origin.
 * @returns Whether the request comes from the listener's own page.
 */
function sameOrigin(request: IncomingMessage, expected: string): boolean {
	const { host, origin } = request.headers;
	return host === new URL(expected).host && (origin === undefined || origin === expected);
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
 * Refuse an upgrade before it becomes a socket.
 * @param socket The raw connection.
 * @param status The HTTP status line.
 */
function refuse(socket: Duplex, status: "400 Bad Request" | "403 Forbidden"): void {
	socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

/**
 * Read the tab session and pane a socket URL names.
 * @param url The socket URL.
 * @returns The surface, or null when either is missing or malformed.
 */
function surfaceIn(url: URL) {
	const tabSessionId = parseTabSessionId(url.searchParams.get("tabSessionId"));
	const paneId = url.searchParams.get("paneId");
	if (tabSessionId === null || paneId === null || !PANE_ID.test(paneId)) return null;
	return { tabSessionId, paneId };
}

/**
 * Decide what an upgrade asks for: another path, a refusal, or a surface on this path.
 * @param request The upgrade request.
 * @param path The socket path.
 * @param origin The listener's HTTP origin.
 * @returns `"other"`, the refusal status, or the socket's surface.
 */
function upgradeOf(request: IncomingMessage, path: string, origin: string) {
	let url: URL;
	try {
		url = new URL(request.url ?? "/", origin);
	} catch {
		return "400 Bad Request" as const;
	}
	if (url.pathname !== path) return "other" as const;
	if (!sameOrigin(request, origin)) return "403 Forbidden" as const;
	return surfaceIn(url) ?? ("400 Bad Request" as const);
}

/**
 * Forward one accepted socket's frames to the browser port until it closes.
 * @param browser The agent's browser port.
 * @param connection The open socket.
 * @param browserId The socket's browser identity.
 */
function serve(browser: BrowserPort, connection: WebSocket, browserId: string): void {
	connection.on("close", () => {
		void browser.close(connection, browserId).catch((error: unknown) => console.error(error));
	});
	connection.on("message", (raw, binary) => {
		let input: unknown;
		try {
			if (binary) throw new Error("binary message");
			input = JSON.parse(requestText(raw));
		} catch {
			connection.close(1003, "Send a JSON request.");
			return;
		}
		void browser
			.handle(connection, browserId, input, createServerCodexBrowserSocketSend(connection))
			.catch(() => connection.close(1011, "The connection ended. Reconnect to read its state."));
	});
}

/**
 * Serve the agent's browser sockets on one path of a `node:http` server.
 *
 * A socket names its tab session and pane in the query (`?tabSessionId=…&paneId=…`). Its browser
 * identity is derived from those two, so a reconnecting pane replaces its earlier socket.
 * @param server The HTTP server; Bun runs `node:http` servers.
 * @param browser The agent's browser port.
 * @param options The path, origin and checkout of these sockets.
 * @returns Detach: stops accepting, closes this path's sockets and waits for their work.
 */
export function attachBrowserSockets(
	server: Server,
	browser: BrowserPort,
	options: Required<VoiceAgentAttachOptions>,
): () => Promise<void> {
	const { path, origin, checkout } = options;
	const sockets = new WebSocketServer({ noServer: true });
	/**
	 * Accept an upgrade to this path from the listener's own origin.
	 * @param request The upgrade request.
	 * @param socket The raw connection.
	 * @param head The first packet of the upgraded stream.
	 */
	const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
		const surface = upgradeOf(request, path, origin);
		if (surface === "other") return;
		if (typeof surface === "string") {
			refuse(socket, surface);
			return;
		}
		const { tabSessionId, paneId } = surface;
		const browserId = createHash("sha256")
			.update(JSON.stringify([tabSessionId, paneId]))
			.digest("hex");
		sockets.handleUpgrade(request, socket, head, (connection) => {
			connection.on("error", () => connection.terminate());
			try {
				browser.accept(connection, browserId, { paneId, tabSessionId, checkout });
			} catch {
				connection.close(1011, "The voice agent is unavailable. Restart the server.");
				return;
			}
			serve(browser, connection, browserId);
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
