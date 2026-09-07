import type { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type {
	BrowserCommandLease,
	BrowserOperationOutcome,
	BrowserSnapshot,
} from "@/shared/codex-browser-model";
import type { IdentityAuthorities, JsonRpcRequestId } from "@/shared/codex-workbench-identity";
import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserConnectionId,
	type BrowserConnectionInstance,
	type BrowserDisconnectReason,
	type BrowserGatewayMessage,
	type BrowserGatewaySnapshotMessage,
	type BrowserPresenterContext,
	type BrowserProjectionPort,
	type BrowserPublishedPayload,
	type CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import type { BrowserOwnerProjection } from "@/server/codex-workbench/lib/projection-contract";
import {
	assertBrowserSnapshotBounded,
	diffBrowserSnapshots,
	fitBrowserSnapshotBounded,
	projectCodexBrowserState,
} from "@/server/codex-workbench/lib/projection";
import {
	connectionKey,
	emit,
	isOversizedDelta,
	publishedTerminalIds,
	sameWireValue,
} from "@/server/codex-workbench/lib/browser-command";

/** One browser's connection to one pane, and everything this process holds about it. */
interface ConnectionState {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
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
		paneId: string,
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
	const { options, identity, model, snapshotMaxBytes } = owners;
	const states = new Map<string, ConnectionState>();
	const pendingSettlements = new Set<Promise<void>>();
	let publishing = false;
	let publishQueued = false;

	const connections: BrowserConnections = {
		states,
		disposed: false,

		/**
		 * The pane binding the thread-link owner reports, refusing one that does
		 * not describe the pane that was asked about.
		 * @param paneId The pane.
		 * @returns Its binding.
		 */
		readBinding: (paneId) => {
			try {
				const binding = options.threadLink.read(paneId);
				if (
					binding.paneId !== paneId ||
					!Number.isSafeInteger(binding.revision) ||
					binding.revision < 0
				)
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
		},

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
			const binding = connections.readBinding(state.paneId);
			const lease = owners.leaseForSnapshot(state);
			let projection: BrowserOwnerProjection;
			try {
				projection = options.projection.read({
					browserId: state.browserId,
					paneId: state.paneId,
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
				const result = projectCodexBrowserState(model, identity.identity.decoder, {
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
				} while (publishQueued);
				connections.acknowledgeReadyTerminals();
			} finally {
				publishing = false;
			}
		},

		/**
		 * Let the approval owner stop presenting every terminal approval that has
		 * reached every open browser.
		 */
		acknowledgeReadyTerminals: () => {
			const candidates = options.actions.ordinaryApprovals.unpresentedTerminals();
			forgetStaleTerminals(candidates);
			const requestIds = terminalsEveryBrowserHasSeen(candidates);
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
		 * Tell every owner that one browser connection has gone, once.
		 *
		 * Approval teardown is best effort: both owners get a chance to settle,
		 * and the gateway's lifecycle methods resolve only after every settlement
		 * promise has finished.
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
			const presenterContext = presenterContextFor(state);
			const settlement = Promise.allSettled([
				// Ordinary approvals capture the still-current exact pane binding before
				// thread-link teardown clears that controller token.
				hasOtherPresenter(state, presenterContext)
					? Promise.resolve()
					: invokeDisconnect(
							options.actions.ordinaryApprovals.onBrowserDisconnect,
							presenterContext,
							reason,
						),
				invokeDisconnect(options.actions.threadLinks.onBrowserDisconnect, state.binding, reason),
				invokeDisconnect(options.actions.realtime.onBrowserDisconnect, state.binding, reason),
				invokeDisconnect(
					options.actions.dynamicApprovals.onBrowserDisconnect,
					state.binding,
					reason,
				),
			]).then(() => undefined);
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
	 * The terminals every open connection has been shown, which are the ones
	 * the approval owner may stop presenting. With nothing connected there is
	 * nobody left to show them to.
	 * @param candidates The terminals still being presented.
	 * @returns The terminals that may be acknowledged.
	 */
	function terminalsEveryBrowserHasSeen(
		candidates: readonly JsonRpcRequestId[],
	): readonly JsonRpcRequestId[] {
		if (states.size === 0) {
			return candidates;
		}
		const open = Array.from(states.values());
		return candidates.filter((requestId) =>
			open.every((state) => !state.closed && state.publishedTerminals.has(requestId)),
		);
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
			connection: state.instance,
			binding: connections.readBinding(state.paneId),
			lease: owners.leaseForSnapshot(state),
			mediaReady: state.mediaReady,
		};
	}

	/**
	 * The approval-presenting authority a departing connection held, when its
	 * pane still has an executable link naming a child.
	 * @param state The departing connection.
	 * @returns The presenter context, or null when the pane owns no cleanup.
	 */
	function presenterContextFor(state: ConnectionState): BrowserPresenterContext | null {
		try {
			const binding = connections.readBinding(state.paneId);
			const link = binding.link;
			if (link.state !== "executable" || link.childId === null || link.epoch === null) {
				return null;
			}
			return {
				browserId: state.browserId,
				connection: state.instance,
				paneId: state.paneId,
				childId: link.childId,
				epoch: link.epoch,
				link,
				linkRevision: binding.revision,
			};
		} catch {
			// A pane binding that is already gone owns no approval cleanup.
			return null;
		}
	}

	/**
	 * Whether another open connection still presents the departing one's pane
	 * under the same link, in which case that pane's approvals stay presented.
	 * @param state The departing connection.
	 * @param presenterContext The authority it held, when it held one.
	 * @returns True when somebody else still presents that pane.
	 */
	function hasOtherPresenter(
		state: ConnectionState,
		presenterContext: BrowserPresenterContext | null,
	): boolean {
		if (presenterContext === null) {
			return false;
		}
		return Array.from(states.values()).some((candidate) => {
			if (candidate === state || candidate.closed || candidate.paneId !== state.paneId) {
				return false;
			}
			try {
				const binding = connections.readBinding(candidate.paneId);
				return (
					binding.revision === presenterContext.linkRevision &&
					sameWireValue(binding.link, presenterContext.link)
				);
			} catch {
				return false;
			}
		});
	}

	return connections;
}

/**
 * Call one owner's disconnect hook, swallowing whatever it does: teardown is
 * best effort and one owner cannot stop another from settling.
 * @param callback The hook, when the owner has one.
 * @param context The authority it is being told about, when there is one.
 * @param reason Why the connection went.
 * @returns Resolves once the hook has settled.
 */
function invokeDisconnect<Context extends BrowserActionContext | BrowserPresenterContext>(
	callback:
		| ((context: Context, reason: BrowserDisconnectReason) => Promise<void> | void)
		| undefined,
	context: Context | null,
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
