// The transport's one state owner: the current run, the lease, the published
// state and the listeners. Every other transport file reads and writes the
// workbench through these functions, so there is exactly one place a state
// change, a retirement or an incompatibility is decided.

import { SOCKET_RECONNECT_MS } from "@/shared/timing/timing";
import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransportOptions,
} from "@/ui/workbench-transport/contract";
import { type CapabilityContext } from "@/ui/workbench-transport/lib/capabilities";
import {
	messageOf,
	rejectPending,
	socketOpen,
	transportFailure,
	type SocketRun,
} from "@/ui/workbench-transport/lib/socket-run";
import type { StreamHost } from "@/ui/workbench-transport/lib/stream";
import { sameCapturedLink } from "@/ui/workbench-transport/lib/targeting";

/** Where an intent was captured, and the revision it is valid for. */
interface CapturedIntent {
	readonly run: SocketRun;
	readonly revision: number;
}

/** Why a run's pending answers are lost. */
type RetireCode = "response_lost" | "replaced" | "socket_unavailable";

/** The transport's mutable state, owned by one transport instance. */
interface TransportCore {
	readonly now: () => number;
	readonly requestId: (() => string) | undefined;
	activeRun: SocketRun | null;
	currentLease: BrowserCommandLease | null;
	ownerState: BrowserWorkbenchState;
	disposed: boolean;
	commandTail: Promise<void>;
	preparingCommand: boolean;
	readonly capturedIntents: WeakMap<BrowserWorkbenchCommandIntent, CapturedIntent>;
	readonly listeners: Set<() => void>;
}

/**
 * A stopped state.
 * @param reason Why nothing is attached.
 * @returns The frozen state.
 */
function stoppedState(reason: string): BrowserWorkbenchState {
	return Object.freeze({
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	});
}

/**
 * A fresh core with nothing attached.
 * @param options Clock and request-id sources.
 * @returns The core.
 */
function createTransportCore(options: BrowserWorkbenchTransportOptions): TransportCore {
	return {
		now: options.now ?? Date.now,
		requestId: options.requestId,
		activeRun: null,
		currentLease: null,
		ownerState: stoppedState("No Codex workbench socket is attached."),
		disposed: false,
		commandTail: Promise.resolve(),
		preparingCommand: false,
		capturedIntents: new WeakMap(),
		listeners: new Set(),
	};
}

/**
 * Tell every subscriber; a subscriber cannot break socket ownership.
 * @param core The core.
 */
function notify(core: TransportCore): void {
	for (const listener of core.listeners) {
		try {
			listener();
		} catch {
			// A UI subscriber's failure is its own.
		}
	}
}

/**
 * Whether a state change invalidates every intent captured before it: any
 * change of kind, readiness, or link. Even a recovery back to the same link
 * cannot revive an action captured before readiness or ownership changed.
 * @param next The state being published.
 * @param previous The state before it.
 * @returns True when captured intents must be retired.
 */
function retiresIntents(next: BrowserWorkbenchState, previous: BrowserWorkbenchState): boolean {
	return (
		next.kind !== "readiness" ||
		previous.kind !== "readiness" ||
		next.state !== previous.state ||
		!sameCapturedLink(next.snapshot.threadLink, previous.snapshot.threadLink)
	);
}

/**
 * Publish a state.
 * @param core The core.
 * @param next The state.
 */
function setState(core: TransportCore, next: BrowserWorkbenchState): void {
	if (core.activeRun !== null && retiresIntents(next, core.ownerState)) {
		core.activeRun.intentRevision += 1;
	}
	core.ownerState = Object.freeze(next);
	notify(core);
}

/**
 * Whether a run is the live one.
 * @param core The core.
 * @param run The run.
 * @returns True while current.
 */
function isCurrent(core: TransportCore, run: SocketRun): boolean {
	return !core.disposed && core.activeRun === run && !run.closed;
}

/**
 * A fresh request id.
 * @param core The core.
 * @returns The id.
 */
function nextRequestId(core: TransportCore): string {
	const supplied = core.requestId?.();
	if (supplied !== undefined && supplied.length > 0) {
		return supplied;
	}
	return globalThis.crypto.randomUUID();
}

/**
 * Retire a run: remove its listeners and reject its pending requests.
 * @param core The core.
 * @param run The run.
 * @param code Why its answers are lost.
 * @param reason Plain words.
 */
function retire(core: TransportCore, run: SocketRun, code: RetireCode, reason: string): void {
	if (run.closed) {
		return;
	}
	run.closed = true;
	run.remove();
	rejectPending(run, code, reason);
	if (core.activeRun === run) {
		core.activeRun = null;
	}
}

/**
 * The host spoke a contract this browser cannot read; stop for good.
 * @param core The core.
 * @param run The run.
 * @param error The wire error.
 */
function incompatible(core: TransportCore, run: SocketRun, error: unknown): void {
	if (!isCurrent(core, run)) {
		return;
	}
	const reason = messageOf(error, "The Codex workbench contract is incompatible.");
	run.closed = true;
	run.remove();
	rejectPending(run, "incompatible_contract", reason);
	core.activeRun = null;
	core.currentLease = null;
	setState(core, {
		kind: "connection",
		state: "incompatible_contract",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	});
}

/**
 * Publish backoff after a socket loss.
 * @param core The core.
 * @param run The run that was lost, for the snapshot it kept.
 * @param reason Plain words.
 */
function setBackoff(core: TransportCore, run: SocketRun, reason: string): void {
	setState(core, {
		kind: "connection",
		state: "backoff",
		connection: "reconnecting",
		snapshot: run.snapshot,
		sequence: run.sequence,
		retryAtMs: core.now() + SOCKET_RECONNECT_MS,
		reason,
	});
}

/**
 * Publish the run's snapshot as a readiness state and adopt its lease.
 * @param core The core.
 * @param run The run.
 */
function publishReadiness(core: TransportCore, run: SocketRun): void {
	if (!isCurrent(core, run) || run.snapshot === null || run.sequence === null) {
		return;
	}
	core.currentLease = run.snapshot.lease;
	setState(core, {
		kind: "readiness",
		state: run.snapshot.readiness.state,
		connection: "connected",
		snapshot: run.snapshot,
		sequence: run.sequence,
	});
}

/**
 * Publish a stale-stream state.
 * @param core The core.
 * @param run The run.
 * @param receivedSequence The sequence that arrived.
 * @param reason Plain words.
 */
function markStale(
	core: TransportCore,
	run: SocketRun,
	receivedSequence: number,
	reason: string,
): void {
	if (!isCurrent(core, run)) {
		return;
	}
	setState(core, {
		kind: "stream",
		state: "stale_snapshot",
		connection: "connected",
		snapshot: run.snapshot,
		sequence: run.sequence,
		expectedSequence: run.sequence === null ? 0 : run.sequence + 1,
		receivedSequence,
		reason,
	});
}

/**
 * The stream reducer's view of the core.
 * @param core The core.
 * @returns The host.
 */
function streamHost(core: TransportCore): StreamHost {
	/**
	 * Whether a run is current.
	 * @param run The run.
	 * @returns True while current.
	 */
	function isCurrentRun(run: SocketRun): boolean {
		return isCurrent(core, run);
	}
	/**
	 * Publish a stale state.
	 * @param run The run.
	 * @param receivedSequence The sequence that arrived.
	 * @param reason Plain words.
	 */
	function markRunStale(run: SocketRun, receivedSequence: number, reason: string): void {
		markStale(core, run, receivedSequence, reason);
	}
	/**
	 * Publish readiness.
	 * @param run The run.
	 */
	function publishRunReadiness(run: SocketRun): void {
		publishReadiness(core, run);
	}
	/**
	 * Stop on an incompatibility.
	 * @param run The run.
	 * @param error The wire error.
	 */
	function incompatibleRun(run: SocketRun, error: unknown): void {
		incompatible(core, run, error);
	}
	return {
		isCurrent: isCurrentRun,
		markStale: markRunStale,
		publishReadiness: publishRunReadiness,
		incompatible: incompatibleRun,
	};
}

/**
 * The capability facts as they stand now.
 * @param core The core.
 * @returns The context.
 */
function capabilityContext(core: TransportCore): CapabilityContext {
	const run = core.activeRun;
	return {
		snapshot: run?.snapshot ?? null,
		connected: run !== null && isCurrent(core, run) && socketOpen(run.socket),
		readinessPublished: core.ownerState.kind === "readiness",
		lease: core.currentLease,
		now: core.now,
	};
}

/**
 * The live run, or a refusal.
 * @param core The core.
 * @returns The run.
 */
function requireRun(core: TransportCore): SocketRun {
	if (core.activeRun === null) {
		throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
	}
	return core.activeRun;
}

/**
 * A run that is current and has reduced a snapshot, or a refusal.
 * @param core The core.
 * @param run The run.
 * @returns The snapshot it holds.
 */
function requireReducedRun(core: TransportCore, run: SocketRun): BrowserSnapshot {
	if (!isCurrent(core, run) || run.snapshot === null || run.sequence === null) {
		throw transportFailure("socket_unavailable", "The Codex workbench has no active socket.");
	}
	return run.snapshot;
}

/**
 * The lease as an active authority, or a refusal naming why not.
 * @param core The core.
 * @param lease The lease, or null.
 * @returns The active lease.
 */
function activeLease(core: TransportCore, lease: BrowserCommandLease | null): BrowserCommandLease {
	if (lease === null) {
		throw transportFailure("lease_required", "A browser command lease is required.");
	}
	if (lease.state !== "active") {
		throw transportFailure(
			lease.state === "expired" ? "lease_expired" : "lease_released",
			"The browser command lease is no longer active.",
			{ commandId: lease.commandId },
		);
	}
	if (lease.expiresAtMs <= core.now()) {
		core.currentLease = Object.freeze({ ...lease, state: "expired" });
		notify(core);
		throw transportFailure("lease_expired", "The browser command lease has expired.", {
			commandId: lease.commandId,
		});
	}
	return lease;
}

/**
 * The lease a command may run under on a run, or a refusal naming why not.
 * @param core The core.
 * @param run The run.
 * @returns The active lease.
 */
function captureLease(core: TransportCore, run: SocketRun): BrowserCommandLease {
	requireReducedRun(core, run);
	return activeLease(core, core.currentLease);
}

/**
 * The lease identity plus the link it is captured against.
 * @param core The core.
 * @param run The run.
 * @returns The frozen target.
 */
function captureTarget(core: TransportCore, run: SocketRun): BrowserWorkbenchCommandTarget {
	const snapshot = requireReducedRun(core, run);
	const lease = activeLease(core, core.currentLease);
	return Object.freeze({
		commandId: lease.commandId,
		paneId: lease.paneId,
		childId: lease.childId,
		epoch: lease.epoch,
		capturedThreadLink: Object.freeze({ ...snapshot.threadLink }),
	});
}

export {
	capabilityContext,
	captureLease,
	captureTarget,
	createTransportCore,
	incompatible,
	isCurrent,
	markStale,
	nextRequestId,
	notify,
	publishReadiness,
	requireRun,
	retire,
	setBackoff,
	setState,
	stoppedState,
	streamHost,
	type TransportCore,
};
