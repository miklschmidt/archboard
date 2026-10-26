import type { BrowserCommandLease, BrowserSnapshot } from "#shared/schemas/browser/snapshot.ts";
import type { BrowserCommandId, IdentityAuthorities } from "@archboard/codex-app-server/identity";
import {
	createBrowserLeaseManager,
	sessionLeaseLedger,
	type BrowserLeaseManager,
} from "#server/services/lease/lease.ts";
import {
	CodexWorkbenchGatewayError,
	type BrowserConnectionInstance,
	type BrowserLeaseRecord,
	type BrowserSessionLeaseLedger,
	type CodexWorkbenchGatewayOptions,
} from "#server/protocol/gateway/contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { currentLeaseOrThrow, sameWireValue } from "#server/operations/command/browser-command.ts";
import type {
	BrowserConnections,
	ConnectionState,
} from "#server/services/gateway/gateway-connections.ts";

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

/** One tab session's command lease, and everything that ends it. */
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
	/**
	 * Refuse, as link_changed, once the link of the workhorse a lease was claimed for has moved,
	 * whichever checkout the tab shows now: a command that ran there still knows its outcome.
	 */
	readonly ensureLinkStands: (state: ConnectionState, record: BrowserLeaseRecord) => void;
	readonly claim: (
		browserId: string,
		chatId: string,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease;
	readonly renew: (
		browserId: string,
		lease: Pick<BrowserCommandLease, "commandId" | "chatId" | "childId" | "epoch">,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease;
	readonly release: (
		browserId: string,
		chatId: string,
		commandId?: BrowserCommandId,
		instance?: BrowserConnectionInstance,
	) => BrowserCommandLease | null;
	/** Take the lease back from one socket, because its connection has gone. */
	readonly releaseForSocket: (
		state: ConnectionState,
		reason: CodexWorkbenchGatewayError["code"],
	) => void;
	/** Release the lease for good, because the gateway is closing. */
	readonly end: () => void;
}

/**
 * Refuse a renewal that does not name the lease's own browser, chat, child
 * epoch and socket.
 * @param browserId The browser asking.
 * @param lease What it says it holds.
 * @param record The lease that is actually active.
 * @param state Its connection.
 */
function ensureRenewable(
	browserId: string,
	lease: Pick<BrowserCommandLease, "commandId" | "chatId" | "childId" | "epoch">,
	record: BrowserLeaseRecord,
	state: ConnectionState,
): void {
	if (record.binding.browserId !== browserId)
		throw new CodexWorkbenchGatewayError("lease_transferred", "The lease owner changed.", {
			commandId: lease.commandId,
		});
	if (
		lease.chatId !== record.lease.chatId ||
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

/** Every tab session's lease: one each, so a claim in one tab never ends another tab's. */
interface SessionLeases {
	/** The lease owner of one tab session, made the first time the session is asked about. */
	readonly of: (tabSessionId: TabSessionId) => LeaseOwner;
	/** Whether a command id is any tab session's active lease. */
	readonly isActive: (commandId: BrowserCommandId) => boolean;
	/** Every tab session's lease owner. */
	readonly all: () => readonly LeaseOwner[];
	/** End a tab session's lease and forget it, owner and retained ledger alike. */
	readonly end: (tabSessionId: TabSessionId) => void;
}

/**
 * Own one lease per tab session. A session the retained ledger already holds gets its
 * owner at once, so a lease that outlived its generation still expires on time.
 * @param owners What the gateway around it provides.
 * @returns The session leases.
 */
function createSessionLeases(owners: LeaseOwners): SessionLeases {
	const bySession = new Map<TabSessionId, LeaseOwner>();
	const ledger = owners.options.leaseLedger;
	/**
	 * The lease owner of one tab session.
	 * @param tabSessionId The tab session.
	 * @returns Its owner.
	 */
	const of = (tabSessionId: TabSessionId): LeaseOwner => {
		let owner = bySession.get(tabSessionId);
		if (owner === undefined) {
			owner = createLeaseOwner(
				owners,
				ledger === undefined ? undefined : sessionLeaseLedger(ledger, tabSessionId),
			);
			bySession.set(tabSessionId, owner);
		}
		return owner;
	};
	for (const tabSessionId of ledger?.sessions.keys() ?? []) of(tabSessionId);
	return {
		of,
		/**
		 * Whether a command id is any tab session's active lease.
		 * @param commandId The command.
		 * @returns True while some session's lease is that command.
		 */
		isActive: (commandId) =>
			[...bySession.values()].some(
				(owner) => owner.manager.current()?.lease.commandId === commandId,
			),
		/**
		 * Every tab session's lease owner.
		 * @returns The owners.
		 */
		all: () => [...bySession.values()],
		/**
		 * End a tab session's lease and forget everything kept about it, so a session that ended
		 * leaves nothing behind; a tab that comes back under the same id starts afresh.
		 * @param tabSessionId The tab session.
		 */
		end: (tabSessionId) => {
			bySession.get(tabSessionId)?.end();
			bySession.delete(tabSessionId);
			ledger?.sessions.delete(tabSessionId);
		},
	};
}

/**
 * Own one tab session's command lease: who holds it, when it ends, and why a
 * command under an ended lease is refused.
 * @param owners What the gateway around it provides.
 * @param ledger The session's retained ledger, when the gateway keeps one.
 * @returns The lease owner.
 */
function createLeaseOwner(owners: LeaseOwners, ledger?: BrowserSessionLeaseLedger): LeaseOwner {
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
		...(ledger === undefined ? {} : { ledger }),
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
	 * Whether the link of the workhorse a lease was claimed for still stands.
	 * @param state The connection.
	 * @param record The lease it holds.
	 * @returns True while that workhorse's link is the one the lease was claimed against.
	 */
	const linkStands = (state: ConnectionState, record: BrowserLeaseRecord): boolean => {
		const binding = connections.readBindingIn(state, record.binding.checkout);
		return (
			binding.revision === record.binding.linkRevision &&
			sameWireValue(binding.link, record.binding.link)
		);
	};

	/**
	 * Release a lease whose link changed, and refuse what was asked under it.
	 * @param record The lease.
	 * @throws {CodexWorkbenchGatewayError} Always, as link_changed.
	 */
	const refuseChangedLink = (record: BrowserLeaseRecord): never => {
		finish(record, "released", "link_changed");
		throw new CodexWorkbenchGatewayError(
			"link_changed",
			"The thread link changed during lease ownership.",
			{ commandId: record.lease.commandId },
		);
	};

	/**
	 * Refuse a command whose thread link has changed since its lease was claimed, or whose tab
	 * shows another checkout's conversation now, releasing that lease: the browser must claim a
	 * new one against the link that now stands.
	 * @param state The connection.
	 * @param record The lease it holds.
	 */
	const ensureLeaseBinding = (state: ConnectionState, record: BrowserLeaseRecord): void => {
		if (
			owners.options.checkoutOf(state.browserId) !== record.binding.checkout ||
			!linkStands(state, record)
		) {
			refuseChangedLink(record);
		}
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
				current.binding.chatId === state.chatId &&
				current.binding.connection === state.instance
			)
				return current.lease;
			return state.lease;
		},

		ensureLeaseBinding,

		/**
		 * Refuse once the link of the workhorse a lease was claimed for has moved.
		 * @param state The connection.
		 * @param record The lease it holds.
		 */
		ensureLinkStands: (state, record) => {
			if (!linkStands(state, record)) {
				refuseChangedLink(record);
			}
		},

		/**
		 * Take the command lease for one chat, releasing whoever in its tab
		 * session held it.
		 * @param browserId The browser.
		 * @param chatId The chat.
		 * @param instance The socket the caller believes it is.
		 * @returns The lease.
		 */
		claim: (browserId, chatId, instance) => {
			const state = connections.stateFor(browserId, chatId, instance);
			expireIfDue();
			owners.ensureAccountReadiness(connections.snapshotFor(state));
			const previous = manager.current();
			if (previous !== null) {
				const released = manager.release(
					previous.binding.browserId,
					previous.binding.chatId,
					previous.binding.connection,
					previous.lease.commandId,
				);
				if (released !== null) rememberReason(released, "lease_transferred");
			}
			const record = manager.claim(
				browserId,
				chatId,
				state.tabSessionId,
				owners.options.checkoutOf(state.browserId),
				state.instance,
				connections.readBinding(state),
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
			const state = connections.stateFor(browserId, lease.chatId, instance);
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
		 * @param chatId The chat.
		 * @param commandId The lease, when the caller names one.
		 * @param instance The socket the caller believes it is.
		 * @returns The released lease, or null when there was none to release.
		 */
		release: (browserId, chatId, commandId, instance) => {
			const state = connections.stateFor(browserId, chatId, instance);
			expireIfDue();
			const asked = commandId ?? state.lease?.commandId;
			const record = manager.release(browserId, chatId, state.instance, asked);
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
				state.chatId,
				state.instance,
				current.lease.commandId,
			);
			if (released !== null) rememberReason(released, reason);
		},

		/** Release the lease for good, because the gateway is closing. */
		end: () => {
			const current = manager.current();
			if (current !== null) {
				const released = manager.invalidate(current.lease.childId, current.lease.epoch, "released");
				if (released !== null) rememberReason(released, "lease_released");
			}
			manager.dispose();
		},
	};
}

export { createSessionLeases };
export type { LeaseOwner, SessionLeases };
