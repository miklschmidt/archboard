import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserDisconnectReason,
	BrowserDynamicApprovalActions,
	BrowserDynamicApprovalResponse,
	DynamicApprovalOwnerBinding,
	DynamicApprovalOwnerRequest,
	DynamicApprovalOwnerView,
} from "@/server/codex-workbench";
import type {
	BrowserCommandId,
	IdentityAuthorities,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import type {
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
} from "@/runtime/codex-dynamic-tools";
import type { TransportServerNotification } from "@/runtime/codex-transport";

interface PendingDynamicApproval {
	readonly request: DynamicApprovalOwnerRequest;
	binding: DynamicApprovalOwnerBinding;
	readonly decision: Promise<DynamicToolApprovalDecision>;
	readonly resolve: (decision: DynamicToolApprovalDecision) => void;
	readonly timer: ReturnType<typeof setTimeout>;
	settled: boolean;
}

interface CanvasDynamicApprovalOwner {
	readonly port: DynamicToolApprovalPort;
	readonly browser: BrowserDynamicApprovalActions;
	readonly pending: () => readonly DynamicApprovalOwnerView[];
	/** Rebind pending presentation to the exact current lease for its pane. */
	readonly bindLease: (paneId: string, commandId: BrowserCommandId) => void;
	readonly subscribe: (listener: () => void) => () => void;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly settleAll: (cause: "host_shutdown" | "child_disconnected") => void;
	/**
	 * Release the generation's presentation and its at-most-once decision ledger.
	 * The ledger only has to outlive the epoch that issued the decisions, so a
	 * settled generation must not keep one entry per approval it ever answered.
	 */
	readonly dispose: () => void;
}

interface CanvasDynamicApprovalOwnerOptions {
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	readonly bindingForCaller: (threadId: ThreadId) => DynamicApprovalOwnerBinding;
}

/** One notification as the child sent it. */
type Notification = TransportServerNotification["notification"];

/** What one approval's call is mentioned by on the wire. */
interface ApprovalWireNames {
	readonly threadId: string;
	readonly turnId: string;
	readonly callId: string;
}

/**
 * The key one approval is held under: its full identity plus the exact effect
 * it asked about, so a different effect is a different approval.
 * @param request The approval request.
 * @returns The key.
 */
function keyFor(request: Pick<DynamicToolApprovalRequest, "identity" | "effectHash">): string {
	const { identity, effectHash } = request;
	return JSON.stringify([
		identity.child,
		identity.epoch,
		identity.threadId,
		identity.turnId,
		identity.callId,
		identity.namespace,
		identity.tool,
		identity.manifestHash,
		identity.operationId,
		effectHash,
	]);
}

/**
 * One binding nothing can change afterwards, so what a pane was shown cannot
 * drift from what its answer is checked against.
 * @param binding The binding.
 * @returns The frozen binding.
 */
function immutableBinding(binding: DynamicApprovalOwnerBinding): DynamicApprovalOwnerBinding {
	return Object.freeze({
		commandId: binding.commandId,
		paneId: binding.paneId,
		capturedLink: Object.freeze({
			threadId: binding.capturedLink.threadId,
			childId: binding.capturedLink.childId,
			epoch: binding.capturedLink.epoch,
		}),
	});
}

/**
 * Freeze one value and everything reachable from it, so nothing can edit a
 * request after the person has been shown it.
 * @param value What to freeze.
 * @param seen What has already been frozen, so a cycle terminates.
 */
function freezeGraph(value: unknown, seen = new WeakSet<object>()): void {
	if (value === null || typeof value !== "object" || seen.has(value)) {
		return;
	}
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		freezeGraph(Reflect.get(value, key), seen);
	}
	Object.freeze(value);
}

/**
 * This owner's own copy of one request, frozen: the dispatcher may go on using
 * its own, and what the person is shown will not change under them.
 * @param request The approval request.
 * @returns The owned copy.
 */
function ownImmutableRequest(request: DynamicToolApprovalRequest): DynamicApprovalOwnerRequest {
	const owned = structuredClone(request);
	freezeGraph(owned);
	return owned;
}

/**
 * Whether the binding an answer was given under is no longer the one the
 * approval is presented under: a different lease, pane, or link means this
 * answer is not an answer to what is being asked now.
 * @param command The answer.
 * @param binding What the approval is presented under.
 * @returns True when the answer must be refused.
 */
function bindingIsStale(
	command: BrowserDynamicApprovalResponse,
	binding: DynamicApprovalOwnerBinding,
): boolean {
	return (
		command.commandId !== binding.commandId ||
		command.paneId !== binding.paneId ||
		command.capturedLink.threadId !== binding.capturedLink.threadId ||
		command.capturedLink.childId !== binding.capturedLink.childId ||
		command.capturedLink.epoch !== binding.capturedLink.epoch
	);
}

/**
 * How one approval ends when a person answers it.
 * @param decision What the person chose.
 * @returns The outcome and its cause.
 */
function personDecision(decision: BrowserDynamicApprovalResponse["decision"]): {
	readonly outcome: DynamicToolApprovalDecision["outcome"];
	readonly cause: DynamicToolApprovalDecision["cause"];
} {
	if (decision === "approve") {
		return { outcome: "approved", cause: "person_approved" };
	}
	return { outcome: "declined", cause: "person_declined" };
}

/**
 * The wire names one approval's call would be mentioned by.
 * @param identity The call the approval is about.
 * @param decoder What spells an identity on the wire.
 * @returns The names.
 */
function approvalWireNames(
	identity: DynamicApprovalOwnerRequest["identity"],
	decoder: IdentityAuthorities["identity"]["decoder"],
): ApprovalWireNames {
	return {
		threadId: decoder.serializeCodexIdentity(identity.threadId),
		turnId: decoder.serializeCodexIdentity(identity.turnId),
		callId: decoder.serializeCodexIdentity(identity.callId),
	};
}

/**
 * Whether this notification says the call the approval is about has completed,
 * so nobody is waiting for the answer any more.
 * @param notification The notification.
 * @param names The call's wire names.
 * @returns True when the call completed.
 */
function itemCancelledApproval(notification: Notification, names: ApprovalWireNames): boolean {
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
 * Whether this notification says the turn that asked was interrupted.
 * @param notification The notification.
 * @param names The call's wire names.
 * @returns True when the asking turn was interrupted.
 */
function turnInterruptedApproval(notification: Notification, names: ApprovalWireNames): boolean {
	const { method, params } = notification;
	return (
		method === "turn/completed" &&
		params.threadId === names.threadId &&
		params.turn.id === names.turnId &&
		params.turn.status === "interrupted"
	);
}

/**
 * How one presented approval should end, when a notification says nobody is
 * waiting for its answer any more.
 * @param identity The call the approval is about.
 * @param notification The notification.
 * @param decoder What spells an identity on the wire.
 * @returns The cause to settle it with, or null to leave it presented.
 */
function approvalCancellation(
	identity: DynamicApprovalOwnerRequest["identity"],
	notification: Notification,
	decoder: IdentityAuthorities["identity"]["decoder"],
): DynamicToolApprovalDecision["cause"] | null {
	const names = approvalWireNames(identity, decoder);
	if (itemCancelledApproval(notification, names)) {
		return "call_cancelled";
	}
	if (turnInterruptedApproval(notification, names)) {
		return "caller_turn_interrupted";
	}
	return null;
}

/**
 * One real visual-approval owner shared by the dispatcher and browser gateway.
 * @param options The identities, the clock deadlines are measured on, and how
 * one caller's pane binding is read.
 * @returns The owner.
 */
function createCanvasDynamicApprovalOwner(
	options: CanvasDynamicApprovalOwnerOptions,
): CanvasDynamicApprovalOwner {
	const pending = new Map<string, PendingDynamicApproval>();
	const decisions = new Map<string, DynamicToolApprovalDecision>();
	const listeners = new Set<() => void>();
	/** Tell every listener that what a pane would be shown has changed. */
	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};
	/**
	 * End one approval, once. Its timer is cleared, its decision recorded so a
	 * later settlement of the same approval is the same answer, and whoever is
	 * awaiting it is released.
	 * @param entry The presented approval.
	 * @param outcome How it ended.
	 * @param cause Why it ended that way.
	 */
	const terminal = (
		entry: PendingDynamicApproval,
		outcome: DynamicToolApprovalDecision["outcome"],
		cause: DynamicToolApprovalDecision["cause"],
	): void => {
		if (entry.settled) {
			return;
		}
		entry.settled = true;
		clearTimeout(entry.timer);
		pending.delete(keyFor(entry.request));
		const decision = Object.freeze({
			outcome,
			cause,
			identity: entry.request.identity,
			effectHash: entry.request.effectHash,
			decidedAtMs: options.now(),
		});
		decisions.set(keyFor(entry.request), decision);
		entry.resolve(decision);
		notify();
	};
	/**
	 * Present one approval to whichever pane the caller's thread is linked to,
	 * with a timer that expires it at the deadline the request carries.
	 * @param request The approval request.
	 */
	const present = (request: DynamicToolApprovalRequest): void => {
		const ownedRequest = ownImmutableRequest(request);
		const key = keyFor(ownedRequest);
		if (pending.has(key)) {
			throw new Error("The dynamic approval is already pending.");
		}
		let resolve!: (decision: DynamicToolApprovalDecision) => void;
		const decision = new Promise<DynamicToolApprovalDecision>((next) => {
			resolve = next;
		});
		const entry: PendingDynamicApproval = {
			request: ownedRequest,
			binding: immutableBinding(options.bindingForCaller(ownedRequest.identity.threadId)),
			decision,
			resolve,
			settled: false,
			timer: setTimeout(
				() => terminal(entry, "expired", "deadline_reached"),
				Math.max(0, ownedRequest.expiresAtMs - options.now()),
			),
		};
		entry.timer.unref();
		pending.set(key, entry);
		notify();
	};
	const port: DynamicToolApprovalPort = Object.freeze({
		presentImmutableRequest: present,
		/**
		 * The decision one presented approval will settle with.
		 * @param request The approval request.
		 * @returns The decision, once it is made.
		 */
		awaitOneExactVisualDecision: (request: DynamicToolApprovalRequest) => {
			const entry = pending.get(keyFor(request));
			if (entry === undefined) {
				throw new Error("The exact dynamic approval is not pending.");
			}
			return entry.decision;
		},
		/**
		 * Settle one approval once and for all. A second settlement with the same
		 * decision is the same answer; with a different one it is a fault.
		 * @param input The request and the decision.
		 * @param input.request The approval request.
		 * @param input.decision The decision.
		 */
		settleIdentityAndEffectHashOnce: (input: {
			readonly request: DynamicToolApprovalRequest;
			readonly decision: DynamicToolApprovalDecision;
		}) => {
			const { request, decision } = input;
			const key = keyFor(request);
			const prior = decisions.get(key);
			if (prior !== undefined) {
				if (JSON.stringify(prior) !== JSON.stringify(decision)) {
					throw new Error("The dynamic approval already has a different terminal decision.");
				}
				return;
			}
			const entry = pending.get(key);
			if (entry === undefined) {
				throw new Error("The exact dynamic approval was never presented.");
			}
			terminal(entry, decision.outcome, decision.cause);
		},
	});
	const browser: BrowserDynamicApprovalActions = Object.freeze({
		/**
		 * Settle one approval with the person's answer, refused unless the answer
		 * was given under the binding the approval is still presented under.
		 * @param command The answer.
		 * @param _context The pane, which the binding check already covers.
		 * @returns The browser outcome.
		 */
		resolve: async (
			command: BrowserDynamicApprovalResponse,
			_context: BrowserActionContext,
		): Promise<BrowserActionResult> => {
			const entry = pending.get(keyFor(command));
			if (entry === undefined) {
				throw new Error("The dynamic approval is no longer pending.");
			}
			if (bindingIsStale(command, entry.binding)) {
				throw new Error("The dynamic approval binding is stale.");
			}
			const answered = personDecision(command.decision);
			terminal(entry, answered.outcome, answered.cause);
			return { outcome: "delivered" };
		},
		/**
		 * Settle every approval presented to a pane whose browser has gone, so
		 * nothing is left waiting on somebody who cannot answer.
		 * @param context The pane.
		 * @param _reason Why the browser stopped listening, which does not change
		 * how these approvals end.
		 */
		onBrowserDisconnect: (context: BrowserActionContext, _reason: BrowserDisconnectReason) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId === context.paneId) {
					terminal(entry, "disconnected", "browser_disconnected");
				}
			}
		},
		/**
		 * Say when what a pane would be shown has changed.
		 * @param listener What to call.
		 * @returns How to stop listening.
		 */
		onChange: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	});
	return Object.freeze({
		port,
		browser,
		/**
		 * Every approval awaiting an answer, as a pane is shown it.
		 * @returns The views.
		 */
		pending: () =>
			Object.freeze(
				[...pending.values()].map((entry) =>
					Object.freeze({ request: entry.request, binding: entry.binding }),
				),
			),
		/**
		 * Re-point one pane's presented approvals at its current lease, so an
		 * answer given under the new lease is not refused as stale.
		 * @param paneId The pane.
		 * @param commandId Its current lease.
		 */
		bindLease: (paneId: string, commandId: BrowserCommandId) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId !== paneId || entry.binding.commandId === commandId) {
					continue;
				}
				entry.binding = immutableBinding({ ...entry.binding, commandId });
			}
		},
		subscribe: browser.onChange!,
		/**
		 * Cancel every approval this notification says nobody is waiting for any
		 * more, ignoring anything from another child epoch.
		 * @param event The notification.
		 */
		onNotification: (event: TransportServerNotification) => {
			if (
				event.correlation.child !== options.identity.identity.validator.childId ||
				event.correlation.epoch !== options.identity.identity.validator.epoch
			) {
				return;
			}
			for (const entry of pending.values()) {
				const cause = approvalCancellation(
					entry.request.identity,
					event.notification,
					options.identity.identity.decoder,
				);
				if (cause !== null) {
					terminal(entry, "cancelled", cause);
				}
			}
		},
		/**
		 * Settle every presented approval, because the host or the child is going
		 * away and no answer can arrive.
		 * @param cause Which of the two it is.
		 */
		settleAll: (cause: "host_shutdown" | "child_disconnected") => {
			for (const entry of pending.values()) {
				terminal(entry, cause === "host_shutdown" ? "cancelled" : "disconnected", cause);
			}
		},
		/** Drop every timer, presentation and recorded decision this owner held. */
		dispose: () => {
			for (const entry of pending.values()) {
				clearTimeout(entry.timer);
			}
			pending.clear();
			decisions.clear();
			listeners.clear();
		},
	});
}

export {
	type CanvasDynamicApprovalOwner,
	type CanvasDynamicApprovalOwnerOptions,
	createCanvasDynamicApprovalOwner,
};
