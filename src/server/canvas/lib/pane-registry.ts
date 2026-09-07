import { WebSocket } from "ws";
import { logger } from "@/runtime/engine/logger";
import { selectionState } from "@/runtime/engine/types";
import type { WebSocketMessage } from "@/runtime/engine/types";
import { panesInOrder, resolvePaneSpec, soloPane } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { boards, SCRATCH_KEY } from "@/runtime/engine/board-store";
import { sleep, watchBoardLocks } from "@/runtime/engine/board-lock";
import { PANE_SETTLE_CAP_MS } from "@/shared/timing/timing";
import type { BrowserConnectionInstance } from "@/server/canvas/codex-workbench-browser";
import { createBrowserLeaseLedger, type BrowserLeaseLedger } from "@/server/codex-workbench";

// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because ADR 0015 says
// the note is the board and the canvas holds no copy of one. Three kinds of
// thing survive that, and the test is which question each answers.
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneBoards`, `selectionState`, the `pending*`
// sets and the Codex wiring. None of it can live in a note, all of it dies
// with the tab, and a reading of ADR 0015 that forbade it would be
// unimplementable — which is why the ADR names it.
//
// A record of what a board used to be answers "how did it stand then": the
// change feed's baseline and checkpoints (`src/runtime/engine/change-feed.ts`) and
// `snapshots` (`src/runtime/engine/types.ts`). Each carries its own reasoning; the
// short form is that the vault has never held a board's past and so
// statelessness does not move them anywhere.
//
// Where each board's note is answers "which boards does this canvas have open"
// (`src/runtime/engine/board-store.ts`). That is a fact about this process, like which
// pane has focus, and the note has nowhere to put it.
//
// Nothing else. Anything that answers "what is on this board" is the note.

/** Sockets admitted to broadcasts: the ones that have received their initial scene. */
const clients = new Set<WebSocket>();
// Accepted transport ownership begins before checkout presentation. A socket
// is broadcast-admitted only after initial_elements, but teardown must be able
// to terminate a peer that never reaches that point or ignores a close frame.
const acceptedSockets = new Set<WebSocket>();
// Browser client id per socket, taken from the ?clientId= connect param. The
// same id is sent with every selection post, which is what lets a disconnect
// retire that client's selection.
const clientIds = new Map<WebSocket, string>();
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
 * @returns The board key that pane holds.
 */
function boardForPane(pane: PaneRegistration): string {
	return paneBoards.get(pane.clientId) ?? pane.board;
}

/**
 * What each pane holds, in reading order.
 * @returns One entry per pane with its place on screen and its board.
 */
function boardsOnScreen(): Array<{ paneId: string; place: string; board: string }> {
	return panesInOrder(Array.from(panes.values())).map((entry) => ({
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
 * Send one serialized message to every admitted client, dropping a client
 * whose socket refuses it.
 * @param data The JSON already serialized for the wire.
 */
function sendToAllClients(data: string): void {
	clients.forEach((client) => {
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
 * Broadcast board news to every connected client.
 *
 * The board key is not optional: a client showing board A has to be able to
 * drop a message about board B rather than merge it into what it is rendering.
 * With two panes on two boards that filter stops being a formality — it is the
 * only thing keeping an edit on one board out of the other one's scene.
 * @param message The message to send.
 * @param board The board the message is about; stamped onto the message.
 */
function broadcast(message: WebSocketMessage, board: string): void {
	sendToAllClients(JSON.stringify({ ...message, board }));
}

/**
 * Broadcast something that is not about a board.
 *
 * Only the library and the navigator's agent activity qualify: each is one
 * thing behind every board, so a client applies it without asking which board
 * the message came from. Kept separate from `broadcast` so that omitting the
 * board key stays a deliberate act rather than a missing argument.
 * @param message The boardless message to send.
 */
function broadcastBoardless(message: WebSocketMessage): void {
	sendToAllClients(JSON.stringify(message));
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
 * open another one, close this one. Layout is not board news — the receiving
 * pane keeps whatever board it is holding — so stamping a board key on it
 * would be inventing one. Kept separate from `sendToPane` so that omitting the
 * board stays a deliberate act rather than a missing argument.
 * @param clientId The pane's client id.
 * @param message The layout message to send.
 * @returns Whether the pane received it.
 */
function sendLayoutToPane(clientId: string, message: WebSocketMessage): boolean {
	return deliverToPane(clientId, JSON.stringify(message));
}

/**
 * Watch the lock files of the boards on screen, while there is a screen.
 *
 * The lock broadcast reaches the panes of this canvas. A second canvas over
 * the same vault cannot be told anything, because the lock is a file, so its
 * panes would learn about a claim at the write rather than before the touch —
 * for a claim that runs minutes, that is minutes of a pane letting somebody
 * draw into a board an agent has (ADR 0016). Reading the files is how a pane
 * hears news nobody sent it.
 *
 * Only while a tab is connected: a pane exists while something renders it, and
 * with nothing rendering there is nobody to be wrong. Called on every
 * connection and every close, so the cost is paid by a canvas somebody is
 * looking at and by no other.
 */
function syncLockWatch(): void {
	watchBoardLocks(clients.size > 0 ? () => [...paneBoards.values()] : null);
}

/**
 * Tell every client which selection currently stands.
 *
 * Boardless: a selection names the client that made it, and a pane that reads
 * this decides what to do with it by whose it is, not by which board it is on.
 * Tagging it with a board would only give panes on other boards a reason to
 * drop a message that was never about their board in the first place.
 */
function broadcastSelection(): void {
	const current = selectionState.current ?? {
		elementIds: [],
		clientId: null,
		at: new Date().toISOString(),
	};
	broadcastBoardless({
		type: "selection_changed",
		elementIds: current.elementIds,
		clientId: current.clientId,
		at: current.at,
	});
}

/**
 * Drop every pick made on one board, because nothing on it can be selected
 * any more. A pane on another board keeps its pick.
 * @param boardKeyToClear The board whose selections are void.
 */
function clearSelectionForBoard(boardKeyToClear: string): void {
	for (const [clientId] of selectionState.byClient) {
		if (paneBoards.get(clientId) === boardKeyToClear) {
			selectionState.byClient.delete(clientId);
		}
	}
	const owner = selectionState.current?.clientId;
	if (owner && paneBoards.get(owner) === boardKeyToClear) {
		selectionState.current = null;
		broadcastSelection();
	}
}

/**
 * The pane a new pane copies: the primary one, else the focused one, else any.
 * @returns The reference pane, or null with nothing on screen.
 */
function referencePane(): PaneRegistration | null {
	const existing = Array.from(panes.values());
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
 * deliberately. With nothing on screen there is nothing to copy, and the
 * server's active board — the last one opened — is the only answer available.
 * @param clientId The client id of the arriving pane.
 * @returns The board key that pane starts on.
 */
function boardForNewPane(clientId: string): string {
	const remembered = paneBoards.get(clientId);
	if (remembered && boards.has(remembered)) {
		return remembered;
	}
	const reference = referencePane();
	const key = reference ? boardForPane(reference) : null;
	return key && boards.has(key) ? key : SCRATCH_KEY;
}

/**
 * The pane a board request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the board is loaded without being shown, and two panes means say which
 * (src/runtime/engine/panes.ts). The response always names where the board landed.
 * @param spec The pane spec the caller sent, if any.
 * @returns The pane, or null when the board is loaded without being shown.
 */
function paneFromRequest(spec: unknown): PaneRegistration | null {
	const registrations = Array.from(panes.values());
	if (typeof spec === "string" && spec.trim()) {
		return resolvePaneSpec(registrations, spec);
	}
	return soloPane(registrations);
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
	const registrations = Array.from(panes.values());
	return registrations.find((pane) => pane.primary) ?? registrations[0] ?? null;
}

/**
 * One pane, named the way a human would point at it: "the left pane".
 * @param pane The pane to describe.
 * @returns Its ids, place and reading-order position.
 */
function paneRef(pane: PaneRegistration): Record<string, unknown> {
	const entry = panesInOrder(Array.from(panes.values())).find(
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
 * pane it did not already know.
 * @param registration The pane that arrived.
 */
function notePaneOpened(registration: PaneRegistration): void {
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
 * Fail every layout request still waiting, because the canvas is stopping.
 */
function rejectPendingLayouts(): void {
	for (const pending of pendingPaneOpens) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("Canvas stopped before the pane opened."));
	}
	for (const pending of pendingPaneCloses) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("Canvas stopped before the pane closed."));
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
		await sleep(50);
	}
}

/**
 * Forget every socket, pane and selection this process was holding, because
 * the canvas is stopping and there is no screen any more.
 */
function forgetDisplay(): void {
	acceptedSockets.clear();
	clients.clear();
	clientIds.clear();
	currentSocketsByClient.clear();
	latestSocketAcceptanceByClient.clear();
	codexSocketInstances.clear();
	panes.clear();
	paneBoards.clear();
	browserLeaseLedger.active = null;
	browserLeaseLedger.retired.clear();
	selectionState.current = null;
	selectionState.byClient.clear();
}

export {
	acceptedSockets,
	boardForNewPane,
	boardForPane,
	boardsOnScreen,
	broadcast,
	broadcastBoardless,
	broadcastSelection,
	browserLeaseLedger,
	clearSelectionForBoard,
	clientIds,
	clients,
	codexSocketInstances,
	currentSocketsByClient,
	forgetDisplay,
	latestSocketAcceptanceByClient,
	notePaneClosed,
	notePaneOpened,
	paneBoards,
	paneFromRequest,
	paneRef,
	paneResponse,
	panes,
	pendingPaneCloses,
	pendingPaneOpens,
	primaryPane,
	rejectPendingLayouts,
	sendLayoutToPane,
	sendToPane,
	settleAfterLayout,
	socketsFor,
	syncLockWatch,
};
export type { PendingPaneClose, PendingPaneOpen };
