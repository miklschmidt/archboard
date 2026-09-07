import { CODEX_BROWSER_COMMAND_LEASE_MS } from "@/shared/timing/timing";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	BrowserCommandId,
} from "@/shared/codex-workbench-identity";
import type { BrowserCommandLease } from "@/shared/codex-browser-model";
import type { ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import type {
	BrowserConnectionId,
	BrowserConnectionInstance,
	BrowserLeaseLedger,
	BrowserLeaseRecord,
} from "@/server/codex-workbench/lib/contract";

const RETIRED_LEASE_LIMIT = 64;

/**
 * Freeze a value and everything reachable from it, so a retained record cannot drift.
 * @param value The value to freeze in place.
 * @returns The same value, frozen.
 */
function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
	}
	return value;
}

interface BrowserLeaseManager {
	readonly current: () => BrowserLeaseRecord | null;
	readonly find: (commandId: BrowserCommandId) => BrowserLeaseRecord | null;
	readonly claim: (
		browserId: BrowserConnectionId,
		paneId: string,
		connection: BrowserConnectionInstance,
		binding: ThreadLinkBindingSnapshot,
	) => BrowserLeaseRecord;
	readonly renew: (
		browserId: BrowserConnectionId,
		connection: BrowserConnectionInstance,
		lease: BrowserCommandLease,
	) => BrowserLeaseRecord;
	readonly release: (
		browserId: BrowserConnectionId,
		paneId: string,
		connection: BrowserConnectionInstance,
		commandId?: BrowserCommandId,
	) => BrowserLeaseRecord | null;
	readonly invalidate: (
		childId: ChildId,
		epoch: ChildEpoch,
		state?: "expired" | "released",
	) => BrowserLeaseRecord | null;
	readonly dispose: () => void;
	/** Detach generation callbacks and timers without invalidating the active lease. */
	readonly detach: () => void;
}

/**
 * An empty process-lifetime ledger for a lease manager to own.
 * @returns A ledger with no active lease and no retired records.
 */
function createBrowserLeaseLedger(): BrowserLeaseLedger {
	return { active: null, retired: new Map() };
}

/**
 * Copy a lease record into an immutable form, with the captured link cloned
 * so later owner mutations never reach it.
 * @param record The record to retain.
 * @returns A frozen copy.
 */
function freezeRecord(record: BrowserLeaseRecord): BrowserLeaseRecord {
	const capturedLink = deepFreeze(structuredClone(record.capturedLink));
	return Object.freeze({
		lease: Object.freeze({ ...record.lease }),
		binding: Object.freeze({ ...record.binding, link: capturedLink.link }),
		capturedLink,
	});
}

/**
 * Whether two leases name the same command, pane and child generation.
 * @param left One lease.
 * @param right The other lease.
 * @returns True when every identifying field matches.
 */
function sameLeaseTarget(left: BrowserCommandLease, right: BrowserCommandLease): boolean {
	return (
		left.commandId === right.commandId &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

/**
 * Refuse a clock reading the lease arithmetic cannot trust.
 * @param value The clock reading in milliseconds.
 * @returns The same reading.
 */
function assertTime(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error("the gateway clock returned invalid time");
	}
	return value;
}

/**
 * Whether a lease record is bound to exactly this browser, pane and socket.
 * @param record The active lease record.
 * @param browserId The browser asking.
 * @param paneId The pane asking.
 * @param connection The exact socket asking.
 * @returns True when the record's binding matches all three.
 */
function boundTo(
	record: BrowserLeaseRecord,
	browserId: BrowserConnectionId,
	paneId: string,
	connection: BrowserConnectionInstance,
): boolean {
	return (
		record.binding.browserId === browserId &&
		record.binding.paneId === paneId &&
		record.binding.connection === connection
	);
}

/**
 * The single app-global command lease: who holds it, when it expires, and the
 * bounded history of leases that ended, so a late command can learn why.
 * @param options The identity authorities, clock, optional retained ledger and change hooks.
 * @param options.identity Mints command ids and names the current child generation.
 * @param options.now The gateway clock.
 * @param options.ledger A ledger retained from a previous generation, when one exists.
 * @param options.onChange Called after every lease change.
 * @param options.onFinish Called with the record when the active lease expires on its own.
 * @returns The lease manager.
 */
function createBrowserLeaseManager(options: {
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	readonly ledger?: BrowserLeaseLedger;
	readonly onChange?: () => void;
	readonly onFinish?: (record: BrowserLeaseRecord) => void;
}): BrowserLeaseManager {
	const ledger = options.ledger ?? createBrowserLeaseLedger();
	let active: BrowserLeaseRecord | null = ledger.active;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	const retired = ledger.retired;
	/**
	 * Replace the active record in memory and in the ledger together.
	 * @param record The new active record, or null.
	 */
	const setActive = (record: BrowserLeaseRecord | null): void => {
		active = record;
		ledger.active = record;
	};

	/** Tell the owner a lease changed. */
	const notify = (): void => {
		options.onChange?.();
	};

	/**
	 * Retain a finished record, evicting the oldest once the history is full.
	 * @param record The finished record.
	 */
	const remember = (record: BrowserLeaseRecord): void => {
		retired.delete(record.lease.commandId);
		retired.set(record.lease.commandId, record);
		while (retired.size > RETIRED_LEASE_LIMIT) {
			const oldest = retired.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			retired.delete(oldest);
		}
	};

	/** Cancel the pending expiry timer, if any. */
	const clearTimer = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = undefined;
	};

	/**
	 * End a lease, retire its record and tell the owner.
	 * @param record The record to end.
	 * @param state Whether it expired or was released.
	 * @returns The terminal record.
	 */
	const finish = (
		record: BrowserLeaseRecord,
		state: "expired" | "released",
	): BrowserLeaseRecord => {
		const terminal = freezeRecord({
			...record,
			lease: { ...record.lease, state },
		});
		if (active?.lease.commandId === record.lease.commandId) {
			setActive(null);
		}
		remember(terminal);
		clearTimer();
		if (state === "expired") {
			options.onFinish?.(terminal);
		}
		notify();
		return terminal;
	};

	/**
	 * Expire the named lease when its time has come, or reschedule when the timer fired early.
	 * @param commandId The lease the timer was set for.
	 */
	const expireWhenDue = (commandId: BrowserCommandId): void => {
		if (disposed || active?.lease.commandId !== commandId) {
			return;
		}
		if (assertTime(options.now()) < active.lease.expiresAtMs) {
			schedule(active);
			return;
		}
		finish(active, "expired");
	};

	/**
	 * Arm the expiry timer for a record, replacing any earlier timer.
	 * @param record The active record.
	 */
	const schedule = (record: BrowserLeaseRecord): void => {
		clearTimer();
		const delay = Math.max(0, record.lease.expiresAtMs - assertTime(options.now()));
		timer = setTimeout(() => expireWhenDue(record.lease.commandId), delay + 1);
		timer.unref();
	};

	/**
	 * Find the record for a command id, expiring the active lease first when it is overdue.
	 * @param commandId The command id to find.
	 * @returns The active or retired record.
	 */
	const requireActive = (commandId: BrowserCommandId): BrowserLeaseRecord => {
		if (active?.lease.commandId === commandId) {
			if (assertTime(options.now()) >= active.lease.expiresAtMs) {
				return finish(active, "expired");
			}
			return active;
		}
		const historical = retired.get(commandId);
		if (historical !== undefined) {
			return historical;
		}
		throw new Error("the browser command lease is unknown");
	};

	/**
	 * Take the lease for a browser pane, ending whatever lease was active.
	 * @param browserId The claiming browser.
	 * @param paneId The claiming pane.
	 * @param connection The exact socket claiming.
	 * @param capturedLink The pane's thread-link binding at claim time.
	 * @returns The new active record.
	 */
	const claim = (
		browserId: BrowserConnectionId,
		paneId: string,
		connection: BrowserConnectionInstance,
		capturedLink: ThreadLinkBindingSnapshot,
	): BrowserLeaseRecord => {
		if (disposed) {
			throw new Error("the browser gateway is disposed");
		}
		if (active !== null) {
			if (assertTime(options.now()) >= active.lease.expiresAtMs) {
				finish(active, "expired");
			} else {
				finish(active, "released");
			}
		}
		const commandId = options.identity.identity.issuer.mintBrowserCommandId();
		const childId = options.identity.identity.validator.childId;
		const epoch = options.identity.identity.validator.epoch;
		const expiresAtMs = assertTime(options.now()) + CODEX_BROWSER_COMMAND_LEASE_MS;
		const record = freezeRecord({
			lease: {
				kind: "command_lease",
				commandId,
				paneId,
				childId,
				epoch,
				state: "active",
				expiresAtMs,
			},
			binding: {
				browserId,
				connection,
				paneId,
				commandId,
				childId,
				epoch,
				link: capturedLink.link,
				linkRevision: capturedLink.revision,
			},
			capturedLink,
		});
		setActive(record);
		schedule(record);
		notify();
		return record;
	};

	/**
	 * Extend the active lease for its holder.
	 * @param browserId The renewing browser.
	 * @param connection The exact socket renewing.
	 * @param lease The lease as the holder knows it.
	 * @returns The renewed record, or the terminal record when the lease already ended.
	 */
	const renew = (
		browserId: BrowserConnectionId,
		connection: BrowserConnectionInstance,
		lease: BrowserCommandLease,
	): BrowserLeaseRecord => {
		if (disposed) {
			throw new Error("the browser gateway is disposed");
		}
		const record = requireActive(lease.commandId);
		if (record.lease.state !== "active") {
			return record;
		}
		if (
			record.binding.browserId !== browserId ||
			record.binding.connection !== connection ||
			!sameLeaseTarget(record.lease, lease)
		) {
			throw new Error("the browser command lease belongs to another browser or pane");
		}
		const expiresAtMs = assertTime(options.now()) + CODEX_BROWSER_COMMAND_LEASE_MS;
		const renewed = freezeRecord({ ...record, lease: { ...record.lease, expiresAtMs } });
		setActive(renewed);
		schedule(renewed);
		notify();
		return renewed;
	};

	/**
	 * The retired record for a command id, when one was asked for and exists.
	 * @param commandId The command id, if the caller named one.
	 * @returns The retired record, or null.
	 */
	const retiredRecord = (commandId: BrowserCommandId | undefined): BrowserLeaseRecord | null =>
		commandId === undefined ? null : (retired.get(commandId) ?? null);

	/**
	 * Give up the active lease when the caller holds it; otherwise answer with
	 * the history of the lease the caller named.
	 * @param browserId The releasing browser.
	 * @param paneId The releasing pane.
	 * @param connection The exact socket releasing.
	 * @param commandId The lease the caller believes it holds, if named.
	 * @returns The released or retired record, or null when there is nothing to report.
	 */
	const release = (
		browserId: BrowserConnectionId,
		paneId: string,
		connection: BrowserConnectionInstance,
		commandId?: BrowserCommandId,
	): BrowserLeaseRecord | null => {
		if (active === null) {
			return retiredRecord(commandId);
		}
		if (assertTime(options.now()) >= active.lease.expiresAtMs) {
			return finish(active, "expired");
		}
		if (!boundTo(active, browserId, paneId, connection)) {
			return retiredRecord(commandId);
		}
		if (commandId !== undefined && active.lease.commandId !== commandId) {
			return retiredRecord(commandId);
		}
		return finish(active, "released");
	};

	/**
	 * End the active lease when it belongs to the named child generation.
	 * @param childId The child whose lease ends.
	 * @param epoch The child epoch whose lease ends.
	 * @param state Whether it expired or was released.
	 * @returns The terminal record, or null when no matching lease was active.
	 */
	const invalidate = (
		childId: ChildId,
		epoch: ChildEpoch,
		state: "expired" | "released" = "released",
	): BrowserLeaseRecord | null => {
		if (active === null || active.lease.childId !== childId || active.lease.epoch !== epoch) {
			return null;
		}
		return finish(active, state);
	};

	/** Release the active lease, drop the history and stop the timer for good. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		clearTimer();
		if (active !== null) {
			finish(active, "released");
		}
		retired.clear();
	};
	/** Stop the timer and refuse further changes, leaving the ledger for the next generation. */
	const detach = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		clearTimer();
	};
	if (active !== null) {
		schedule(active);
	}

	return Object.freeze({
		/**
		 * The active lease record, if any.
		 * @returns The active record, or null.
		 */
		current: () => active,
		/**
		 * Look a command id up in the active lease and the retired history.
		 * @param commandId The command id to find.
		 * @returns The matching record, or null.
		 */
		find: (commandId: BrowserCommandId) =>
			active?.lease.commandId === commandId ? active : (retired.get(commandId) ?? null),
		claim,
		renew,
		release,
		invalidate,
		dispose,
		detach,
	});
}

export { type BrowserLeaseManager, createBrowserLeaseLedger, createBrowserLeaseManager };
