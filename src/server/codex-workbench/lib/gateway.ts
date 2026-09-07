import { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { ChildEpoch, ChildId, IdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	CodexWorkbenchGatewayError,
	type BrowserConnectionId,
	type BrowserConnectionInstance,
	type BrowserDisconnectReason,
	type BrowserGatewayMessage,
	type BrowserPublishedPayload,
	type BrowserUnsubscribe,
	type BrowserWorkbenchConnection,
	type CodexWorkbenchGateway,
	type CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import {
	assertOpaqueName,
	connectionKey,
	emit,
} from "@/server/codex-workbench/lib/browser-command";
import {
	createBrowserConnections,
	type BrowserConnections,
	type ConnectionState,
} from "@/server/codex-workbench/lib/gateway-connections";
import {
	createCommandExecutor,
	type CommandExecutor,
} from "@/server/codex-workbench/lib/gateway-execution";
import { createLeaseOwner, type LeaseOwner } from "@/server/codex-workbench/lib/gateway-leases";
import {
	BROWSER_SNAPSHOT_MAX_BYTES,
	assertBrowserSnapshotBudget,
} from "@/server/codex-workbench/lib/projection";

/**
 * A connection as it begins: no snapshot, no lease, and nothing published.
 * @param browserId The browser.
 * @param paneId The pane.
 * @param instance Its socket.
 * @returns The connection state.
 */
function freshConnectionState(
	browserId: BrowserConnectionId,
	paneId: string,
	instance: BrowserConnectionInstance,
): ConnectionState {
	return {
		browserId,
		paneId,
		instance,
		listeners: new Set(),
		publishedTerminals: new Set(),
		sequence: 0,
		lastSnapshot: null,
		operation: null,
		lease: null,
		binding: null,
		mediaReady: false,
		disconnectNotified: false,
		closed: false,
	};
}

/**
 * Subscribe the gateway to every source that can change what a browser should
 * be shown.
 * @param options The workbench owners.
 * @param publishAll Publishes to every connection.
 * @param onChildExit What to do when this workbench's Codex child exits.
 * @returns The unsubscribers, in subscription order.
 */
function subscribeToSources(
	options: CodexWorkbenchGatewayOptions,
	publishAll: () => void,
	onChildExit: (childId: ChildId, epoch: ChildEpoch) => Promise<void>,
): BrowserUnsubscribe[] {
	const changeSources = [
		options.projection.onChange,
		options.actions.dynamicApprovals.onChange,
		options.actions.ordinaryApprovals.onChange,
		options.lifecycle?.onChange,
	];
	const unsubscribers = changeSources.flatMap((onChange) =>
		onChange === undefined ? [] : [onChange(publishAll)],
	);
	const childExitSource = options.lifecycle?.onChildExit;
	if (childExitSource !== undefined) {
		unsubscribers.push(childExitSource(onChildExit));
	}
	return unsubscribers;
}

/**
 * The browser gateway: one command lease at a time, one snapshot per browser
 * connection, and the teardown that retires both.
 * @param options The workbench owners, identity and projection this gateway serves.
 * @returns The gateway.
 */
export function createCodexWorkbenchGateway(
	options: CodexWorkbenchGatewayOptions,
): CodexWorkbenchGateway {
	const identity: IdentityAuthorities = options.identity;
	const model = createCodexBrowserModel(identity);
	const now = options.now ?? Date.now;
	const snapshotMaxBytes = options.snapshotMaxBytes ?? BROWSER_SNAPSHOT_MAX_BYTES;
	assertBrowserSnapshotBudget(snapshotMaxBytes);
	let leases: LeaseOwner;
	let executor: CommandExecutor;

	const connections: BrowserConnections = createBrowserConnections({
		options,
		identity,
		model,
		snapshotMaxBytes,
		/**
		 * The lease this connection's snapshot reports.
		 * @param state The connection.
		 * @returns The lease, or null.
		 */
		leaseForSnapshot: (state) => leases.leaseForSnapshot(state),
		/**
		 * Forget the in-flight commands a retired connection owned.
		 * @param instance The socket that went.
		 */
		forgetInFlightFor: (instance) => {
			executor.forgetInFlightFor(instance);
		},
	});

	leases = createLeaseOwner({
		options,
		identity,
		now,
		connections,
		/**
		 * Forget a command id whose lease has ended.
		 * @param commandId The command.
		 */
		forgetCommand: (commandId) => {
			executor.forgetCommand(commandId);
		},
		/**
		 * Refuse a claim the workbench's readiness cannot carry.
		 * @param snapshot The snapshot the claim was checked against.
		 */
		ensureAccountReadiness: (snapshot) => {
			executor.ensureAccountReadiness(snapshot);
		},
	});

	executor = createCommandExecutor({
		options,
		model,
		now,
		connections,
		leases,
		/**
		 * Whether the gateway has been disposed.
		 * @returns True once it has.
		 */
		isDisposed: () => connections.disposed,
	});

	/**
	 * Open, or re-open, one browser's connection to one pane. A reconnection
	 * under the same socket is the same connection; a different socket replaces
	 * the one it finds, and that one's lease goes with it.
	 * @param browserId The browser.
	 * @param paneId The pane.
	 * @param providedInstance The socket, when the caller owns one.
	 * @returns The connection.
	 */
	const connect = (
		browserId: string,
		paneId: string,
		providedInstance?: BrowserConnectionInstance,
	): BrowserWorkbenchConnection => {
		requireConnectable(browserId, paneId);
		const key = connectionKey(browserId, paneId);
		const instance = providedInstance ?? Object.freeze({});
		const open = openConnection(key);
		if (open?.instance === instance) {
			return connectionFor(open);
		}
		if (open !== null) {
			retireForReplacement(open);
		}
		const state = freshConnectionState(browserId, paneId, instance);
		retainLeaseFor(state);
		connections.states.set(key, state);
		if (open !== null) void connections.notifyDisconnect(open, "browser_disconnected");
		return connectionFor(state);
	};

	/**
	 * Refuse a connection to a disposed gateway, or one named by anything but a
	 * short opaque identifier.
	 * @param browserId The browser.
	 * @param paneId The pane.
	 */
	const requireConnectable = (browserId: string, paneId: string): void => {
		if (connections.disposed)
			throw new CodexWorkbenchGatewayError("disposed", "The browser gateway is disposed.");
		assertOpaqueName(browserId, "browserId");
		assertOpaqueName(paneId, "paneId");
	};

	/**
	 * The connection under one key that is still open.
	 * @param key The connection key.
	 * @returns The connection, or null when there is none open.
	 */
	const openConnection = (key: string): ConnectionState | null => {
		const existing = connections.states.get(key);
		return existing !== undefined && !existing.closed ? existing : null;
	};

	/**
	 * Retire the connection a new socket replaces, taking its lease with it.
	 * @param open The connection being replaced.
	 */
	const retireForReplacement = (open: ConnectionState): void => {
		open.closed = true;
		open.listeners.clear();
		leases.releaseForSocket(open, "lease_transferred");
	};

	/**
	 * Give an arriving connection back the lease its own socket still holds, so
	 * a reconnection under the same socket resumes rather than losing it.
	 * @param state The arriving connection.
	 */
	const retainLeaseFor = (state: ConnectionState): void => {
		const retained = leases.manager.current();
		if (
			retained?.binding.browserId !== state.browserId ||
			retained.binding.paneId !== state.paneId ||
			retained.binding.connection !== state.instance
		) {
			return;
		}
		state.lease = retained.lease;
		state.binding = retained.binding;
	};

	/**
	 * Tell every connection that voice has gone, which is the last thing a
	 * closing gateway publishes.
	 * @param reason Why the gateway is closing.
	 */
	const announceVoiceUnavailable = (reason: BrowserDisconnectReason): void => {
		for (const state of connections.states.values()) {
			if (state.lastSnapshot === null) continue;
			state.sequence += 1;
			const voice = Object.freeze({
				...state.lastSnapshot.voice,
				state: "unavailable" as const,
				realtimeSessionId: null,
				reason:
					reason === "child_disconnected"
						? "The Codex child disconnected."
						: "The Codex workbench shut down.",
			});
			state.lastSnapshot = Object.freeze({ ...state.lastSnapshot, voice });
			emit(state.listeners, { kind: "delta", sequence: state.sequence, delta: { voice } });
		}
	};

	/**
	 * Close the gateway: tell every browser, end the lease, unsubscribe from
	 * every source and retire every connection.
	 * @param reason Why it is closing.
	 */
	const terminate = (reason: BrowserDisconnectReason): void => {
		if (connections.disposed) return;
		announceVoiceUnavailable(reason);
		connections.disposed = true;
		const current = leases.manager.current();
		if (current !== null) {
			const released = leases.manager.invalidate(
				current.lease.childId,
				current.lease.epoch,
				"released",
			);
			if (released !== null) leases.rememberReason(released, "lease_released");
		}
		leases.manager.dispose();
		for (const unsubscribe of sourceUnsubscribers.splice(0)) unsubscribe();
		for (const state of connections.states.values()) {
			void connections.notifyDisconnect(state, reason);
			state.closed = true;
			state.listeners.clear();
		}
		connections.states.clear();
		connections.acknowledgeReadyTerminals();
		executor.clearCaches();
	};

	/**
	 * Close one connection, releasing its lease and telling every owner.
	 * @param state The connection.
	 */
	const closeConnection = async (state: ConnectionState): Promise<void> => {
		if (connections.disposed || state.closed) {
			await connections.drainSettlements();
			return;
		}
		state.closed = true;
		state.listeners.clear();
		const key = connectionKey(state.browserId, state.paneId);
		if (connections.states.get(key) === state) connections.states.delete(key);
		connections.acknowledgeReadyTerminals();
		leases.releaseForSocket(state, "lease_released");
		void connections.notifyDisconnect(state, "browser_disconnected");
		await connections.drainSettlements();
	};

	/**
	 * Close one exact socket's connection, if it is still the one open.
	 * @param browserId The browser.
	 * @param paneId The pane.
	 * @param instance The socket.
	 */
	const closeConnectionInstance = async (
		browserId: string,
		paneId: string,
		instance: BrowserConnectionInstance,
	): Promise<void> => {
		const state = connections.disposed
			? undefined
			: connections.states.get(connectionKey(browserId, paneId));
		if (state === undefined || state.instance !== instance) {
			await connections.drainSettlements();
			return;
		}
		await closeConnection(state);
	};

	/**
	 * Close the gateway because this workbench's Codex child has gone.
	 * @param childId The child that exited.
	 * @param epoch Its epoch.
	 */
	const childExit = async (childId: ChildId, epoch: ChildEpoch): Promise<void> => {
		if (connections.disposed) {
			await connections.drainSettlements();
			return;
		}
		if (
			childId !== identity.identity.validator.childId ||
			epoch !== identity.identity.validator.epoch
		)
			return;
		terminate("child_disconnected");
		await connections.drainSettlements();
	};

	/** Close the gateway because the workbench is shutting down. */
	const dispose = async (): Promise<void> => {
		terminate("gateway_shutdown");
		await connections.drainSettlements();
	};

	/**
	 * Subscribe to one connection's messages.
	 * @param browserId The browser.
	 * @param paneId The pane.
	 * @param listener What to tell.
	 * @param instance The socket the caller believes it is.
	 * @returns Unsubscribes.
	 */
	const subscribe = (
		browserId: string,
		paneId: string,
		listener: (message: BrowserGatewayMessage) => void,
		instance?: BrowserConnectionInstance,
	): BrowserUnsubscribe => {
		const state = connections.stateFor(browserId, paneId, instance);
		state.listeners.add(listener);
		return () => state.listeners.delete(listener);
	};

	/**
	 * One connection's own surface, which re-resolves its connection on every
	 * call so a replaced socket cannot act through it.
	 * @param state The connection.
	 * @returns The surface.
	 */
	const connectionFor = (state: ConnectionState): BrowserWorkbenchConnection =>
		Object.freeze({
			browserId: state.browserId,
			paneId: state.paneId,
			instance: state.instance,
			/**
			 * What this connection should be showing now.
			 * @returns The snapshot message.
			 */
			snapshot: () =>
				connections.updateSnapshot(
					connections.stateFor(state.browserId, state.paneId, state.instance),
				),
			/**
			 * Ask every owner to re-read before the next snapshot.
			 * @returns Resolves once they have.
			 */
			refreshProjection: () =>
				connections.refreshProjection(
					connections.stateFor(state.browserId, state.paneId, state.instance),
				),
			/**
			 * Record what this connection has been shown.
			 * @param payload What it was shown.
			 */
			confirmPublished: (payload: BrowserPublishedPayload) => {
				connections.confirmPublished(state, payload);
			},
			/**
			 * Take the command lease.
			 * @returns The lease.
			 */
			claimLease: () => leases.claim(state.browserId, state.paneId, state.instance),
			/**
			 * Keep this connection's lease alive.
			 * @returns The renewed lease.
			 */
			renewLease: () => {
				connections.stateFor(state.browserId, state.paneId, state.instance);
				leases.expireIfDue();
				if (state.lease === null)
					throw new CodexWorkbenchGatewayError("lease_required", "No command lease is active.");
				return leases.renew(state.browserId, state.lease, state.instance);
			},
			/**
			 * Give this connection's lease back.
			 * @returns The released lease, or null.
			 */
			releaseLease: () => leases.release(state.browserId, state.paneId, undefined, state.instance),
			/**
			 * Record whether this connection can play media.
			 * @param ready Whether it can.
			 * @returns Its snapshot afterwards.
			 */
			setMediaReady: (ready: boolean) => connections.setMediaReady(state, ready),
			/**
			 * Re-read the account.
			 * @returns The account read result.
			 */
			accountRead: () => executor.accountRead(state.browserId, state.paneId, state.instance),
			/**
			 * Send one command.
			 * @param value The command as it arrived.
			 * @returns The command result.
			 */
			command: (value: unknown) =>
				executor.command(state.browserId, value, state.paneId, state.instance),
			/**
			 * Subscribe to this connection's messages.
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			subscribe: (listener: (message: BrowserGatewayMessage) => void) =>
				subscribe(state.browserId, state.paneId, listener, state.instance),
			/**
			 * Close this connection.
			 * @returns Resolves once every owner has settled.
			 */
			close: () => closeConnection(state),
		});

	const sourceUnsubscribers = subscribeToSources(options, connections.publishAll, childExit);

	return Object.freeze({
		connect,
		/**
		 * What one browser's pane should be showing now.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @returns The snapshot message.
		 */
		snapshot: (browserId: string, paneId: string) =>
			connections.updateSnapshot(connections.stateFor(browserId, paneId)),
		claimLease: leases.claim,
		renewLease: leases.renew,
		releaseLease: leases.release,
		/**
		 * Re-read the account for one browser pane.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @param instance The socket the caller believes it is.
		 * @returns The account read result.
		 */
		accountRead: (
			browserId: BrowserConnectionId,
			paneId: string,
			instance?: BrowserConnectionInstance,
		) => executor.accountRead(browserId, paneId, instance),
		/**
		 * Take one command from a browser.
		 * @param browserId The browser.
		 * @param value The command as it arrived.
		 * @param paneIdOverride The pane the caller knows, when it knows one.
		 * @param instance The socket the caller believes it is.
		 * @returns The command result.
		 */
		command: (
			browserId: BrowserConnectionId,
			value: unknown,
			paneIdOverride?: string,
			instance?: BrowserConnectionInstance,
		) => executor.command(browserId, value, paneIdOverride, instance),
		subscribe,
		closeConnection: closeConnectionInstance,
		childExit,
		dispose,
	});
}
