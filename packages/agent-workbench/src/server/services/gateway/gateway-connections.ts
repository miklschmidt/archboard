import type { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
import type {
	BrowserCommandLease,
	BrowserOperationOutcome,
	BrowserSnapshot,
} from "#shared/schemas/browser/snapshot.ts";
import type { IdentityAuthorities, JsonRpcRequestId } from "@archboard/codex-app-server/identity";
import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserConnectionId,
	type BrowserConnectionInstance,
	type BrowserDisconnectReason,
	type BrowserGatewayMessage,
	type BrowserGatewaySnapshotMessage,
	type BrowserProjectionPort,
	type BrowserPublishedPayload,
	type BrowserUnpresentedTerminal,
	type CodexWorkbenchGatewayOptions,
} from "#server/protocol/gateway/contract.ts";
import type { BrowserOwnerProjection } from "#server/protocol/projection/projection-contract.ts";
import {
	assertBrowserSnapshotBounded,
	diffBrowserSnapshots,
	fitBrowserSnapshotBounded,
	projectCodexBrowserState,
} from "#server/projections/browser-state/projection.ts";
import { type TabSessionId, workhorseLinkKey } from "#server/rules/tab-session/tab-session.ts";
import {
	connectionKey,
	emit,
	isOversizedDelta,
	publishedTerminalIds,
} from "#server/operations/command/browser-command.ts";

/** One browser's connection to one pane, and everything this process holds about it. */
interface ConnectionState {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly tabSessionId: TabSessionId;
	readonly instance: BrowserConnectionInstance;
	readonly listeners: Set<(message: BrowserGatewayMessage) => void>;
	readonly publishedTerminals: Set<JsonRpcRequestId>;
	sequence: number;
	lastSnapshot: BrowserSnapshot | null;
	operation: BrowserOperationOutcome | null;
	lease: BrowserCommandLease | null;
	binding: BrowserActionContext | null;
	mediaReady: boolean;
	disconnectNotified: boolean;
	closed: boolean;
}

/** What the connections owner needs from the gateway around it. */
interface BrowserConnectionOwners {
	readonly options: CodexWorkbenchGatewayOptions;
	readonly identity: IdentityAuthorities;
	readonly model: ReturnType<typeof createCodexBrowserModel>;
	readonly snapshotMaxBytes: number;
	/** The lease a snapshot of this connection reports, which the lease owner decides. */
	readonly leaseForSnapshot: (state: ConnectionState) => BrowserCommandLease | null;
	/** Forget the in-flight command a retired connection owned. */
	readonly forgetInFlightFor: (instance: BrowserConnectionInstance) => void;
}

/** The connection registry, the snapshots it publishes, and its teardown. */
interface BrowserConnections {
	readonly states: Map<string, ConnectionState>;
	/** Whether the gateway has been disposed; a disposed gateway serves nothing. */
	disposed: boolean;
	readonly readBinding: (
		state: Pick<ConnectionState, "tabSessionId" | "browserId">,
	) => ReturnType<CodexWorkbenchGatewayOptions["threadLink"]["read"]>;
	/** The thread link of the workhorse of one named checkout of a connection's tab. */
	readonly readBindingIn: (
		state: Pick<ConnectionState, "tabSessionId">,
		checkout: string,
	) => ReturnType<CodexWorkbenchGatewayOptions["threadLink"]["read"]>;
	readonly stateFor: (
		browserId: string,
		paneId: string,
		instance?: BrowserConnectionInstance,
	) => ConnectionState;
	readonly snapshotFor: (state: ConnectionState) => BrowserSnapshot;
	readonly updateSnapshot: (state: ConnectionState) => BrowserGatewaySnapshotMessage;
	readonly refreshProjection: (state: ConnectionState) => Promise<void>;
	readonly publishConnection: (state: ConnectionState) => void;
	readonly publishAll: () => void;
	readonly acknowledgeReadyTerminals: () => void;
	readonly confirmPublished: (state: ConnectionState, payload: BrowserPublishedPayload) => void;
	readonly setMediaReady: (state: ConnectionState, ready: boolean) => BrowserGatewaySnapshotMessage;
	readonly notifyDisconnect: (
		state: ConnectionState,
		reason: BrowserDisconnectReason,
	) => Promise<void>;
	readonly trackSettlement: (settlement: Promise<void>) => void;
	readonly drainSettlements: () => Promise<void>;
}

/**
 * Own every browser connection: the registry, the snapshot each one is shown,
 * the deltas it is published, and the teardown that retires it.
 * @param owners What the gateway around it provides.
 * @returns The connections owner.
 */
function createBrowserConnections(owners: BrowserConnectionOwners): BrowserConnections {
	const { options, model, snapshotMaxBytes } = owners;
	const states = new Map<string, ConnectionState>();
	const pendingSettlements = new Set<Promise<void>>();
	let publishing = false;
	let publishQueued = false;

	const connections: BrowserConnections = {
		states,
		disposed: false,

		/**
		 * The thread link of the workhorse a connection's pane shows: the one of its tab session
		 * for the checkout the pane's tab shows now (ADR 0050), refusing a binding that does not
		 * describe that workhorse.
		 * @param state The connection.
		 * @returns Its binding.
		 */
		readBinding: (state) =>
			readWorkhorseBinding(options, state.tabSessionId, () => options.checkoutOf(state.browserId)),

		/**
		 * The thread link of the workhorse of one named checkout of a connection's tab.
		 * @param state The connection.
		 * @param checkout The checkout.
		 * @returns Its binding.
		 */
		readBindingIn: (state, checkout) =>
			readWorkhorseBinding(options, state.tabSessionId, () => checkout),

		/**
		 * The open connection a request names, refusing a closed one and a socket
		 * that has since been replaced.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @param instance The socket the caller believes it is, when it knows.
		 * @returns The connection.
		 */
		stateFor: (browserId, paneId, instance) => {
			if (connections.disposed)
				throw new CodexWorkbenchGatewayError("disposed", "The browser gateway is disposed.");
			const state = states.get(connectionKey(browserId, paneId));
			if (state === undefined || state.closed)
				throw new CodexWorkbenchGatewayError("invalid_input", "The browser connection is closed.");
			if (instance !== undefined && state.instance !== instance)
				throw new CodexWorkbenchGatewayError(
					"invalid_input",
					"The browser socket instance was replaced.",
				);
			return state;
		},

		/**
		 * What one connection should be shown now: the owner's projection, bounded
		 * to the wire budget.
		 * @param state The connection.
		 * @returns The snapshot.
		 */
		snapshotFor: (state) => {
			const binding = connections.readBinding(state);
			const lease = owners.leaseForSnapshot(state);
			let projection: BrowserOwnerProjection;
			try {
				projection = options.projection.read({
					browserId: state.browserId,
					paneId: state.paneId,
					tabSessionId: state.tabSessionId,
					checkout: options.checkoutOf(state.browserId),
					connection: state.instance,
					binding,
					lease,
					mediaReady: state.mediaReady,
				});
			} catch (error) {
				throw new CodexWorkbenchGatewayError(
					"invalid_projection",
					"The workbench projection could not be read.",
					{ cause: error },
				);
			}
			try {
				const result = projectCodexBrowserState(model, {
					...projection,
					threadLink: binding.link,
					lease,
					operation: state.operation,
				});
				if (result.tag === "refused") throw new Error(result.message);
				const snapshot = fitBrowserSnapshotBounded(result.snapshot, snapshotMaxBytes);
				assertBrowserSnapshotBounded(snapshot, snapshotMaxBytes);
				return snapshot;
			} catch (error) {
				throw new CodexWorkbenchGatewayError(
					"invalid_projection",
					"The workbench published invalid browser state.",
					{ cause: error },
				);
			}
		},

		/**
		 * Take a fresh snapshot as this connection's current one, advancing its
		 * sequence when the browser is being shown something new.
		 * @param state The connection.
		 * @returns The snapshot message.
		 */
		updateSnapshot: (state) => {
			const snapshot = connections.snapshotFor(state);
			if (state.lastSnapshot === null) state.sequence = 0;
			else {
				try {
					if (diffBrowserSnapshots(state.lastSnapshot, snapshot) !== null) state.sequence += 1;
				} catch (error) {
					if (!isOversizedDelta(error)) throw error;
					state.sequence += 1;
				}
			}
			state.lastSnapshot = snapshot;
			return Object.freeze({ kind: "snapshot" as const, sequence: state.sequence, snapshot });
		},

		/**
		 * A snapshot request asks for state the browser can trust, so any owner
		 * that serves a projection from its own cache re-reads first. A failed
		 * re-read is the owner's to present; it never fails the snapshot.
		 * @param state The connection.
		 */
		refreshProjection: async (state) => {
			if (options.projection.refresh === undefined || state.closed) return;
			await options.projection.refresh(projectionContext(state));
		},

		/**
		 * Publish what changed to one connection, as a delta, or as a whole
		 * snapshot when the delta would not fit the wire budget.
		 * @param state The connection.
		 */
		publishConnection: (state) => {
			if (state.closed || state.lastSnapshot === null) return;
			const snapshot = connections.snapshotFor(state);
			try {
				const delta = diffBrowserSnapshots(state.lastSnapshot, snapshot);
				if (delta === null) return;
				state.sequence += 1;
				state.lastSnapshot = snapshot;
				emit(state.listeners, Object.freeze({ kind: "delta", sequence: state.sequence, delta }));
			} catch (error) {
				if (!isOversizedDelta(error)) throw error;
				state.sequence += 1;
				state.lastSnapshot = snapshot;
				emit(
					state.listeners,
					Object.freeze({ kind: "snapshot", sequence: state.sequence, snapshot }),
				);
			}
		},

		/**
		 * Publish to every connection, once, however many changes arrived while
		 * the last publication was in flight.
		 */
		publishAll: () => {
			if (connections.disposed) return;
			if (publishing) {
				publishQueued = true;
				return;
			}
			publishing = true;
			try {
				if (states.size === 0) {
					connections.acknowledgeReadyTerminals();
					return;
				}
				do {
					publishQueued = false;
					for (const state of states.values()) connections.publishConnection(state);
					// oxlint-disable-next-line typescript/no-unnecessary-condition -- publishConnection sets this again when a listener publishes during the pass; the assignment above narrowed it
				} while (publishQueued);
				connections.acknowledgeReadyTerminals();
			} finally {
				publishing = false;
			}
		},

		/**
		 * Let the approval owner stop presenting every terminal approval that has
		 * reached every open browser of its tab session.
		 */
		acknowledgeReadyTerminals: () => {
			const candidates = options.actions.ordinaryApprovals.unpresentedTerminals();
			forgetStaleTerminals(candidates.map(({ requestId }) => requestId));
			const requestIds = terminalsEverySessionBrowserHasSeen(candidates);
			if (requestIds.length === 0) return;
			options.actions.ordinaryApprovals.acknowledgePublished(requestIds);
			for (const state of states.values())
				for (const requestId of requestIds) state.publishedTerminals.delete(requestId);
		},

		/**
		 * Record that one connection has been shown a published payload.
		 * @param state The connection.
		 * @param payload What it was shown.
		 */
		confirmPublished: (state, payload) => {
			if (state.closed || states.get(connectionKey(state.browserId, state.paneId)) !== state)
				return;
			for (const requestId of publishedTerminalIds(payload))
				state.publishedTerminals.add(requestId);
			connections.acknowledgeReadyTerminals();
		},

		/**
		 * Record whether a connection can play media, publishing the change.
		 * @param state The connection.
		 * @param ready Whether it can.
		 * @returns Its snapshot afterwards.
		 */
		setMediaReady: (state, ready) => {
			connections.stateFor(state.browserId, state.paneId, state.instance);
			if (state.mediaReady !== ready) {
				state.mediaReady = ready;
				connections.publishConnection(state);
			}
			return connections.updateSnapshot(state);
		},

		/**
		 * Tell every owner that one browser connection has gone, once. What the connection's tab
		 * session holds stays, its approvals included: the tab may come back within its grace,
		 * and only the session's end settles them. Its voice stops, because the socket that
		 * carried its media is gone.
		 * @param state The connection.
		 * @param reason Why it went.
		 * @returns Resolves once every owner has settled.
		 */
		notifyDisconnect: (state, reason) => {
			if (state.disconnectNotified) return Promise.resolve();
			state.disconnectNotified = true;
			owners.forgetInFlightFor(state.instance);
			try {
				options.projection.onBrowserDisconnect?.(
					{ browserId: state.browserId, paneId: state.paneId, connection: state.instance },
					reason,
				);
			} catch {
				// Projection retirement is best effort; the gateway still settles every
				// existing disconnect owner and closes the exact connection.
			}
			const settlement = invokeDisconnect(
				options.actions.realtime.onBrowserDisconnect,
				state.binding,
				reason,
			);
			connections.trackSettlement(settlement);
			return settlement;
		},

		/**
		 * Keep a settlement so a lifecycle method can wait for it.
		 * @param settlement The settlement.
		 */
		trackSettlement: (settlement) => {
			pendingSettlements.add(settlement);
			void settlement.then(
				() => {
					pendingSettlements.delete(settlement);
					return undefined;
				},
				() => {
					pendingSettlements.delete(settlement);
					return undefined;
				},
			);
		},

		/** Wait for every settlement, including those a settlement itself starts. */
		drainSettlements: async () => {
			// oxlint-disable-next-line no-await-in-loop -- a settled batch may have started more, so each round waits for the last
			while (pendingSettlements.size > 0) await Promise.allSettled(Array.from(pendingSettlements));
		},
	};

	/**
	 * Forget every terminal a connection was shown that the approval owner has
	 * since stopped presenting.
	 * @param candidates The terminals still being presented.
	 */
	function forgetStaleTerminals(candidates: readonly JsonRpcRequestId[]): void {
		const candidateSet = new Set(candidates);
		for (const state of states.values())
			for (const requestId of state.publishedTerminals)
				if (!candidateSet.has(requestId)) state.publishedTerminals.delete(requestId);
	}

	/**
	 * Whether a connection's pane shows a checkout's conversation now. A pane the server cannot
	 * place shows none, so it is shown no workhorse's approval.
	 * @param state The connection.
	 * @param checkout The checkout.
	 * @returns True when it is.
	 */
	function inCheckout(state: ConnectionState, checkout: string): boolean {
		try {
			return options.checkoutOf(state.browserId) === checkout;
		} catch {
			return false;
		}
	}

	/**
	 * The terminals every open connection they are shown to has been shown,
	 * which are the ones the approval owner may stop presenting. A terminal is
	 * shown only to its tab session, and a workhorse's only to the panes that show
	 * its checkout now, so a connection of another tab or another checkout never
	 * holds it back; with none of those open there is nobody left to show it to.
	 * @param candidates The terminals still being presented, with the panes they are shown to.
	 * @returns The terminals that may be acknowledged.
	 */
	function terminalsEverySessionBrowserHasSeen(
		candidates: readonly BrowserUnpresentedTerminal[],
	): readonly JsonRpcRequestId[] {
		const open = Array.from(states.values());
		return candidates
			.filter(({ requestId, tabSessionId, checkout }) =>
				open
					.filter(
						(state) =>
							state.tabSessionId === tabSessionId &&
							(checkout === null || inCheckout(state, checkout)),
					)
					.every((state) => !state.closed && state.publishedTerminals.has(requestId)),
			)
			.map(({ requestId }) => requestId);
	}

	/**
	 * What the projection owner is asked about one connection.
	 * @param state The connection.
	 * @returns The projection context.
	 */
	function projectionContext(state: ConnectionState): Parameters<BrowserProjectionPort["read"]>[0] {
		return {
			browserId: state.browserId,
			paneId: state.paneId,
			tabSessionId: state.tabSessionId,
			checkout: options.checkoutOf(state.browserId),
			connection: state.instance,
			binding: connections.readBinding(state),
			lease: owners.leaseForSnapshot(state),
			mediaReady: state.mediaReady,
		};
	}

	return connections;
}

/**
 * The thread link of one workhorse of a tab, refusing a binding that does not describe that
 * workhorse. The link port keys a link by the workhorse (its `paneId`).
 * @param options The gateway's owners.
 * @param tabSessionId The tab.
 * @param checkoutOf The checkout of the workhorse; what it throws is an invalid projection too.
 * @returns Its binding.
 */
function readWorkhorseBinding(
	options: Pick<CodexWorkbenchGatewayOptions, "threadLink">,
	tabSessionId: ConnectionState["tabSessionId"],
	checkoutOf: () => string,
): ReturnType<CodexWorkbenchGatewayOptions["threadLink"]["read"]> {
	try {
		const key = workhorseLinkKey(tabSessionId, checkoutOf());
		const binding = options.threadLink.read(key);
		if (binding.paneId !== key || !Number.isSafeInteger(binding.revision) || binding.revision < 0)
			throw new Error("the thread-link owner returned an invalid pane binding");
		return binding;
	} catch (error) {
		if (error instanceof CodexWorkbenchGatewayError) throw error;
		throw new CodexWorkbenchGatewayError(
			"invalid_projection",
			"The thread-link owner returned an invalid pane binding.",
			{ cause: error },
		);
	}
}

/**
 * Call one owner's disconnect hook, swallowing whatever it does: teardown is
 * best effort and one owner cannot stop another from settling.
 * @param callback The hook, when the owner has one.
 * @param context The authority it is being told about, when there is one.
 * @param reason Why the connection went.
 * @returns Resolves once the hook has settled.
 */
function invokeDisconnect(
	callback:
		| ((context: BrowserActionContext, reason: BrowserDisconnectReason) => Promise<void> | void)
		| undefined,
	context: BrowserActionContext | null,
	reason: BrowserDisconnectReason,
): Promise<void> {
	if (callback === undefined || context === null) return Promise.resolve();
	try {
		return Promise.resolve(callback(context, reason)).then(
			() => undefined,
			() => undefined,
		);
	} catch {
		return Promise.resolve();
	}
}

export { createBrowserConnections };
export type { BrowserConnections, ConnectionState };
