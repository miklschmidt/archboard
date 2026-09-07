import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import type { BrowserCommandId, IdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	createBrowserLeaseManager,
	type BrowserLeaseManager,
} from "@/server/codex-workbench/lib/lease";
import {
	CodexWorkbenchGatewayError,
	type BrowserConnectionInstance,
	type BrowserLeaseRecord,
	type CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import { currentLeaseOrThrow, sameWireValue } from "@/server/codex-workbench/lib/browser-command";
import type {
	BrowserConnections,
	ConnectionState,
} from "@/server/codex-workbench/lib/gateway-connections";

const LEASE_REASON_MEMORY_LIMIT = 128;

/** What the lease owner needs from the gateway around it. */
interface LeaseOwners {
	readonly options: CodexWorkbenchGatewayOptions;
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	readonly connections: BrowserConnections;
	/** Forget a command id whose lease has ended, so its result is not replayed. */
	readonly forgetCommand: (commandId: BrowserCommandId) => void;
	/** Refuse a claim the workbench's readiness cannot carry. */
	readonly ensureAccountReadiness: (snapshot: BrowserSnapshot) => void;
}

/** The one command lease at a time, and everything that ends it. */
interface LeaseOwner {
	readonly manager: BrowserLeaseManager;
	/** Why a command id stopped being the lease's, when the gateway remembers. */
	readonly reasonFor: (
		commandId: BrowserCommandId,
	) => CodexWorkbenchGatewayError["code"] | undefined;
	readonly rememberReason: (
		record: BrowserLeaseRecord,
		reason: CodexWorkbenchGatewayError["code"],
	) => void;
	readonly expireIfDue: () => void;
	readonly leaseForSnapshot: (state: ConnectionState) => BrowserCommandLease | null;
	readonly ensureLeaseBinding: (state: ConnectionState, record: BrowserLeaseRecord) => void;
	readonly claim: (
		browserId: string,
		paneId: string,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease;
	readonly renew: (
		browserId: string,
		lease: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease;
	readonly release: (
		browserId: string,
		paneId: string,
		commandId?: BrowserCommandId,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease | null;
	/** Take the lease back from one socket, because its connection has gone. */
	readonly releaseForSocket: (
		state: ConnectionState,
		reason: CodexWorkbenchGatewayError["code"],
	) => void;
}

/**
 * Refuse a renewal that does not name the lease's own browser, pane, child
 * epoch and socket.
 * @param browserId The browser asking.
 * @param lease What it says it holds.
 * @param record The lease that is actually active.
 * @param state Its connection.
 */
function ensureRenewable(
	browserId: string,
	lease: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
	record: BrowserLeaseRecord,
	state: ConnectionState,
): void {
	if (record.binding.browserId !== browserId)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The lease owner changed.", {
			commandId: lease.commandId,
		});
	if (
		lease.paneId !== record.lease.paneId ||
		lease.childId !== record.lease.childId ||
		lease.epoch !== record.lease.epoch
	)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The lease target changed.", {
			commandId: lease.commandId,
		});
	if (record.binding.connection !== state.instance)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The socket owner changed.", {
			commandId: lease.commandId,
		});
}

/**
 * Own the app-global command lease: who holds it, when it ends, and why a
 * command under an ended lease is refused.
 * @param owners What the gateway around it provides.
 * @returns The lease owner.
 */
function createLeaseOwner(owners: LeaseOwners): LeaseOwner {
	const { connections, now } = owners;
	const reasons = new Map<BrowserCommandId, CodexWorkbenchGatewayError["code"]>();

	/**
	 * Remember why a command id stopped being the lease's, so a later command
	 * under that id is refused by name rather than by "no lease".
	 * @param record The lease that ended.
	 * @param reason Why it ended.
	 */
	const rememberReason = (
		record: BrowserLeaseRecord,
		reason: CodexWorkbenchGatewayError["code"],
	): void => {
		owners.forgetCommand(record.lease.commandId);
		reasons.delete(record.lease.commandId);
		reasons.set(record.lease.commandId, reason);
		for (const state of connections.states.values())
			if (state.lease?.commandId === record.lease.commandId) state.lease = record.lease;
		while (reasons.size > LEASE_REASON_MEMORY_LIMIT) {
			const oldest = reasons.keys().next().value;
			if (oldest === undefined) break;
			reasons.delete(oldest);
		}
	};

	const manager = createBrowserLeaseManager({
		identity: owners.identity,
		now,
		...(owners.options.leaseLedger === undefined ? {} : { ledger: owners.options.leaseLedger }),
		/**
		 * A lease the manager finished on its own has expired.
		 * @param record The lease.
		 */
		onFinish: (record) => {
			rememberReason(record, "lease_expired");
		},
		onChange: connections.publishAll,
	});

	/** End the active lease once its deadline has passed. */
	const expireIfDue = (): void => {
		const current = manager.current();
		if (current === null || now() < current.lease.expiresAtMs) return;
		const expired = manager.invalidate(current.lease.childId, current.lease.epoch, "expired");
		if (expired !== null) rememberReason(expired, "lease_expired");
	};

	/**
	 * End one lease, if it is still the active one.
	 * @param record The lease.
	 * @param state Whether it expired or was released.
	 * @param reason Why, for the refusal a later command under its id gets.
	 */
	const finish = (
		record: BrowserLeaseRecord,
		state: "expired" | "released",
		reason: CodexWorkbenchGatewayError["code"],
	): void => {
		if (manager.current()?.lease.commandId !== record.lease.commandId) return;
		const result = manager.invalidate(record.lease.childId, record.lease.epoch, state);
		if (result !== null) rememberReason(result, reason);
	};

	/**
	 * Refuse a command whose pane link has changed since its lease was claimed,
	 * releasing that lease: the browser must claim a new one against the link
	 * that now stands.
	 * @param state The connection.
	 * @param record The lease it holds.
	 */
	const ensureLeaseBinding = (state: ConnectionState, record: BrowserLeaseRecord): void => {
		const binding = connections.readBinding(state.paneId);
		if (
			binding.revision === record.binding.linkRevision &&
			sameWireValue(binding.link, record.binding.link)
		) {
			return;
		}
		finish(record, "released", "link_changed");
		throw new CodexWorkbenchGatewayError(
			"link_changed",
			"The pane link changed during lease ownership.",
			{ commandId: record.lease.commandId },
		);
	};

	return {
		manager,
		/**
		 * Why a command id stopped being the lease's.
		 * @param commandId The command.
		 * @returns The reason, or undefined.
		 */
		reasonFor: (commandId) => reasons.get(commandId),
		rememberReason,
		expireIfDue,

		/**
		 * The lease a connection's snapshot reports: the active one when this
		 * connection holds it, and otherwise whatever this connection last held.
		 * @param state The connection.
		 * @returns The lease, or null.
		 */
		leaseForSnapshot: (state) => {
			expireIfDue();
			const current = manager.current();
			if (
				current?.binding.browserId === state.browserId &&
				current.binding.paneId === state.paneId &&
				current.binding.connection === state.instance
			)
				return current.lease;
			return state.lease;
		},

		ensureLeaseBinding,

		/**
		 * Take the command lease for one browser pane, releasing whoever held it.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @param instance The socket the caller believes it is.
		 * @returns The lease.
		 */
		claim: (browserId, paneId, instance) => {
			const state = connections.stateFor(browserId, paneId, instance);
			expireIfDue();
			owners.ensureAccountReadiness(connections.snapshotFor(state));
			const previous = manager.current();
			if (previous !== null) {
				const released = manager.release(
					previous.binding.browserId,
					previous.binding.paneId,
					previous.binding.connection,
					previous.lease.commandId,
				);
				if (released !== null) rememberReason(released, "lease_transferred");
			}
			const record = manager.claim(
				browserId,
				paneId,
				state.instance,
				connections.readBinding(paneId),
			);
			state.lease = record.lease;
			state.binding = record.binding;
			return record.lease;
		},

		/**
		 * Keep the command lease alive for the browser that holds it.
		 * @param browserId The browser.
		 * @param lease What it says it holds.
		 * @param instance The socket the caller believes it is.
		 * @returns The renewed lease.
		 */
		renew: (browserId, lease, instance) => {
			const state = connections.stateFor(browserId, lease.paneId, instance);
			expireIfDue();
			const record = currentLeaseOrThrow(manager, lease.commandId, reasons.get(lease.commandId));
			ensureRenewable(browserId, lease, record, state);
			ensureLeaseBinding(state, record);
			const renewed = manager.renew(browserId, state.instance, {
				...record.lease,
				...lease,
				state: "active",
				expiresAtMs: record.lease.expiresAtMs,
			});
			state.lease = renewed.lease;
			return renewed.lease;
		},

		/**
		 * Give the command lease back.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @param commandId The lease, when the caller names one.
		 * @param instance The socket the caller believes it is.
		 * @returns The released lease, or null when there was none to release.
		 */
		release: (browserId, paneId, commandId, instance) => {
			const state = connections.stateFor(browserId, paneId, instance);
			expireIfDue();
			const asked = commandId ?? state.lease?.commandId;
			const record = manager.release(browserId, paneId, state.instance, asked);
			if (record === null) {
				return null;
			}
			if (record.lease.state === "released") {
				state.lease = record.lease;
				rememberReason(record, "lease_released");
			}
			return record.lease;
		},

		/**
		 * Take the lease back from one socket, because its connection has gone.
		 * @param state The connection that went.
		 * @param reason Why, for the refusal a later command under its id gets.
		 */
		releaseForSocket: (state, reason) => {
			const current = manager.current();
			if (current?.binding.connection !== state.instance) {
				return;
			}
			const released = manager.release(
				state.browserId,
				state.paneId,
				state.instance,
				current.lease.commandId,
			);
			if (released !== null) rememberReason(released, reason);
		},
	};
}

export { createLeaseOwner };
export type { LeaseOwner };
