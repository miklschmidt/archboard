import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	OperationId,
} from "@/shared/codex-workbench-identity";
import type {
	DynamicCallerAuthority,
	DynamicEpochTeardownProof,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineOwner,
	DynamicMutationTerminalProof,
	DynamicOperationIdPort,
	DynamicOperationTerminalDisposition,
	DynamicOperationTerminalResult,
	DynamicToolLifecyclePort,
	DynamicWaitEvent,
	DynamicWaitOwner,
} from "@/runtime/codex-dynamic-tools";
import type { CodexWaitGraph, WaitOwner } from "@/runtime/codex-wait-graph";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { TransportServerNotification } from "@/runtime/codex-transport";

/**
 * The shared OperationId authority plus exact once-only terminal disposition.
 * @param authority What mints and validates this epoch's operations.
 * @returns The port.
 */
function createCanvasDynamicOperationIdAdapter(
	authority: IdentityAuthorities["operation"],
): DynamicOperationIdPort {
	const terminal = new Map<OperationId, DynamicOperationTerminalResult>();
	return Object.freeze({
		/**
		 * A fresh operation identity for one dynamic tool call.
		 * @returns The operation.
		 */
		issueCanonicalOperationId: () => authority.issuer.mintOperationId(),
		/**
		 * Refuse an operation that is not this epoch's, or that has already
		 * reached a terminal: either way it is not one a call may still run under.
		 * @param operationId The operation.
		 */
		validateCurrentUnconsumedOperationId: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			if (terminal.has(operationId)) {
				throw new Error("The OperationId is already terminal.");
			}
		},
		/**
		 * The operation as it is spelled in a wire field this host owns.
		 * @param operationId The operation.
		 * @returns The wire string.
		 */
		serializeForOwnedWireFields: (operationId: OperationId) =>
			authority.decoder.serializeOperationId(operationId),
		/**
		 * Settle one operation once and for all. A second settlement with the same
		 * disposition is the same result; with a different one it is a fault.
		 * @param input The operation and how it ended.
		 * @param input.operationId The operation.
		 * @param input.disposition How it ended.
		 * @returns The terminal result.
		 */
		terminalizeCanonicalOperationId: (input: {
			readonly operationId: OperationId;
			readonly disposition: DynamicOperationTerminalDisposition;
		}) => {
			authority.validator.assertCurrentOperationId(input.operationId);
			const prior = terminal.get(input.operationId);
			if (prior !== undefined) {
				if (prior.disposition !== input.disposition) {
					throw new Error("The OperationId already has a different terminal disposition.");
				}
				return prior;
			}
			const result = Object.freeze({
				operationId: input.operationId,
				disposition: input.disposition,
				terminal: true as const,
			});
			terminal.set(input.operationId, result);
			return result;
		},
		/**
		 * How one operation ended, if it has ended.
		 * @param operationId The operation.
		 * @returns The terminal result, or null.
		 */
		readCanonicalOperationTerminalResult: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			return terminal.get(operationId) ?? null;
		},
	});
}

/**
 * One wait owner as the wait graph names it, which is the caller identity
 * without the target list the graph derives its own edges from.
 * @param owner The wait owner.
 * @returns The graph's name for it.
 */
function waitOwner(owner: DynamicWaitOwner): WaitOwner {
	return {
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	};
}

/**
 * The key one quarantined mutation is held under: the exact call, in the exact
 * child epoch that poisoned it.
 * @param identity The quarantined call.
 * @returns The key.
 */
function quarantineKey(identity: DynamicMutationQuarantineIdentity): string {
	return JSON.stringify([identity.child, identity.epoch, identity.callId]);
}

/**
 * The key one active wait is held under, so a second wait by the same caller
 * on the same call is refused rather than silently replacing the first.
 * @param owner The wait owner.
 * @returns The key.
 */
function waitKey(owner: DynamicWaitOwner): string {
	return JSON.stringify([owner.child, owner.epoch, owner.caller, owner.turn, owner.call]);
}

/** What one notification names on the wire, for one wait owner. */
interface WaitWireNames {
	readonly threadId: string;
	readonly turnId: string;
	readonly callId: string;
}

/** One notification as the child sent it. */
type Notification = TransportServerNotification["notification"];

/**
 * The wire names one wait owner would be mentioned by, so a notification can
 * be matched against it without decoding the notification's own identities.
 * @param owner The wait owner.
 * @param decoder What spells an identity on the wire.
 * @returns The names.
 */
function waitWireNames(
	owner: DynamicWaitOwner,
	decoder: IdentityAuthorities["identity"]["decoder"],
): WaitWireNames {
	return {
		threadId: decoder.serializeCodexIdentity(owner.caller),
		turnId: decoder.serializeCodexIdentity(owner.turn),
		callId: decoder.serializeCodexIdentity(owner.call),
	};
}

/**
 * Whether this notification says the waiting call itself has completed, which
 * means nothing is left to settle the wait.
 * @param notification The notification.
 * @param names The wait owner's wire names.
 * @returns True when the call completed.
 */
function itemCancelledWait(notification: Notification, names: WaitWireNames): boolean {
	const { method, params } = notification;
	return (
		method === "item/completed" &&
		params.threadId === names.threadId &&
		params.turnId === names.turnId &&
		params.item.type === "dynamicToolCall" &&
		params.item.id === names.callId
	);
}

/**
 * Whether this notification says the turn that made the waiting call was
 * interrupted, which likewise leaves nothing to settle the wait.
 * @param notification The notification.
 * @param names The wait owner's wire names.
 * @returns True when the caller turn was interrupted.
 */
function turnInterruptedWait(notification: Notification, names: WaitWireNames): boolean {
	const { method, params } = notification;
	return (
		method === "turn/completed" &&
		params.threadId === names.threadId &&
		params.turn.id === names.turnId &&
		params.turn.status === "interrupted"
	);
}

/**
 * What one wait should be failed with, when a notification says the wait can
 * no longer be settled.
 * @param owner The wait owner.
 * @param notification The notification.
 * @param decoder What spells an identity on the wire.
 * @returns The error to fail the wait with, or null to leave it waiting.
 */
function waitCancellation(
	owner: DynamicWaitOwner,
	notification: Notification,
	decoder: IdentityAuthorities["identity"]["decoder"],
): (Error & { readonly code: string }) | null {
	const names = waitWireNames(owner, decoder);
	if (itemCancelledWait(notification, names)) {
		return Object.assign(new Error("The dynamic wait call completed before host settlement."), {
			code: "cancellation",
		});
	}
	if (turnInterruptedWait(notification, names)) {
		return Object.assign(new Error("The caller turn was interrupted before host settlement."), {
			code: "interruption",
		});
	}
	return null;
}

interface CanvasDynamicLifecycleOwnerOptions {
	readonly identity: IdentityAuthorities;
	readonly waitGraph: CodexWaitGraph;
	readonly waitForTargets: (input: {
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
		readonly signal: AbortSignal;
	}) => Promise<DynamicWaitEvent>;
	readonly shutdownEpoch: (child: ChildId, epoch: ChildEpoch) => Promise<DynamicEpochTeardownProof>;
	readonly onFatal: (fault: DynamicFatalLifecycleFault) => void;
}

interface CanvasDynamicLifecycleOwner {
	readonly port: DynamicToolLifecyclePort;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	readonly shutdown: () => Promise<void>;
}

/**
 * Exact executing-call and wait/quarantine owner for the dynamic dispatcher.
 * @param options The identities, the wait graph, and how a child epoch is
 * waited on, torn down, and reported fatal.
 * @returns The owner.
 */
function createCanvasDynamicLifecycleOwner(
	options: CanvasDynamicLifecycleOwnerOptions,
): CanvasDynamicLifecycleOwner {
	const activeWaits = new Map<
		string,
		{
			readonly owner: DynamicWaitOwner;
			readonly controller: AbortController;
			readonly reject: (error: Error & { readonly code: string }) => void;
		}
	>();
	const quarantines = new Map<
		string,
		{
			readonly identity: DynamicMutationQuarantineIdentity;
			readonly retry: () => Promise<DynamicMutationTerminalProof>;
			readonly owner: DynamicMutationQuarantineOwner;
			readonly resolveExit: () => void;
		}
	>();
	let stopped = false;
	const port: DynamicToolLifecyclePort = Object.freeze({
		/**
		 * Refuse work on behalf of a call that is no longer running, so a late
		 * reply cannot act under an identity the child has already let go.
		 * @param input The request and the caller it claims.
		 * @param input.request The request.
		 * @param input.caller The caller it claims.
		 */
		assertCallExecuting: (input: {
			readonly request: DynamicServerRequest;
			readonly caller: DynamicCallerAuthority;
		}) => {
			if (stopped || !input.caller.executing || input.caller.status !== "active") {
				throw new Error("The logical dynamic call is no longer executing.");
			}
		},
		/**
		 * Record that one call is waiting on other threads, refusing a wait that
		 * would close a cycle and deadlock every thread in it.
		 * @param registration The wait owner and what it waits on.
		 * @param registration.owner The wait owner.
		 */
		registerWaitOwner: ({ owner }: { readonly owner: DynamicWaitOwner }) => {
			const result = options.waitGraph.addEdgeSet({
				owner: waitOwner(owner),
				targets: owner.sortedTargetThreadIds,
			});
			if (!result.ok) {
				throw new Error(`The wait owner would create a cycle: ${result.cycle.join(" -> ")}`);
			}
		},
		/**
		 * Forget one wait, whichever way it ended.
		 * @param release The wait owner and why it ended.
		 * @param release.owner The wait owner.
		 * @param release.cause Why it ended.
		 */
		releaseWaitOwner: ({
			owner,
			cause,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwner"]>[0]) => {
			options.waitGraph.release({ owner: waitOwner(owner), cause });
		},
		/**
		 * Forget every wait one child owned, its process having gone.
		 * @param release The child.
		 * @param release.child The child.
		 */
		releaseWaitOwnersForChild: ({
			child,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwnersForChild"]>[0]) => {
			options.waitGraph.release({ cause: "child-exit", child });
		},
		/**
		 * Take ownership of one mutation whose terminal could not be delivered,
		 * so it is retried when the child exits rather than lost. The same call
		 * quarantined twice keeps its first owner.
		 * @param quarantine The call and how to retry its terminalization.
		 * @param quarantine.identity The call.
		 * @param quarantine.retryTerminalization How to retry it.
		 * @returns The quarantine owner, whose childExit settles on the retry.
		 */
		poisonEpochAndOwnMutationQuarantine: ({
			identity,
			retryTerminalization,
		}: Parameters<DynamicToolLifecyclePort["poisonEpochAndOwnMutationQuarantine"]>[0]) => {
			const key = quarantineKey(identity);
			const prior = quarantines.get(key);
			if (prior !== undefined) {
				return prior.owner;
			}
			let resolveExit!: () => void;
			const childExitPromise = new Promise<{
				readonly child: ChildId;
				readonly epoch: ChildEpoch;
				readonly exited: true;
			}>((resolve) => {
				/**
				 * Say the child this quarantine belongs to has now exited.
				 * @returns Nothing; the quarantine owner's promise settles instead.
				 */
				resolveExit = () => resolve({ child: identity.child, epoch: identity.epoch, exited: true });
			});
			const owner = Object.freeze({
				child: identity.child,
				epoch: identity.epoch,
				poisoned: true as const,
				childExit: childExitPromise,
			});
			quarantines.set(key, {
				identity,
				retry: retryTerminalization,
				owner,
				resolveExit,
			});
			return owner;
		},
		/**
		 * Begin tearing down one child epoch that cannot be trusted to continue.
		 * @param failure The epoch and why it is being torn down.
		 * @param failure.child The child.
		 * @param failure.epoch The epoch.
		 * @param failure.reason Why.
		 * @returns The proof the shutdown was initiated, and the teardown itself.
		 */
		failClosedShutdownEpoch: ({
			child,
			epoch,
			reason,
		}: Parameters<DynamicToolLifecyclePort["failClosedShutdownEpoch"]>[0]) => ({
			child,
			epoch,
			reason,
			shutdownInitiated: true as const,
			teardown: options.shutdownEpoch(child, epoch),
		}),
		reportFatalLifecycleFault: options.onFatal,
		/**
		 * Wait for the threads one call named, until they settle, the wait times
		 * out, or the call itself is cancelled from under it.
		 * @param input The wait owner, cursor, timeout, and sequence.
		 * @returns What the wait settled with.
		 */
		waitForTargets: (input: Parameters<DynamicToolLifecyclePort["waitForTargets"]>[0]) => {
			const key = waitKey(input.owner);
			if (activeWaits.has(key)) {
				throw new Error("The dynamic wait is already active.");
			}
			const controller = new AbortController();
			let reject!: (error: Error & { readonly code: string }) => void;
			const cancellation = new Promise<never>((_resolve, next) => {
				reject = next;
			});
			activeWaits.set(key, { owner: input.owner, controller, reject });
			return Promise.race([
				options.waitForTargets({ ...input, signal: controller.signal }),
				cancellation,
			]).finally(() => activeWaits.delete(key));
		},
	});
	/**
	 * Fail every wait this notification says can no longer be settled, ignoring
	 * anything from another child epoch.
	 * @param event The notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (
			event.correlation.child !== options.identity.identity.validator.childId ||
			event.correlation.epoch !== options.identity.identity.validator.epoch
		) {
			return;
		}
		for (const active of activeWaits.values()) {
			const cancellation = waitCancellation(
				active.owner,
				event.notification,
				options.identity.identity.decoder,
			);
			if (cancellation === null) {
				continue;
			}
			active.controller.abort();
			active.reject(cancellation);
		}
	};
	/**
	 * Fail every wait one child epoch owned, because nothing is left to settle
	 * them.
	 * @param child The child.
	 * @param epoch Its epoch.
	 */
	const cancelWaitsForChild = (child: ChildId, epoch: ChildEpoch): void => {
		for (const active of activeWaits.values()) {
			if (active.owner.child !== child || active.owner.epoch !== epoch) {
				continue;
			}
			active.controller.abort();
			active.reject(
				Object.assign(new Error("The dynamic wait child disconnected."), {
					code: "child_disconnected",
				}),
			);
		}
	};
	/**
	 * Retry every quarantined mutation one child epoch left behind, and release
	 * its quarantine whether or not the retry succeeded.
	 * @param child The child.
	 * @param epoch Its epoch.
	 */
	const drainQuarantinesForChild = async (child: ChildId, epoch: ChildEpoch): Promise<void> => {
		for (const entry of quarantines.values()) {
			if (entry.identity.child !== child || entry.identity.epoch !== epoch) {
				continue;
			}
			try {
				// oxlint-disable-next-line no-await-in-loop -- each retry is a mutation of the same epoch and must be settled before the next is attempted
				await entry.retry();
			} finally {
				entry.resolveExit();
				quarantines.delete(quarantineKey(entry.identity));
			}
		}
	};
	/**
	 * Settle everything one child epoch owned, now that its process has gone.
	 * @param child The child.
	 * @param epoch Its epoch.
	 */
	const childExit = async (child: ChildId, epoch: ChildEpoch): Promise<void> => {
		cancelWaitsForChild(child, epoch);
		await drainQuarantinesForChild(child, epoch);
		options.waitGraph.release({ cause: "child-exit", child });
	};
	return Object.freeze({
		port,
		onNotification,
		childExit,
		// Asymmetric on purpose: edge release lives in childExit, so a host
		// shutdown with no quarantined epoch never reaches it. The wait graph is
		// plain in-process state with no timer, handle, or child behind it, and
		// host shutdown is the end of the process, so the surviving edges cost
		// nothing. Releasing them here would only add a second teardown order to
		// keep in step with the one child exit already owns.
		/**
		 * Settle every child epoch still holding a quarantine, once.
		 * @returns When every one of them has been settled.
		 */
		shutdown: async () => {
			if (stopped) {
				return;
			}
			stopped = true;
			const exits = new Map<string, { child: ChildId; epoch: ChildEpoch }>();
			for (const entry of quarantines.values()) {
				exits.set(`${entry.identity.child}:${entry.identity.epoch}`, {
					child: entry.identity.child,
					epoch: entry.identity.epoch,
				});
			}
			for (const exit of exits.values()) {
				// oxlint-disable-next-line no-await-in-loop -- one epoch is settled at a time; its quarantine retries must not interleave with another epoch's
				await childExit(exit.child, exit.epoch);
			}
		},
	});
}

export {
	createCanvasDynamicOperationIdAdapter,
	type CanvasDynamicLifecycleOwnerOptions,
	type CanvasDynamicLifecycleOwner,
	createCanvasDynamicLifecycleOwner,
};
