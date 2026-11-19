import type { WebSocket } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

import type { BrowserConnectionInstance } from "#runtime/voice/protocol/extension.ts";
import { messageOf } from "#server/request/services/request-fields.ts";
import {
	acceptedSockets,
	clients,
	clientIds,
	codexSocketInstances,
	currentSocketsByClient,
	forgetDisplay,
	latestSocketAcceptanceByClient,
	paneKeys,
	paneVaults,
	panes,
	socketVaults,
} from "#server/panes/services/registry.ts";
import { notePaneClosed, rejectPendingLayouts } from "#server/panes/services/pane-arrivals.ts";
import {
	forgetTabSession,
	forgetTabSessions,
	noteTabSession,
} from "#server/panes/services/tab-sessions.ts";
import {
	acceptCodexBrowser,
	closeCodexBrowser,
	drainCodexBrowsers,
} from "#server/workbench-host/services/wiring-hooks.ts";

/** What one accepted socket is registered as, before it is presented anything. */
interface RegisteredSocket {
	/** The vault it named when it connected: its panes show models of this vault only. */
	readonly vault: string;
	/** The pane it presents, or null for a socket that named none. */
	readonly clientId: string | null;
	/** The browser tab it belongs to, or null for a socket that named none or a malformed one. */
	readonly tabSessionId: TabSessionId | null;
	/** The token this acceptance is stamped with, so a predecessor cannot take authority back. */
	readonly acceptanceToken: object | null;
	/** Its Codex browser connection instance. */
	readonly codexInstance: BrowserConnectionInstance;
}

/**
 * Keep an accepted transport on the books until it closes, so that teardown can terminate a peer
 * that never reaches presentation or ignores a close frame.
 * @param ws The accepted socket.
 */
function trackAcceptedSocket(ws: WebSocket): void {
	acceptedSockets.add(ws);
	ws.once("close", () => acceptedSockets.delete(ws));
}

/**
 * Retire the client-id keyed state of a socket that owned its pane identity:
 * its registration and any layout request waiting on it.
 * @param closingId The pane's client id.
 */
function retirePaneOwner(closingId: string): void {
	currentSocketsByClient.delete(closingId);
	forgetTabSession(closingId);
	panes.delete(closingId);
	notePaneClosed(closingId);
}

/**
 * Forget a socket that has closed. Exact Codex cleanup is safe for a replaced
 * socket. Client-id keyed server state is not: a replacement may already own
 * that pane identity, so only the socket that owns it retires it.
 * @param ws The closed socket.
 * @param acceptanceToken The token this socket's acceptance was stamped with.
 */
function forgetClosedSocket(ws: WebSocket, acceptanceToken: object | null): void {
	clients.delete(ws);
	socketVaults.delete(ws);
	const closingId = clientIds.get(ws);
	clientIds.delete(ws);
	const closingCodexInstance = codexSocketInstances.get(ws);
	codexSocketInstances.delete(ws);
	if (closingId === undefined) {
		logger.info("WebSocket connection closed");
		return;
	}
	if (latestSocketAcceptanceByClient.get(closingId) === acceptanceToken) {
		latestSocketAcceptanceByClient.delete(closingId);
	}
	if (closingCodexInstance !== undefined) {
		void closeCodexBrowser(closingCodexInstance, closingId).catch((error) =>
			logger.error("Codex browser cleanup failed:", error),
		);
	}
	if (currentSocketsByClient.get(closingId) !== ws) {
		logger.info(`Replaced WebSocket connection closed (client ${closingId})`);
		return;
	}
	retirePaneOwner(closingId);
	logger.info("WebSocket connection closed");
}

/**
 * Register one accepted socket and attach the listener that retires it.
 * @param ws The socket.
 * @param named What its upgrade named: the vault, the pane it presents and the tab it belongs to.
 * @returns What the socket is registered as.
 */
function registerSocket(
	ws: WebSocket,
	named: Pick<RegisteredSocket, "vault" | "clientId" | "tabSessionId">,
): RegisteredSocket {
	const { vault, clientId, tabSessionId } = named;
	const codexInstance = Object.freeze({});
	codexSocketInstances.set(ws, codexInstance);
	socketVaults.set(ws, vault);
	const acceptanceToken = clientId === null ? null : Object.freeze({});
	if (clientId !== null && acceptanceToken !== null) {
		clientIds.set(ws, clientId);
		latestSocketAcceptanceByClient.set(clientId, acceptanceToken);
	}
	ws.on("close", () => forgetClosedSocket(ws, acceptanceToken));
	return { vault, clientId, tabSessionId, acceptanceToken, codexInstance };
}

/**
 * Record the vault and model a pane holds as its socket takes its authority.
 *
 * A choice of checkout may have moved the pane while its first message was on
 * the way (ADR 0050). The socket has carried that move to the page already, so
 * the pane is in the vault and on the model the move gave it.
 * @param ws The socket.
 * @param clientId The pane's client id.
 * @param startingKey The model the pane was started on.
 * @param vault The vault it was started in.
 */
function holdPaneKey(
	ws: WebSocket,
	clientId: string,
	startingKey: string | null,
	vault: string,
): void {
	const current = socketVaults.get(ws) ?? vault;
	// A pane that comes back naming another vault holds none of what it held in
	// the first: a model key means a model of one vault.
	if (paneVaults.get(clientId) !== current) {
		paneKeys.delete(clientId);
	}
	paneVaults.set(clientId, current);
	if (startingKey !== null && current === vault) {
		paneKeys.set(clientId, startingKey);
	}
}

/**
 * Make this socket the one that owns its pane identity, terminating the
 * transport it replaces. A slower predecessor that finished initializing
 * after this one is refused by its stale acceptance token.
 * @param ws The socket.
 * @param clientId The pane's client id.
 * @param acceptanceToken The token this socket's acceptance was stamped with.
 * @param startingKey The model the pane starts on.
 * @param vault The vault the pane was started in.
 * @returns False when this socket was superseded and has been terminated.
 */
function takePaneAuthority(
	ws: WebSocket,
	clientId: string,
	acceptanceToken: object,
	startingKey: string | null,
	vault: string,
): boolean {
	if (latestSocketAcceptanceByClient.get(clientId) !== acceptanceToken) {
		ws.terminate();
		return false;
	}
	const previous = currentSocketsByClient.get(clientId);
	holdPaneKey(ws, clientId, startingKey, vault);
	currentSocketsByClient.set(clientId, ws);
	if (previous !== undefined && previous !== ws) {
		previous.terminate();
	}
	return true;
}

/**
 * Take pane authority and admit the socket to broadcasts.
 *
 * Called only once the pane has been told which model it is on, so a socket
 * whose opening message never landed does not retire the live transport it was
 * replacing and then sit there owning a pane it cannot speak to.
 * @param ws The socket.
 * @param socket What it is registered as.
 * @param startingKey The model it starts on.
 * @returns False when a later socket had already taken this pane's authority.
 */
function admitSocket(ws: WebSocket, socket: RegisteredSocket, startingKey: string | null): boolean {
	const { clientId, acceptanceToken } = socket;
	if (clientId === null || acceptanceToken === null) {
		clients.add(ws);
		return true;
	}
	if (!takePaneAuthority(ws, clientId, acceptanceToken, startingKey, socket.vault)) {
		return false;
	}
	noteTabSession(clientId, socket.tabSessionId);
	clients.add(ws);
	try {
		acceptCodexBrowser(socket.codexInstance, clientId);
	} catch (error) {
		logger.error("Codex browser acceptance failed:", error);
	}
	return true;
}

/** Collects distinct cleanup failures, flattening aggregates, so one report names them all. */
class CleanupFailures {
	readonly failures: unknown[] = [];
	private readonly retained = new Set<unknown>();

	/**
	 * Retain one failure, or each failure inside an aggregate.
	 * @param error The failure.
	 */
	retain(error: unknown): void {
		if (error instanceof AggregateError) {
			for (const nested of error.errors) {
				this.retain(nested);
			}
			return;
		}
		if (this.retained.has(error)) {
			return;
		}
		this.retained.add(error);
		this.failures.push(error);
	}

	/**
	 * Throw one aggregate naming every retained failure, if there were any.
	 */
	throwIfAny(): void {
		if (this.failures.length === 0) {
			return;
		}
		const detail = this.failures.map((error) => messageOf(error)).join("; ");
		throw new AggregateError(this.failures, `Browser cleanup failed: ${detail}`);
	}
}

/**
 * Close every Codex browser connection the workbench still holds.
 * @param failures Where to retain what fails.
 */
async function closeCodexBrowsers(failures: CleanupFailures): Promise<void> {
	const settled = await Promise.allSettled(
		Array.from(codexSocketInstances, ([socket, instance]) => {
			const browserId = clientIds.get(socket);
			return browserId ? closeCodexBrowser(instance, browserId) : Promise.resolve();
		}),
	);
	for (const result of settled) {
		if (result.status === "rejected") {
			failures.retain(result.reason);
		}
	}
}

/**
 * Tear down every browser-facing owner: sockets, Codex browsers, pending
 * layout requests and tab sessions, then forget the display.
 */
async function closeBrowserOwners(): Promise<void> {
	const failures = new CleanupFailures();
	for (const socket of acceptedSockets) {
		socket.terminate();
	}
	await closeCodexBrowsers(failures);
	try {
		await drainCodexBrowsers();
	} catch (error) {
		failures.retain(error);
	}
	rejectPendingLayouts();
	forgetDisplay();
	forgetTabSessions();
	failures.throwIfAny();
}

export { admitSocket, closeBrowserOwners, registerSocket, trackAcceptedSocket };
export type { RegisteredSocket };
