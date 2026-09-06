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
 *
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
 *
 */
function createBrowserLeaseLedger(): BrowserLeaseLedger {
	return { active: null, retired: new Map() };
}

/**
 *
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
 *
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
 *
 */
function assertTime(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error("the gateway clock returned invalid time");
	}
	return value;
}

/**
 *
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
	 *
	 */
	const setActive = (record: BrowserLeaseRecord | null): void => {
		active = record;
		ledger.active = record;
	};

	/**
	 *
	 */
	const notify = (): void => {
		options.onChange?.();
	};

	/**
	 *
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

	/**
	 *
	 */
	const clearTimer = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = undefined;
	};

	/**
	 *
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
	 *
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
	 *
	 */
	const schedule = (record: BrowserLeaseRecord): void => {
		clearTimer();
		const delay = Math.max(0, record.lease.expiresAtMs - assertTime(options.now()));
		timer = setTimeout(() => expireWhenDue(record.lease.commandId), delay + 1);
		timer.unref?.();
	};

	/**
	 *
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
	 *
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
	 *
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
	 *
	 */
	const release = (
		browserId: BrowserConnectionId,
		paneId: string,
		connection: BrowserConnectionInstance,
		commandId?: BrowserCommandId,
	): BrowserLeaseRecord | null => {
		if (active === null) {
			return commandId === undefined ? null : (retired.get(commandId) ?? null);
		}
		if (assertTime(options.now()) >= active.lease.expiresAtMs) {
			return finish(active, "expired");
		}
		if (
			active.binding.browserId !== browserId ||
			active.binding.paneId !== paneId ||
			active.binding.connection !== connection
		) {
			return commandId === undefined ? null : (retired.get(commandId) ?? null);
		}
		if (commandId !== undefined && active.lease.commandId !== commandId) {
			return retired.get(commandId) ?? null;
		}
		return finish(active, "released");
	};

	/**
	 *
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

	/**
	 *
	 */
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
	/**
	 *
	 */
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
		 *
		 */
		current: () => active,
		/**
		 *
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
