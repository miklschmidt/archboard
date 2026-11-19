// The server's one WebSocket listener: it admits an upgrade from the page and hands the socket to
// the architecture feed or to the pane it presents.

import type { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import { checkBrowserCsrf } from "@archboard/code-opener/browser-origin";
import { logger } from "@archboard/diagnostics/logger";

import {
	isArchitectureFeed,
	serveArchitectureFeed,
} from "#server/panes/connections/sockets/architecture-feed.ts";
import { server } from "#server/http/listener/wiring/server-app.ts";
import { acceptPaneSocket, trackAcceptedSocket } from "@archboard/workbench/panes";
import { vaultOfUpgrade } from "@archboard/workbench/host";

let wss: WebSocketServer | null = null;

/** The vault each upgrade named, checked when the upgrade was admitted. */
const upgradeVaults = new WeakMap<IncomingMessage, string>();

/**
 * Install the WebSocket server over the HTTP server and start accepting panes.
 */
function startWebSocketServer(): void {
	if (wss !== null) {
		throw new Error("The WebSocket server is already installed.");
	}
	const owner = new WebSocketServer({
		server,
		/**
		 * Refuse foreign pages before a socket can own a pane or a Codex session.
		 * @param info The HTTP upgrade request.
		 * @param done Answers the upgrade with the same origin policy as HTTP routes.
		 */
		verifyClient: (info, done) => {
			const { host, origin, referer } = info.req.headers;
			const secFetchSite = info.req.headers["sec-fetch-site"];
			const result = checkBrowserCsrf("request", {
				host,
				origin,
				referer,
				secFetchSite: Array.isArray(secFetchSite) ? secFetchSite.join(",") : secFetchSite,
			});
			if (!result.ok) {
				done(false, 403, result.code);
				return;
			}
			if (isArchitectureFeed(info.req)) {
				done(true);
				return;
			}
			// A pane belongs to one vault from its first message (ADR 0049), so a socket
			// that names none is turned away before it can own a pane.
			const vault = vaultOfUpgrade(info.req.url);
			if (!vault.ok) {
				done(false, vault.refusal.status, `${vault.refusal.code}: ${vault.refusal.error}`);
				return;
			}
			upgradeVaults.set(info.req, vault.vault);
			done(true);
		},
	});
	owner.on("connection", (socket, request) => {
		trackAcceptedSocket(socket);
		// A socket error with no listener would end the whole server, whichever socket it hit.
		socket.on("error", (error) => {
			logger().error("WebSocket error:", error);
			socket.terminate();
		});
		if (isArchitectureFeed(request)) {
			serveArchitectureFeed(socket);
			return;
		}
		const vault = upgradeVaults.get(request);
		if (vault === undefined) {
			socket.terminate();
			return;
		}
		void acceptPaneSocket(socket, request, vault).catch((error) => {
			logger().error("WebSocket pane acceptance failed:", error);
			socket.terminate();
		});
	});
	wss = owner;
}

/**
 * Close the WebSocket server, if one is installed.
 * @returns Resolves once it has closed.
 */
function closeWebSocketServer(): Promise<void> {
	const owner = wss;
	if (owner === null) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		owner.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			owner.removeAllListeners();
			if (wss === owner) {
				wss = null;
			}
			resolve();
		});
	});
}

export { closeWebSocketServer, startWebSocketServer };
