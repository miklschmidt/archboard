import type { IncomingMessage } from "http";
import { WebSocket, type RawData } from "ws";
import {
	architectureFeedRequestSchema,
	type ArchitectureFeedFrame,
} from "@archboard/model/contract";
import { watchArchitectureModel } from "@archboard/model/store-read";
import { namedVault } from "@archboard/workbench/host";
import { frameText } from "#server/panes/connections/sockets/frame-text.ts";
import { followRepositories } from "#server/http/handlers/repositories/routes/repository-routes.ts";

/** The key a socket follows the repositories under, distinct from all submitted vault names. */
const REPOSITORIES = Symbol("repositories");
type Topic = string | typeof REPOSITORIES;

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
	try {
		const parsed = architectureFeedRequestSchema().safeParse(JSON.parse(frameText(raw)));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/**
 * Serve every vault that one tab follows over its one socket, and the
 * repositories of the machine when it follows them. A subscription opens with a
 * fresh reading or listing, and each event names its vault.
 * @param ws The accepted socket.
 */
function serveArchitectureFeed(ws: WebSocket): void {
	const watching = new Map<Topic, () => void>();
	/**
	 * Send one frame while the socket is open.
	 * @param frame The frame.
	 */
	const send = (frame: ArchitectureFeedFrame): void => {
		if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
	};
	/**
	 * Start to follow one topic: the repositories, or a vault the server can read.
	 * @param topic The vault, or the key of the repositories.
	 */
	const follow = (topic: Topic): void => {
		if (topic === REPOSITORIES) {
			const listed = followRepositories(({ instance, revision, repositories }) =>
				send({ type: "repositories", instance, revision, repositories }),
			);
			watching.set(topic, listed);
		} else if (namedVault(topic).ok) watching.set(topic, watchArchitectureModel(topic, send));
		else send({ type: "architecture_unavailable", vault: topic });
	};
	ws.on("message", (raw) => {
		const request = feedRequest(raw);
		if (request === null) return;
		const topic: Topic = "vault" in request ? request.vault : REPOSITORIES;
		if (request.type === "subscribe") {
			if (!watching.has(topic)) follow(topic);
			return;
		}
		watching.get(topic)?.();
		watching.delete(topic);
	});
	ws.once("close", () => {
		for (const stop of watching.values()) stop();
		watching.clear();
	});
}

export { isArchitectureFeed, serveArchitectureFeed };
