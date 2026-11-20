import type { IncomingMessage } from "http";
import { WebSocket, type RawData } from "ws";
import { parseModelRequest, type ArchitectureFeedFrame } from "@archboard/model-contract";
import { watchArchitectureModel } from "@archboard/model-store";
import { resolveVault } from "@archboard/server-requests/server";

/**
 * Whether an upgrade asks for the one architecture socket of a tab, not for a pane.
 * @param req The upgrade request.
 * @returns True for the feed, which names its vaults after it opens.
 */
function isArchitectureFeed(req: IncomingMessage): boolean {
	return new URL(req.url ?? "/", "http://localhost").pathname === "/api/architecture/events";
}

/**
 * Read one request of a feed socket.
 * @param raw The frame.
 * @returns The request, or null for a frame that is not one.
 */
function feedRequest(raw: RawData) {
	// ws hands every frame over as one buffer while nothing changes its binaryType.
	if (!Buffer.isBuffer(raw)) return null;
	try {
		const parsed = parseModelRequest("feed", JSON.parse(raw.toString("utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/**
 * Serve every vault that one tab follows over its one socket. A subscription
 * opens with a fresh reading, and each event names its vault.
 * @param ws The accepted socket.
 */
function serveArchitectureFeed(ws: WebSocket): void {
	const watching = new Map<string, () => void>();
	/**
	 * Send one frame while the socket is open.
	 * @param frame The frame.
	 */
	const send = (frame: ArchitectureFeedFrame): void => {
		if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
	};
	ws.on("message", (raw) => {
		const request = feedRequest(raw);
		if (request === null) return;
		const { type, vault } = request;
		if (type === "unsubscribe") {
			watching.get(vault)?.();
			watching.delete(vault);
			return;
		}
		if (watching.has(vault)) return;
		if (resolveVault(vault).ok) watching.set(vault, watchArchitectureModel(vault, send));
		else send({ type: "architecture_unavailable", vault });
	});
	ws.once("close", () => {
		for (const stop of watching.values()) stop();
		watching.clear();
	});
}

export { isArchitectureFeed, serveArchitectureFeed };
