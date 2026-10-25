import { createHash } from "node:crypto";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import {
	createServerCodexBrowserSocketSend,
	type ServerCodexBrowserWebSocket,
} from "#server/services/browser-socket/socket.ts";
import type { createCodexWorkbench } from "#server/services/owner/workbench.ts";

// The one admission rule of the agent's browser sockets, which the `node:http` and the Bun.serve
// adapters both apply: which upgrades are this path's, which are refused before they become a
// socket, and how an accepted socket's frames reach the browser port.

export type BrowserPort = ReturnType<typeof createCodexWorkbench>["browser"];

const PANE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

/** A socket the browser port can register: what its send needs, and a close with a code. */
export interface AdmittedConnection extends ServerCodexBrowserWebSocket {
	readonly close: (code: number, reason: string) => void;
}

/** What an upgrade on this path names: its pane, its tab session and the browser id of both. */
export interface SocketSurface {
	readonly tabSessionId: NonNullable<ReturnType<typeof parseTabSessionId>>;
	readonly paneId: string;
	readonly browserId: string;
}

/** The parts of an upgrade request that admission reads, as each adapter receives them. */
export interface UpgradeRequest {
	readonly url: string;
	readonly host: string | undefined;
	readonly origin: string | undefined;
}

/**
 * Refuse a socket path that is not absolute.
 * @param path The socket path.
 * @throws {TypeError} When it is not absolute.
 */
export function assertSocketPath(path: string): void {
	if (!path.startsWith("/"))
		throw new TypeError(`Name an absolute socket path, such as /api/voice, not ${path}.`);
}

/**
 * Refuse an origin that is not exactly an HTTP(S) origin. An unparseable origin would refuse
 * every upgrade on every path, and one with a path or a trailing slash would refuse every browser.
 * @param origin The listener's HTTP origin.
 * @throws {TypeError} When it cannot match a browser socket.
 */
export function assertSocketOrigin(origin: string): void {
	const url = URL.canParse(origin) ? new URL(origin) : null;
	if (url === null || !["http:", "https:"].includes(url.protocol) || url.origin !== origin)
		throw new TypeError(
			`Name the listener's own origin, such as http://127.0.0.1:4100, with no path, not ${origin}.`,
		);
}

/**
 * Read the tab session and pane a socket URL names, and derive the browser id from both, so a
 * reconnecting pane replaces its earlier socket.
 * @param url The socket URL.
 * @returns The surface, or null when either is missing or malformed.
 */
function surfaceIn(url: URL): SocketSurface | null {
	const tabSessionId = parseTabSessionId(url.searchParams.get("tabSessionId"));
	const paneId = url.searchParams.get("paneId");
	if (tabSessionId === null || paneId === null || !PANE_ID.test(paneId)) return null;
	const browserId = createHash("sha256")
		.update(JSON.stringify([tabSessionId, paneId]))
		.digest("hex");
	return { tabSessionId, paneId, browserId };
}

/**
 * Compare an upgrade's `Host` and `Origin` headers to the exact listener origin.
 * @param request The upgrade request.
 * @param origin The listener's HTTP origin.
 * @returns Whether the request comes from the listener's own page.
 */
function sameOrigin(request: UpgradeRequest, origin: string): boolean {
	return (
		request.host === new URL(origin).host &&
		(request.origin === undefined || request.origin === origin)
	);
}

/**
 * Decide what an upgrade asks for: another path, a refusal, or a surface on this path. The
 * `Host` header must name the origin's host, and an `Origin` header, when present, the origin.
 * @param request The upgrade request.
 * @param path The socket path.
 * @param origin The listener's HTTP origin.
 * @returns `"other"`, the refusal status, or the socket's surface.
 */
export function admitUpgrade(
	request: UpgradeRequest,
	path: string,
	origin: string,
): "other" | 400 | 403 | SocketSurface {
	let url: URL;
	try {
		url = new URL(request.url, origin);
	} catch {
		return 400;
	}
	if (url.pathname !== path) return "other";
	if (!sameOrigin(request, origin)) return 403;
	return surfaceIn(url) ?? 400;
}

/** One accepted socket's frames and its end, as the adapter hands them over. */
export interface BrowserSocketSession {
	/**
	 * Hand one complete frame to the browser port. A binary frame or text that is not JSON closes
	 * the socket with 1003; a request the port cannot finish closes it with 1011.
	 * @param text The frame's text, or null for a binary frame.
	 */
	readonly receive: (text: string | null) => void;
	/**
	 * Release the socket in the browser port, once. A later call is the first one's outcome.
	 * @returns Resolves when the port forgot the socket; never rejects.
	 */
	readonly end: () => Promise<void>;
}

/**
 * Register an upgraded socket in the browser port. When the agent is not ready the port refuses,
 * and the socket is closed with 1011.
 * @param browser The agent's browser port.
 * @param connection The open socket, which is also its exact instance in the port.
 * @param surface The socket's pane, tab session and browser id.
 * @param checkout The admitted checkout of this path.
 * @returns The socket's session, or null when the port refused it.
 */
export function openBrowserSocket(
	browser: BrowserPort,
	connection: AdmittedConnection,
	surface: SocketSurface,
	checkout: string,
): BrowserSocketSession | null {
	const { tabSessionId, paneId, browserId } = surface;
	try {
		browser.accept(connection, browserId, { paneId, tabSessionId, checkout });
	} catch {
		connection.close(1011, "The voice agent is unavailable. Restart the server.");
		return null;
	}
	const send = createServerCodexBrowserSocketSend(connection);
	let ended: Promise<void> | undefined;
	return {
		/**
		 * Parse one frame and hand it to the port.
		 * @param text The frame's text, or null for a binary frame.
		 */
		receive: (text) => {
			let input: unknown;
			try {
				if (text === null) throw new Error("binary message");
				input = JSON.parse(text);
			} catch {
				connection.close(1003, "Send a JSON request.");
				return;
			}
			void browser
				.handle(connection, browserId, input, send)
				.catch(() => connection.close(1011, "The connection ended. Reconnect to read its state."));
		},
		/**
		 * Release the socket in the port, once.
		 * @returns Resolves when the port forgot it.
		 */
		end: () =>
			(ended ??= browser
				.close(connection, browserId)
				.catch((error: unknown) => console.error(error))),
	};
}
