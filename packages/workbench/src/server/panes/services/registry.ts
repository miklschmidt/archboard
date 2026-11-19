import type { BrowserConnectionInstance } from "#runtime/voice/protocol/extension.ts";
import type { BrowserLeaseLedger } from "#runtime/voice/protocol/extension.ts";
import { WebSocket } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import type { WebSocketMessage } from "@archboard/server-lifecycle/pane-messages";
import { addressablePanes, panesInOrder, resolvePane } from "@archboard/server-lifecycle/panes";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { readArchitectureModel } from "@archboard/model/store-read";
import { createBrowserLeaseLedger } from "@archboard/codex-realtime-voice/server";

// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because the model file
// is the model and the server holds no copy of one (ADR 0015, ADR 0023).
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneKeys`, the `pending*` sets and the Codex
// wiring. None of it can live in a model file, all of it dies with the tab, and
// a reading of ADR 0015 that forbade it would be unimplementable.
//
// Nothing else. Anything that answers "what is on this model" is the file.

/** Sockets admitted to broadcasts: the ones that have received their initial scene. */
const clients = new Set<WebSocket>();
// Accepted transport ownership begins before checkout presentation. A socket
// is broadcast-admitted only after initial_elements, but teardown must be able
// to terminate a peer that never reaches that point or ignores a close frame.
const acceptedSockets = new Set<WebSocket>();
// Client id per socket, from the ?clientId= connect param. Every selection
// post sends it too, so a disconnect retires that client's selection.
const clientIds = new Map<WebSocket, string>();
// The vault each socket named when it connected (ADR 0049). A model's news goes
// only to the sockets of its own vault.
const socketVaults = new Map<WebSocket, string>();
// The vault each pane belongs to, by client id. Like `paneKeys` it outlives the socket.
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

// Which model each pane has been pointed at, keyed by client id.
//
// This is the *authority*: what the server has decided a pane holds. The
// registration above carries what the pane says it is rendering, which is the
// same thing a beat later, and reporting the pane's own answer is what keeps
// `panes` a description of the displayed scenes rather than a restatement of
// this map.
//
// Entries outlive the socket on purpose. A dropped connection reconnects with
// the same client id, and a pane that came back showing a different model than
// it had a second ago would undo a user's scene arrangement.
const paneKeys = new Map<string, string>();

/**
 * The model a pane is authoritatively showing: the server's decision where it
 * has made one, the pane's own report otherwise.
 * @param pane The pane registration being asked about.
 * @returns The model key that pane holds, or null when it holds none.
 */
function paneKeyOf(pane: PaneRegistration): string | null {
	return paneKeys.get(pane.clientId) ?? pane.paneKey;
}

/**
 * The model one pane is on, by client id, for a reader that has no
 * registration in hand.
 * @param clientId The pane's client id.
 * @returns The model key, or null when that pane is on none.
 */
function paneKeyOfClient(clientId: string): string | null {
	return paneKeys.get(clientId) ?? null;
}

/**
 * Every pane that has reported itself, recordings included.
 * @returns Their registrations.
 */
function paneRegistrations(): PaneRegistration[] {
	return [...panes.values()];
}

/**
 * The panes a request can address: the ones on screen, not a recording page.
 * @returns Their registrations.
 */
function onScreenPanes(): PaneRegistration[] {
	return addressablePanes(paneRegistrations());
}

/**
 * What one pane last reported.
 * @param clientId The pane's client id.
 * @returns Its registration, or undefined when it has none.
 */
function paneOf(clientId: string): PaneRegistration | undefined {
	return panes.get(clientId);
}

/**
 * Whether a socket currently owns this pane's identity, which is what makes a report from it real.
 * @param clientId The pane's client id.
 * @returns True while a live socket presents the pane.
 */
function paneIsLive(clientId: string): boolean {
	return currentSocketsByClient.has(clientId);
}

/**
 * The vault the server last put a pane in.
 * @param clientId The pane's client id.
 * @returns The vault, or undefined for a pane the server has not placed.
 */
function paneVaultOf(clientId: string): string | undefined {
	return paneVaults.get(clientId);
}

/**
 * Every pane with the vault the server last put it in.
 * @returns The client id and vault of each placed pane.
 */
function panesWithVaults(): Array<[clientId: string, vault: string]> {
	return [...paneVaults];
}

/**
 * How many sockets are admitted to broadcasts.
 * @returns The count.
 */
function admittedClientCount(): number {
	return clients.size;
}

/**
 * Send one serialized message to every admitted socket of every vault, dropping a socket that
 * cannot take it.
 * @param data The JSON already serialized for the wire.
 */
function sendToEveryClient(data: string): void {
	for (const client of clients) {
		try {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	}
}

/**
 * A pane is on a model, so record it as the model the server holds it on.
 *
 * Registration is the pane saying what it is showing, and a pane that has just
 * arrived on a model may be arriving into one an agent already holds and is
 * part way through. Recording it outright is how every arrival learns it; a
 * broadcast only reaches whoever was already there.
 * @param clientId The pane's client id.
 * @param paneKey The model it is now showing.
 */
function arrivedOnModel(clientId: string, paneKey: string): void {
	paneKeys.set(clientId, paneKey);
}

/**
 * What each pane holds, in reading order.
 * @returns One entry per pane with its place on screen and its model.
 */
function paneKeysOnScreen(): Array<{ paneId: string; place: string; paneKey: string | null }> {
	return panesInOrder(addressablePanes([...panes.values()])).map((entry) => ({
		paneId: entry.pane.paneId,
		place: entry.place,
		paneKey: paneKeyOf(entry.pane),
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
			logger().warn("Failed to send to a pane, removing");
			clients.delete(socket);
		}
	}
	return delivered;
}

/**
 * Send model news to one pane, named by client id.
 *
 * A model switch is the message this exists for: it replaces the receiving
 * pane's whole scene, so sending it to every socket is how one pane's open
 * used to drag the other pane along with it.
 * @param clientId The pane's client id.
 * @param message The message to send.
 * @param paneKey The pane key the message is about; stamped onto the message.
 * @returns Whether the pane received it.
 */
function sendToPane(clientId: string, message: WebSocketMessage, paneKey: string): boolean {
	return deliverToPane(clientId, JSON.stringify({ ...message, paneKey }));
}

/**
 * Send one pane something about the pane itself rather than about a model:
 * open another one, close this one, or, for a pane on no model, the vault it
 * has just been moved into. None of it is model news, so stamping a model key on it
 * would be inventing one. Kept separate from `sendToPane` so that omitting the
 * model stays a deliberate act rather than a missing argument.
 * @param clientId The pane's client id.
 * @param message The keyless message to send.
 * @returns Whether the pane received it.
 */
function sendKeylessToPane(clientId: string, message: WebSocketMessage): boolean {
	return deliverToPane(clientId, JSON.stringify(message));
}

/**
 * The models on screen, as the aggregates their panes show, each in the
 * vault its pane belongs to.
 * @returns Their vaults and keys.
 */
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
 * @returns The model key that pane starts on, or null when the vault is empty.
 */
function paneKeyForNewPane(clientId: string, vault: string): string | null {
	for (const candidate of copyableModels(clientId, vault)) {
		if (stillThere(vault, candidate)) {
			return candidate;
		}
	}
	// Nothing to copy: the vault's first model, so a tab opened on an empty
	// address shows an architecture rather than an empty frame. A vault with no
	// model at all leaves the pane on none, and the navigator says so.
	return null;
}

/**
 * Whether a pane key still names something: the model, and the variant of it
 * the key names.
 *
 * A pane key carries the variant after the last `@` and a model is
 * addressed by name alone — the whole family is in the one document — so the
 * key has to be taken apart before either half is looked up. Reading the key
 * whole refuses every proposal a pane was showing, and the pane comes back on
 * the current variant of the first model in the vault: not what it was looking
 * at, and quietly so.
 * @param vault The vault the model lives in.
 * @param _key The opaque presentation key.
 * @returns True when that model is still there and has the variant the key states.
 */
function stillThere(vault: string, _key: string): boolean {
	return readArchitectureModel(vault).success;
}

/**
 * The models a new pane would take over from, in order of preference: the one
 * it was showing before its socket dropped, then whatever is already in front
 * of the human.
 * @param clientId The client id of the arriving pane.
 * @param vault The vault the arriving pane named.
 * @returns The candidates, best first.
 */
function copyableModels(clientId: string, vault: string): string[] {
	const remembered = paneVaults.get(clientId) === vault ? paneKeys.get(clientId) : undefined;
	const reference = referencePane(vault);
	const models: string[] = [];
	if (remembered !== undefined) {
		models.push(remembered);
	}
	const shown = reference === null ? null : paneKeyOf(reference);
	if (shown !== null) {
		models.push(shown);
	}
	return models;
}

/**
 * The pane a model request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the model is loaded without being shown, and two panes means say which
 * (packages/server-lifecycle/src/runtime/rules/panes.ts). The response always names where the model landed.
 * A named pane may show another repository's model now, and the show moves it
 * into the model's vault (ADR 0050). An unnamed one is only one of the model's
 * own vault, so a model is never put in front of a pane nobody pointed at it.
 * @param vault The vault the model lives in.
 * @param spec The pane spec the caller sent, if any.
 * @returns The pane, or null when the model is loaded without being shown.
 */
function paneFromRequest(vault: string, spec: unknown): PaneRegistration | null {
	if (typeof spec === "string" && spec.trim()) {
		return resolvePane([...panes.values()], spec);
	}
	return resolvePane(panesOfVault(vault));
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
 * The pane that answers a request addressed to "the browser" and to no model.
 *
 * Image export and viewport control name a pane or take this one, and neither
 * of them names a model: a picture is of whatever is on that half of the
 * screen. So there is nothing here to resolve a model against, and nothing
 * that could resolve to the wrong one — the caller either says which pane or
 * gets the first.
 *
 * An operation that *does* name a model must not come through here. Use
 * `paneFromRequest`: the model it was given already settles which pane, so
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
 * Where a model landed, for the caller who did not say.
 * @param pane The pane it landed in, or null when no pane showed it.
 * @returns The `pane` field of a model answer.
 */
function paneResponse(pane: PaneRegistration | null): Record<string, unknown> {
	return { pane: pane ? paneRef(pane) : null };
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
	paneKeys.clear();
	browserLeaseLedger.sessions.clear();
}

export {
	acceptedSockets,
	admittedClientCount,
	arrivedOnModel,
	browserLeaseLedger,
	clientIds,
	clients,
	codexSocketInstances,
	currentSocketsByClient,
	forgetDisplay,
	latestSocketAcceptanceByClient,
	onScreenPanes,
	paneFromRequest,
	paneIsLive,
	paneKeyForNewPane,
	paneKeyOf,
	paneKeyOfClient,
	paneKeys,
	paneKeysOnScreen,
	paneOf,
	paneRegistrations,
	paneResponse,
	panes,
	paneVaultOf,
	paneVaults,
	panesWithVaults,
	primaryPane,
	sendKeylessToPane,
	sendToEveryClient,
	sendToPane,
	socketVaults,
};
