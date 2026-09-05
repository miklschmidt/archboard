import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserDisconnectReason,
	BrowserDynamicApprovalActions,
	BrowserDynamicApprovalResponse,
	DynamicApprovalOwnerBinding,
	DynamicApprovalOwnerRequest,
	DynamicApprovalOwnerView,
} from "../../codex-workbench/index.js";
import type {
	BrowserCommandId,
	IdentityAuthorities,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";

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

function ownImmutableRequest(request: DynamicToolApprovalRequest): DynamicApprovalOwnerRequest {
	const owned = structuredClone(request);
	freezeGraph(owned);
	return owned as DynamicApprovalOwnerRequest;
}

/** One real visual-approval owner shared by the dispatcher and browser gateway. */
function createCanvasDynamicApprovalOwner(
	options: CanvasDynamicApprovalOwnerOptions,
): CanvasDynamicApprovalOwner {
	const pending = new Map<string, PendingDynamicApproval>();
	const decisions = new Map<string, DynamicToolApprovalDecision>();
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};
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
		awaitOneExactVisualDecision: (request: DynamicToolApprovalRequest) => {
			const entry = pending.get(keyFor(request));
			if (entry === undefined) {
				throw new Error("The exact dynamic approval is not pending.");
			}
			return entry.decision;
		},
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
		resolve: async (
			command: BrowserDynamicApprovalResponse,
			_context: BrowserActionContext,
		): Promise<BrowserActionResult> => {
			const entry = pending.get(keyFor(command));
			if (entry === undefined) {
				throw new Error("The dynamic approval is no longer pending.");
			}
			if (
				command.commandId !== entry.binding.commandId ||
				command.paneId !== entry.binding.paneId ||
				command.capturedLink.threadId !== entry.binding.capturedLink.threadId ||
				command.capturedLink.childId !== entry.binding.capturedLink.childId ||
				command.capturedLink.epoch !== entry.binding.capturedLink.epoch
			) {
				throw new Error("The dynamic approval binding is stale.");
			}
			terminal(
				entry,
				command.decision === "approve" ? "approved" : "declined",
				command.decision === "approve" ? "person_approved" : "person_declined",
			);
			return { outcome: "delivered" };
		},
		onBrowserDisconnect: (context: BrowserActionContext, _reason: BrowserDisconnectReason) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId === context.paneId) {
					terminal(entry, "disconnected", "browser_disconnected");
				}
			}
		},
		onChange: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	});
	return Object.freeze({
		port,
		browser,
		pending: () =>
			Object.freeze(
				[...pending.values()].map((entry) =>
					Object.freeze({ request: entry.request, binding: entry.binding }),
				),
			),
		bindLease: (paneId: string, commandId: BrowserCommandId) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId !== paneId || entry.binding.commandId === commandId) {
					continue;
				}
				entry.binding = immutableBinding({ ...entry.binding, commandId });
			}
		},
		subscribe: browser.onChange!,
		onNotification: (event: TransportServerNotification) => {
			if (
				event.correlation.child !== options.identity.identity.validator.childId ||
				event.correlation.epoch !== options.identity.identity.validator.epoch
			) {
				return;
			}
			const { method, params } = event.notification;
			for (const entry of pending.values()) {
				const identity = entry.request.identity;
				const threadId = options.identity.identity.decoder.serializeCodexIdentity(
					identity.threadId,
				);
				const turnId = options.identity.identity.decoder.serializeCodexIdentity(identity.turnId);
				if (method === "item/completed") {
					const item = params.item;
					if (
						params.threadId === threadId &&
						params.turnId === turnId &&
						item.type === "dynamicToolCall" &&
						item.id === options.identity.identity.decoder.serializeCodexIdentity(identity.callId)
					) {
						terminal(entry, "cancelled", "call_cancelled");
					}
				} else if (
					method === "turn/completed" &&
					params.threadId === threadId &&
					params.turn.id === turnId &&
					params.turn.status === "interrupted"
				) {
					terminal(entry, "cancelled", "caller_turn_interrupted");
				}
			}
		},
		settleAll: (cause: "host_shutdown" | "child_disconnected") => {
			for (const entry of pending.values()) {
				terminal(entry, cause === "host_shutdown" ? "cancelled" : "disconnected", cause);
			}
		},
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
