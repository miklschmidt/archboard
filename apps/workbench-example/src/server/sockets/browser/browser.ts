import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { WebSocketServer, type RawData } from "ws";
import {
	createServerCodexBrowserSocketSend,
	parseTabSessionId,
	type createCodexWorkbench,
} from "@archboard/codex-realtime-voice/server";
import { WORKBENCH_SOCKET_PATH } from "#shared/protocol/application.ts";

/**
 * Compare browser request metadata to the exact loopback listener.
 * @param host The request host header.
 * @param origin The optional browser origin header.
 * @param expected The listener's HTTP origin.
 * @returns Whether the request belongs to this localhost application.
 */
export function sameOrigin(
	host: string | undefined,
	origin: string | undefined,
	expected: string,
): boolean {
	return host === new URL(expected).host && (origin === undefined || origin === expected);
}

/**
 * Parse the browser's surface identity without accepting a caller-selected checkout.
 * @param url The socket URL.
 * @returns The registered surface, or null for invalid metadata.
 */
function registration(url: URL) {
	const tabSessionId = parseTabSessionId(url.searchParams.get("tabSessionId"));
	const paneId = url.searchParams.get("paneId");
	if (url.pathname !== WORKBENCH_SOCKET_PATH || tabSessionId === null || paneId === null)
		return null;
	if (!/^[a-zA-Z0-9_-]{1,128}$/.test(paneId)) return null;
	return { tabSessionId, paneId };
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
 * Forward exact socket identities to the shared browser ingress.
 * @param server The application's HTTP listener.
 * @param workbench The single shared factory instance.
 * @param checkout The host's admitted checkout.
 * @param origin The bound listener origin.
 * @returns Socket shutdown for application cleanup.
 */
export function attachBrowserSockets(
	server: Server,
	workbench: ReturnType<typeof createCodexWorkbench>,
	checkout: string,
	origin: string,
) {
	const sockets = new WebSocketServer({ noServer: true });
	server.on("upgrade", (request, socket, head) => {
		let surface: ReturnType<typeof registration> = null;
		try {
			surface = registration(new URL(request.url ?? "/", origin));
		} catch {
			// Malformed request targets are refused before the socket enters the workbench.
		}
		if (!sameOrigin(request.headers.host, request.headers.origin, origin) || surface === null) {
			socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
			return;
		}
		const { tabSessionId, paneId } = surface;
		const browserId = createHash("sha256")
			.update(JSON.stringify([tabSessionId, paneId]))
			.digest("hex");
		sockets.handleUpgrade(request, socket, head, (connection) => {
			connection.on("error", () => connection.terminate());
			try {
				workbench.browser.accept(connection, browserId, { paneId, tabSessionId, checkout });
			} catch {
				connection.close(1011, "The workbench is unavailable. Restart the example server.");
				return;
			}
			connection.on("close", () => {
				void workbench.browser
					.close(connection, browserId)
					.catch((error: unknown) => console.error(error));
			});
			connection.on("message", (raw, binary) => {
				let input: unknown;
				try {
					if (binary) throw new Error("binary message");
					input = JSON.parse(requestText(raw));
				} catch {
					connection.close(1003, "Send a JSON workbench request.");
					return;
				}
				void workbench.browser
					.handle(connection, browserId, input, createServerCodexBrowserSocketSend(connection))
					.catch(() =>
						connection.close(1011, "The workbench connection ended. Reconnect to read its state."),
					);
			});
		});
	});
	return async () => {
		for (const socket of sockets.clients) socket.terminate();
		await new Promise<void>((resolve) => sockets.close(() => resolve()));
		await workbench.browser.drain();
	};
}
