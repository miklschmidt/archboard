import { WebSocket } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import type { WebSocketMessage } from "@archboard/server-lifecycle/pane-messages";
import {
	addressablePanes,
	panesInOrder,
	resolvePaneSpec,
	soloPane,
} from "@archboard/server-lifecycle/panes";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { listSemanticBoards, readBoardVariant } from "@archboard/board/store-read";
import { aggregateOf, paneAddress } from "#server/rules/pane/board-key.ts";
import { watchBoardLocks, type WatchedBoard } from "@archboard/board/lock";
import { PANE_SETTLE_CAP_MS } from "@archboard/timing";
import type { BrowserConnectionInstance } from "@archboard/codex-realtime-voice/server";
import { createBrowserLeaseLedger } from "@archboard/codex-realtime-voice/server";
import { type BrowserLeaseLedger } from "@archboard/codex-realtime-voice/server";

// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because the board file
// is the board and the server holds no copy of one (ADR 0015, ADR 0023).
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneBoards`, the `pending*` sets and the Codex
// wiring. None of it can live in a board file, all of it dies with the tab, and
// a reading of ADR 0015 that forbade it would be unimplementable.
//
// Nothing else. Anything that answers "what is on this board" is the file.

/** Sockets admitted to broadcasts: the ones that have received their initial scene. */
const clients = new Set<WebSocket>();
// Accepted transport ownership begins before checkout presentation. A socket
// is broadcast-admitted only after initial_elements, but teardown must be able
// to terminate a peer that never reaches that point or ignores a close frame.
const acceptedSockets = new Set<WebSocket>();
// Client id per socket, from the ?clientId= connect param. Every selection
// post sends it too, so a disconnect retires that client's selection.
const clientIds = new Map<WebSocket, string>();
// The vault each socket named when it connected (ADR 0049). A board's news goes
// only to the sockets of its own vault.
const socketVaults = new Map<WebSocket, string>();
// The vault each pane belongs to, by client id. Like `paneBoards` it outlives the socket.
const paneVaults = new Map<string, string>();
// The exact socket currently presenting one pane identity. A reconnect may
// overlap the prior transport; only this map's value owns client-id keyed pane,
// selection, hold, and note-open state.
const currentSocketsByClient = new Map<string, WebSocket>();
// Initialization may finish out of acceptance order. One token per accepted
// client generation keeps a slower predecessor from taking authority back.
const latestSocketAcceptanceByClient = new Map<string, object>();
const codexSocketInstances = new Map<WebSocket, BrowserConnectionInstance>();
const browserLeaseLedger: BrowserLeaseLedger = createBrowserLeaseLedger();

// What is on screen right now, one entry per pane, keyed by the same client id.
// A pane is in here only while its socket is open: closing a tab or unsplitting
// takes the registration with it, so `panes` can never report a pane that is no
// longer in front of anybody. Empty is the normal headless state.
const panes = new Map<string, PaneRegistration>();

// Which board each pane has been pointed at, keyed by client id.
//
// This is the *authority*: what the server has decided a pane holds. The
// registration above carries what the pane says it is rendering, which is the
// same thing a beat later, and reporting the pane's own answer is what keeps
// `panes` a description of the displayed scenes rather than a restatement of
// this map.
//
// Entries outlive the socket on purpose. A dropped connection reconnects with
// the same client id, and a pane that came back showing a different board than
// it had a second ago would undo a user's scene arrangement.
const paneBoards = new Map<string, string>();

/**
 * The board a pane is authoritatively showing: the server's decision where it
 * has made one, the pane's own report otherwise.
 * @param pane The pane registration being asked about.
 * @returns The board key that pane holds, or null when it holds none.
 */
function boardForPane(pane: PaneRegistration): string | null {
	return paneBoards.get(pane.clientId) ?? pane.board;
}

/**
 * The board one pane is on, by client id, for a reader that has no
 * registration in hand.
 * @param clientId The pane's client id.
 * @returns The board key, or null when that pane is on none.
 */
function paneBoardOf(clientId: string): string | null {
	return paneBoards.get(clientId) ?? null;
}

/**
 * What each pane holds, in reading order.
 * @returns One entry per pane with its place on screen and its board.
 */
function boardsOnScreen(): Array<{ paneId: string; place: string; board: string | null }> {
	return panesInOrder(addressablePanes([...panes.values()])).map((entry) => ({
		paneId: entry.pane.paneId,
		place: entry.place,
		board: boardForPane(entry.pane),
	}));
}

/**
 * The live sockets belonging to one pane.
 * @param clientId The pane's client id.
 * @returns Every open socket registered under that id.
 */
function socketsFor(clientId: string): WebSocket[] {
	const found: WebSocket[] = [];
	clientIds.forEach((id, socket) => {
		if (id === clientId && socket.readyState === WebSocket.OPEN) {
			found.push(socket);
		}
	});
	return found;
}

/**
 * Send one serialized message to every admitted client of one vault, dropping
 * a client whose socket refuses it.
 * @param vault The vault whose clients hear it.
 * @param data The JSON already serialized for the wire.
 */
function sendToVaultClients(vault: string, data: string): void {
	clients.forEach((client) => {
		if (socketVaults.get(client) !== vault) {
			return;
		}
		try {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

/**
 * Broadcast board news to every client connected for the board's vault.
 *
 * The board key is not optional: a client showing board A has to be able to
 * drop a message about board B rather than merge it into what it is rendering.
 * The vault is not optional either, and it is filtered here: a pane never hears
 * of a board of another vault, even one of the same name (ADR 0049).
 * @param message The message to send.
 * @param vault The vault the board lives in.
 * @param board The board the message is about; stamped onto the message.
 */
function broadcast(message: WebSocketMessage, vault: string, board: string): void {
	sendToVaultClients(vault, JSON.stringify({ ...message, board }));
	for (const observer of broadcastObservers) {
		observer(message, vault, board);
	}
}

/**
 * Deliver one serialized message to every live socket of one pane.
 * @param clientId The pane's client id.
 * @param data The JSON already serialized for the wire.
 * @returns Whether at least one socket accepted it.
 */
function deliverToPane(clientId: string, data: string): boolean {
	let delivered = false;
	for (const socket of socketsFor(clientId)) {
		try {
			socket.send(data);
			delivered = true;
		} catch {
			logger.warn("Failed to send to a pane, removing");
			clients.delete(socket);
		}
	}
	return delivered;
}

/**
 * Send board news to one pane, named by client id.
 *
 * A board switch is the message this exists for: it replaces the receiving
 * pane's whole scene, so sending it to every socket is how one pane's `board
 * open` used to drag the other pane along with it.
 * @param clientId The pane's client id.
 * @param message The message to send.
 * @param board The board the message is about; stamped onto the message.
 * @returns Whether the pane received it.
 */
function sendToPane(clientId: string, message: WebSocketMessage, board: string): boolean {
	return deliverToPane(clientId, JSON.stringify({ ...message, board }));
}

/**
 * Send one pane something about the pane itself rather than about a board:
 * open another one, close this one, or, for a pane on no board, the vault it
 * has just been moved into. None of it is board news, so stamping a board key on it
 * would be inventing one. Kept separate from `sendToPane` so that omitting the
 * board stays a deliberate act rather than a missing argument.
 * @param clientId The pane's client id.
 * @param message The boardless message to send.
 * @returns Whether the pane received it.
 */
function sendBoardlessToPane(clientId: string, message: WebSocketMessage): boolean {
	return deliverToPane(clientId, JSON.stringify(message));
}

/**
 * The boards on screen, as the aggregates their panes show, each in the
 * vault its pane belongs to.
 * @returns Their vaults and keys.
 */
function watchedBoards(): WatchedBoard[] {
	return [...paneBoards].flatMap(([clientId, key]) => {
		const vault = paneVaults.get(clientId);
		const board = aggregateOf(key);
		return vault === undefined || board === null ? [] : [{ vault, board }];
	});
}

/**
 * Watch the lock files of the boards on screen, while there is a screen.
 *
 * The lock broadcast reaches the panes of this server. A second server over
 * the same vault cannot be told anything, because the lock is a file, so its
 * panes would learn about a claim at the write rather than before the touch —
 * for a claim that runs minutes, that is minutes of a pane letting somebody
 * draw into a board an agent has (ADR 0016). Reading the files is how a pane
 * hears news nobody sent it.
 *
 * Only while a tab is connected: a pane exists while something renders it, and
 * with nothing rendering there is nobody to be wrong. Called on every
 * connection and every close, so the cost is paid by a server somebody is
 * looking at and by no other.
 */
function syncLockWatch(): void {
	watchBoardLocks(clients.size > 0 ? { boards: watchedBoards } : null);
}

/**
 * The pane a new pane copies: the primary one, else the focused one, else any,
 * of its own vault.
 * @param vault The vault the new pane belongs to.
 * @returns The reference pane, or null with nothing on screen.
 */
function referencePane(vault: string): PaneRegistration | null {
	const existing = addressablePanes(panesOfVault(vault));
	return (
		existing.find((pane) => pane.primary) ??
		existing.find((pane) => pane.focused) ??
		existing[0] ??
		null
	);
}

/**
 * What a pane opening for the first time should show.
 *
 * A split is "another look at what I am working on", so a new pane starts on
 * whatever is already in front of the human and is then pointed somewhere else
 * deliberately.
 * @param clientId The client id of the arriving pane.
 * @param vault The vault the arriving pane named.
 * @returns The board key that pane starts on, or null when the vault is empty.
 */
function boardForNewPane(clientId: string, vault: string): string | null {
	for (const candidate of copyableBoards(clientId, vault)) {
		if (stillThere(vault, candidate)) {
			return candidate;
		}
	}
	// Nothing to copy: the vault's first board, so a tab opened on an empty
	// address shows an architecture rather than an empty frame. A vault with no
	// board at all leaves the pane on none, and the navigator says so.
	const first = listSemanticBoards(vault)[0];
	return first === undefined ? null : first.key;
}

/**
 * Whether a pane key still names something: the board, and the variant of it
 * the key names.
 *
 * A pane key carries the variant after the last `@` (ADR 0009) and a board is
 * addressed by name alone — the whole family is in the one document — so the
 * key has to be taken apart before either half is looked up. Reading the key
 * whole refuses every proposal a pane was showing, and the pane comes back on
 * the current variant of the first board in the vault: not what it was looking
 * at, and quietly so.
 * @param vault The vault the board lives in.
 * @param key The pane's board key.
 * @returns True when that board is still there and has the variant the key states.
 */
function stillThere(vault: string, key: string): boolean {
	const identity = paneAddress(key);
	if (identity === null) {
		return false;
	}
	const opened = readBoardVariant(vault, identity.board, identity.variant);
	// A bare key names the board, whatever it opens: on a board nobody has built
	// that is its draft, or a refusal the pane draws naming the drafts to choose
	// from. Either is the board it was on, said on screen, never another board.
	return opened.ok || opened.code === "VARIANT_UNCHOSEN";
}

/**
 * The boards a new pane would take over from, in order of preference: the one
 * it was showing before its socket dropped, then whatever is already in front
 * of the human.
 * @param clientId The client id of the arriving pane.
 * @param vault The vault the arriving pane named.
 * @returns The candidates, best first.
 */
function copyableBoards(clientId: string, vault: string): string[] {
	const remembered = paneVaults.get(clientId) === vault ? paneBoards.get(clientId) : undefined;
	const reference = referencePane(vault);
	const boards: string[] = [];
	if (remembered !== undefined) {
		boards.push(remembered);
	}
	const shown = reference === null ? null : boardForPane(reference);
	if (shown !== null) {
		boards.push(shown);
	}
	return boards;
}

/**
 * The pane a board request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the board is loaded without being shown, and two panes means say which
 * (packages/server-lifecycle/src/runtime/rules/panes.ts). The response always names where the board landed.
 * A named pane may show another repository's board now, and the show moves it
 * into the board's vault (ADR 0050). An unnamed one is only one of the board's
 * own vault, so a board is never put in front of a pane nobody pointed at it.
 * @param vault The vault the board lives in.
 * @param spec The pane spec the caller sent, if any.
 * @returns The pane, or null when the board is loaded without being shown.
 */
function paneFromRequest(vault: string, spec: unknown): PaneRegistration | null {
	if (typeof spec === "string" && spec.trim()) {
		return resolvePaneSpec([...panes.values()], spec);
	}
	return soloPane(panesOfVault(vault));
}

/**
 * The panes on screen that belong to one vault.
 * @param vault The vault.
 * @returns Their registrations.
 */
function panesOfVault(vault: string): PaneRegistration[] {
	return [...panes.values()].filter((pane) => pane.vault === vault);
}

/**
 * The pane that answers a request addressed to "the browser" and to no board.
 *
 * Image export and viewport control name a pane or take this one, and neither
 * of them names a board: a picture is of whatever is on that half of the
 * screen. So there is nothing here to resolve a board against, and nothing
 * that could resolve to the wrong one — the caller either says which pane or
 * gets the first.
 *
 * An operation that *does* name a board must not come through here. Use
 * `paneFromRequest`: the board it was given already settles which pane, so
 * taking the first one instead would answer a different question than the one
 * asked.
 * @returns The primary pane, else the first, else null with nothing on screen.
 */
function primaryPane(): PaneRegistration | null {
	const registrations = addressablePanes([...panes.values()]);
	return registrations.find((pane) => pane.primary) ?? registrations[0] ?? null;
}

/**
 * One pane, named the way a human would point at it: "the left pane".
 * @param pane The pane to describe.
 * @returns Its ids, place and reading-order position.
 */
function paneRef(pane: PaneRegistration): Record<string, unknown> {
	const entry = panesInOrder(addressablePanes([...panes.values()])).find(
		(p) => p.pane.clientId === pane.clientId,
	);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		place: entry?.place ?? "the only pane",
		position: entry?.position ?? 1,
	};
}

/**
 * Where a board landed, for the caller who did not say.
 * @param pane The pane it landed in, or null when no pane showed it.
 * @returns The `pane` field of a board answer.
 */
function paneResponse(pane: PaneRegistration | null): Record<string, unknown> {
	return { pane: pane ? paneRef(pane) : null };
}

// ─── Pane layout acknowledgements ─────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. The layout routes ask the
// browser to change its layout and then wait for the registry to agree. The
// acknowledgement is the pane appearing in `panes` or its socket closing —
// never a promise from the shell — because a registration is the only evidence
// anywhere in this process that a pane exists.

interface PendingPaneOpen {
	resolve: (pane: PaneRegistration) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	/** The panes that already existed, so the new one can be told from them. */
	known: Set<string>;
}
const pendingPaneOpens = new Set<PendingPaneOpen>();

interface PendingPaneClose {
	clientId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingPaneCloses = new Set<PendingPaneClose>();

/**
 * A pane has registered: settle every open request that was waiting for a
 * pane it did not already know. A recording page's is not a pane anybody asked for.
 * @param registration The pane that arrived.
 */
function notePaneOpened(registration: PaneRegistration): void {
	if (registration.recording === true) {
		return;
	}
	for (const pending of pendingPaneOpens) {
		if (pending.known.has(registration.clientId)) {
			continue;
		}
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve(registration);
	}
}

/**
 * A pane's socket has closed: settle every close request waiting on it.
 * @param clientId The client id of the pane that went.
 */
function notePaneClosed(clientId: string): void {
	for (const pending of pendingPaneCloses) {
		if (pending.clientId !== clientId) {
			continue;
		}
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve();
	}
}

/**
 * Fail every layout request still waiting, because the server is stopping.
 */
function rejectPendingLayouts(): void {
	for (const pending of pendingPaneOpens) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("The Archboard server stopped before the pane opened."));
	}
	for (const pending of pendingPaneCloses) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("The Archboard server stopped before the pane closed."));
	}
	pendingPaneOpens.clear();
	pendingPaneCloses.clear();
}

/**
 * Wait until the panes the layout change moved have reported themselves since
 * it was asked for.
 *
 * The answer to a layout change names where a pane ended up, and "left" and
 * "right" are read off the rectangles the panes report. So the report has to
 * be the one taken after the shell re-laid them out, not the one from before.
 *
 * Only the panes named are waited on: the ones the shell was asked to open
 * or close and the ones sharing the screen whose rectangle changes with them.
 * A pane that registers meanwhile, or one that has gone since, is not asked
 * and not waited for, and the wait ends the moment the last named pane has
 * re-reported (TASK-153). PANE_SETTLE_CAP_MS is the bound, never the delay.
 * @param askedAt When the layout change was asked for, as an ISO timestamp.
 * @param moved The client ids whose rectangles the change affects.
 */
async function settleAfterLayout(askedAt: string, moved: Iterable<string>): Promise<void> {
	const waitedOn = new Set(moved);
	const deadline = Date.now() + PANE_SETTLE_CAP_MS;
	while (Date.now() < deadline) {
		for (const clientId of waitedOn) {
			const pane = panes.get(clientId);
			if (!pane || pane.at > askedAt) {
				waitedOn.delete(clientId);
			}
		}
		if (waitedOn.size === 0) {
			return;
		}
		// oxlint-disable-next-line no-await-in-loop -- polling the registry: each check waits for the previous pause to elapse
		await Bun.sleep(50);
	}
}

/**
 * Forget every socket and pane this process was holding, because the server is
 * stopping and there is no screen any more.
 */
function forgetDisplay(): void {
	acceptedSockets.clear();
	clients.clear();
	clientIds.clear();
	socketVaults.clear();
	paneVaults.clear();
	currentSocketsByClient.clear();
	latestSocketAcceptanceByClient.clear();
	codexSocketInstances.clear();
	panes.clear();
	paneBoards.clear();
	browserLeaseLedger.sessions.clear();
}

export {
	acceptedSockets,
	aggregateOf,
	boardForNewPane,
	boardForPane,
	boardsOnScreen,
	broadcast,
	browserLeaseLedger,
	clientIds,
	clients,
	codexSocketInstances,
	currentSocketsByClient,
	forgetDisplay,
	latestSocketAcceptanceByClient,
	notePaneClosed,
	notePaneOpened,
	paneBoardOf,
	paneBoards,
	paneFromRequest,
	paneVaults,
	paneRef,
	paneResponse,
	panes,
	pendingPaneCloses,
	pendingPaneOpens,
	primaryPane,
	rejectPendingLayouts,
	sendBoardlessToPane,
	sendToPane,
	settleAfterLayout,
	socketVaults,
	socketsFor,
	syncLockWatch,
};
export type { PendingPaneClose, PendingPaneOpen };

/** Whoever is watching what the panes are told about boards. */
const broadcastObservers = new Set<
	(message: WebSocketMessage, vault: string, board: string) => void
>();

/**
 * Watch every board announcement this server makes.
 *
 * For a reader that needs to know what the panes were told without being a
 * pane: the agent's context, which must never be able to disagree with what is
 * on screen because both come off the same announcement.
 * @param observer What to tell.
 * @returns Stops watching.
 */
function onBoardBroadcast(
	observer: (message: WebSocketMessage, vault: string, board: string) => void,
): () => void {
	broadcastObservers.add(observer);
	return (): void => {
		broadcastObservers.delete(observer);
	};
}

export { onBoardBroadcast };
