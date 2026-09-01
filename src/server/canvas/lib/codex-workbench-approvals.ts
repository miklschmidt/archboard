import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserDisconnectReason,
	BrowserDynamicApprovalActions,
} from "../../codex-workbench/index.js";
import {
	createCodexBrowserModel,
	type BrowserDynamicApproval,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApprovalResponse,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";

interface DynamicApprovalBinding {
	readonly commandId: BrowserCommandId;
	readonly paneId: string;
	readonly capturedLink: {
		readonly threadId: ThreadId;
		readonly childId: ChildId;
		readonly epoch: ChildEpoch;
	};
}

interface PendingDynamicApproval {
	readonly request: DynamicToolApprovalRequest;
	binding: DynamicApprovalBinding;
	readonly decision: Promise<DynamicToolApprovalDecision>;
	readonly resolve: (decision: DynamicToolApprovalDecision) => void;
	readonly timer: ReturnType<typeof setTimeout>;
	settled: boolean;
}

export interface CanvasDynamicApprovalOwner {
	readonly port: DynamicToolApprovalPort;
	readonly browser: BrowserDynamicApprovalActions;
	/** Rebind pending presentation to the exact current lease for its pane. */
	readonly bindLease: (paneId: string, commandId: BrowserCommandId) => void;
	readonly subscribe: (listener: () => void) => () => void;
	readonly settleAll: (cause: "host_shutdown" | "child_disconnected") => void;
}

export interface CanvasDynamicApprovalOwnerOptions {
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	readonly bindingForCaller: (threadId: ThreadId) => DynamicApprovalBinding;
}

function keyFor(request: Pick<DynamicToolApprovalRequest, "identity" | "effectHash">): string {
	return JSON.stringify([request.identity, request.effectHash]);
}

/** One real visual-approval owner shared by the dispatcher and browser gateway. */
export function createCanvasDynamicApprovalOwner(
	options: CanvasDynamicApprovalOwnerOptions,
): CanvasDynamicApprovalOwner {
	const model = createCodexBrowserModel(options.identity);
	const browserEffect = (request: DynamicToolApprovalRequest): BrowserDynamicApprovalEffect => {
		const effect = request.effect;
		if (effect.tool === "create_thread")
			return model.BrowserDynamicApprovalEffectSchema.parse({
				tool: effect.tool,
				arguments: effect.arguments,
				target: null,
				effectiveBoundary: effect.effectiveBoundary,
				mutationOperationId: effect.mutationOperationId,
				initialTurnOperationId: effect.initialTurnOperationId,
				visualSummary: effect.visualSummary,
			});
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: effect.arguments,
			target: effect.arguments.threadId,
			effectiveBoundary: effect.effectiveBoundary,
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});
	};
	const pending = new Map<string, PendingDynamicApproval>();
	const decisions = new Map<string, DynamicToolApprovalDecision>();
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of listeners) listener();
	};
	const terminal = (
		entry: PendingDynamicApproval,
		outcome: DynamicToolApprovalDecision["outcome"],
		cause: DynamicToolApprovalDecision["cause"],
	): void => {
		if (entry.settled) return;
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
		const key = keyFor(request);
		if (pending.has(key)) throw new Error("The dynamic approval is already pending.");
		let resolve!: (decision: DynamicToolApprovalDecision) => void;
		const decision = new Promise<DynamicToolApprovalDecision>((next) => {
			resolve = next;
		});
		const entry: PendingDynamicApproval = {
			request,
			binding: options.bindingForCaller(request.identity.threadId),
			decision,
			resolve,
			settled: false,
			timer: setTimeout(
				() => terminal(entry, "expired", "deadline_reached"),
				Math.max(0, request.expiresAtMs - options.now()),
			),
		};
		entry.timer.unref();
		pending.set(key, entry);
		notify();
	};
	const toBrowser = (entry: PendingDynamicApproval): BrowserDynamicApproval =>
		model.BrowserDynamicApprovalSchema.parse({
			kind: "dynamic_approval",
			state: "pending",
			identity: entry.request.identity,
			effect: browserEffect(entry.request),
			effectHash: entry.request.effectHash,
			createdAtMs: entry.request.createdAtMs,
			expiresAtMs: entry.request.expiresAtMs,
			decision: null,
			delivery: null,
			toolResult: null,
			binding: entry.binding,
			resumable: false,
		});
	const port: DynamicToolApprovalPort = Object.freeze({
		presentImmutableRequest: present,
		awaitOneExactVisualDecision: (request: DynamicToolApprovalRequest) => {
			const entry = pending.get(keyFor(request));
			if (entry === undefined) throw new Error("The exact dynamic approval is not pending.");
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
				if (JSON.stringify(prior) !== JSON.stringify(decision))
					throw new Error("The dynamic approval already has a different terminal decision.");
				return;
			}
			const entry = pending.get(key);
			if (entry === undefined) throw new Error("The exact dynamic approval was never presented.");
			terminal(entry, decision.outcome, decision.cause);
		},
	});
	const browser: BrowserDynamicApprovalActions = Object.freeze({
		pending: () => Object.freeze([...pending.values()].map(toBrowser)),
		resolve: async (
			command: BrowserDynamicApprovalResponse,
			_context: BrowserActionContext,
		): Promise<BrowserActionResult> => {
			const entry = pending.get(JSON.stringify([command.identity, command.effectHash]));
			if (entry === undefined) throw new Error("The dynamic approval is no longer pending.");
			const response = model.parsePendingDynamicApprovalResponse(toBrowser(entry), command);
			terminal(
				entry,
				response.decision === "approve" ? "approved" : "declined",
				response.decision === "approve" ? "person_approved" : "person_declined",
			);
			return { outcome: "delivered" };
		},
		onBrowserDisconnect: (context: BrowserActionContext, _reason: BrowserDisconnectReason) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId === context.paneId)
					terminal(entry, "disconnected", "browser_disconnected");
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
		bindLease: (paneId: string, commandId: BrowserCommandId) => {
			for (const entry of pending.values()) {
				if (entry.binding.paneId !== paneId || entry.binding.commandId === commandId) continue;
				entry.binding = Object.freeze({ ...entry.binding, commandId });
			}
		},
		subscribe: browser.onChange!,
		settleAll: (cause: "host_shutdown" | "child_disconnected") => {
			for (const entry of pending.values())
				terminal(entry, cause === "host_shutdown" ? "cancelled" : "disconnected", cause);
		},
	});
}
