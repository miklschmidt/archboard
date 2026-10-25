import { type BrowserDynamicApproval } from "@archboard/codex-realtime-voice/contract";
import { createCodexBrowserModel } from "@archboard/codex-realtime-voice/schemas";
import { projectDynamicApproval } from "#server/projections/browser-state/dynamic-approval-projection.ts";
import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserDynamicApprovalActions,
} from "@archboard/codex-realtime-voice/server";
import type { BrowserDynamicApprovalResponse } from "@archboard/codex-realtime-voice/schemas";
import type {
	DynamicApprovalOwnerBinding,
	DynamicApprovalOwnerRequest,
	DynamicApprovalOwnerView,
} from "#server/protocol/projection/domain-approval-contract.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import type {
	BrowserCommandId,
	IdentityAuthorities,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type {
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
} from "#runtime/protocol/dynamic-tools/contract.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";

interface PendingDynamicApproval {
	readonly request: DynamicApprovalOwnerRequest;
	/** The tab session whose thread asked, which alone is shown the approval and may answer it. */
	readonly tabSessionId: TabSessionId;
	binding: DynamicApprovalOwnerBinding;
	readonly decision: Promise<DynamicToolApprovalDecision>;
	readonly resolve: (decision: DynamicToolApprovalDecision) => void;
	readonly timer: ReturnType<typeof setTimeout>;
	settled: boolean;
}

interface ServerDynamicApprovalOwner {
	readonly port: DynamicToolApprovalPort;
	readonly browser: BrowserDynamicApprovalActions;
	/** Every approval awaiting an answer from one tab session. */
	readonly pending: (tabSessionId: TabSessionId) => readonly DynamicApprovalOwnerView[];
	/** Browser presentations from this owner's exact pending state. */
	readonly projectPending: (tabSessionId: TabSessionId) => readonly BrowserDynamicApproval[];
	/** Rebind a tab session's pending presentations to its pane holding the current lease. */
	readonly bindLease: (
		tabSessionId: TabSessionId,
		paneId: string,
		commandId: BrowserCommandId,
	) => void;
	readonly subscribe: (listener: () => void) => () => void;
	readonly onNotification: (event: TransportServerNotification) => void;
	/** Settle every approval of a tab session that ended, because nobody is left to answer it. */
	readonly endSession: (tabSessionId: TabSessionId) => void;
	readonly settleAll: (cause: "server_shutdown" | "child_disconnected") => void;
	/**
	 * Release the generation's presentation and its at-most-once decision ledger.
	 * The ledger only has to outlive the epoch that issued the decisions, so a
	 * settled generation must not keep one entry per approval it ever answered.
	 */
	readonly dispose: () => void;
}

interface ServerDynamicApprovalOwnerOptions {
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	/**
	 * The tab session a dynamic caller's thread belongs to, and the browser command its approval
	 * is first presented under.
	 */
	readonly bindingForCaller: (threadId: ThreadId) => {
		readonly tabSessionId: TabSessionId;
		readonly binding: DynamicApprovalOwnerBinding;
	};
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
 * request after the user has been shown it.
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
 * its own, and what the user is shown will not change under them.
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
 * How one approval ends when a user answers it.
 * @param decision What the user chose.
 * @returns The outcome and its cause.
 */
function userDecision(decision: BrowserDynamicApprovalResponse["decision"]): {
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
function createServerDynamicApprovalOwner(
	options: ServerDynamicApprovalOwnerOptions,
): ServerDynamicApprovalOwner {
	const model = createCodexBrowserModel(options.identity);
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
		const caller = options.bindingForCaller(ownedRequest.identity.threadId);
		const entry: PendingDynamicApproval = {
			request: ownedRequest,
			tabSessionId: caller.tabSessionId,
			binding: immutableBinding(caller.binding),
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
		 * Settle one approval with the user's answer, refused unless it came from
		 * the tab session whose thread asked, under the binding the approval is
		 * still presented under.
		 * @param command The answer.
		 * @param context The pane and its tab session.
		 * @returns The browser outcome.
		 */
		resolve: async (
			command: BrowserDynamicApprovalResponse,
			context: BrowserActionContext,
		): Promise<BrowserActionResult> => {
			const entry = pending.get(keyFor(command));
			if (entry === undefined || entry.tabSessionId !== context.tabSessionId) {
				throw new Error("The dynamic approval is no longer pending.");
			}
			if (bindingIsStale(command, entry.binding)) {
				throw new Error("The dynamic approval binding is stale.");
			}
			const answered = userDecision(command.decision);
			terminal(entry, answered.outcome, answered.cause);
			return { outcome: "delivered" };
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
	/**
	 * Read this tab session's current raw approvals.
	 * @param tabSessionId The tab session.
	 * @returns Its pending raw approval views.
	 */
	const pendingViews = (tabSessionId: TabSessionId): readonly DynamicApprovalOwnerView[] =>
		Object.freeze(
			[...pending.values()]
				.filter((entry) => entry.tabSessionId === tabSessionId)
				.map((entry) => Object.freeze({ request: entry.request, binding: entry.binding })),
		);
	return Object.freeze({
		port,
		browser,
		/**
		 * Read the browser approvals from this owner's current raw state.
		 * @param tabSessionId The tab session.
		 * @returns Its pending browser approvals.
		 */
		projectPending: (tabSessionId: TabSessionId) =>
			Object.freeze(
				pendingViews(tabSessionId).map((view) =>
					projectDynamicApproval(model, options.identity.identity.decoder, view),
				),
			),
		/**
		 * Every approval awaiting an answer from one tab session, as its panes are shown it.
		 * @param tabSessionId The tab session.
		 * @returns The views.
		 */
		pending: pendingViews,
		/**
		 * Re-point a tab session's presented approvals at its pane holding the
		 * lease, so the pane that holds it can answer: an approval belongs to the
		 * tab's conversation rather than to whichever of its panes it was first
		 * shown in. The captured link is unchanged, so an answer is still refused
		 * once the link moves.
		 * @param tabSessionId The tab session.
		 * @param paneId Its pane holding the lease.
		 * @param commandId Its current lease.
		 */
		bindLease: (tabSessionId: TabSessionId, paneId: string, commandId: BrowserCommandId) => {
			for (const entry of pending.values()) {
				if (
					entry.tabSessionId !== tabSessionId ||
					(entry.binding.paneId === paneId && entry.binding.commandId === commandId)
				) {
					continue;
				}
				entry.binding = immutableBinding({ ...entry.binding, paneId, commandId });
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
		 * Settle every approval a tab session was shown, because the session ended:
		 * no pane of the tab came back within its grace. It ends the way an approval
		 * whose browser went ends, so the caller asks again rather than taking the
		 * silence for a refusal.
		 * @param tabSessionId The tab session that ended.
		 */
		endSession: (tabSessionId: TabSessionId) => {
			for (const entry of pending.values()) {
				if (entry.tabSessionId === tabSessionId) {
					terminal(entry, "disconnected", "browser_disconnected");
				}
			}
		},
		/**
		 * Settle every presented approval, because the server or the child is going
		 * away and no answer can arrive.
		 * @param cause Which of the two it is.
		 */
		settleAll: (cause: "server_shutdown" | "child_disconnected") => {
			for (const entry of pending.values()) {
				terminal(entry, cause === "server_shutdown" ? "cancelled" : "disconnected", cause);
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
	type ServerDynamicApprovalOwner,
	type ServerDynamicApprovalOwnerOptions,
	createServerDynamicApprovalOwner,
};
