import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserDisconnectReason,
	BrowserDynamicApprovalActions,
	BrowserProjection,
	BrowserWorkbenchActions,
	CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import {
	createCodexBrowserModel,
	type BrowserDynamicApproval,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApprovalResponse,
	type BrowserQueue,
} from "../../../shared/codex-browser-model/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
	DynamicOperationIdPort,
	DynamicOperationTerminalDisposition,
	DynamicOperationTerminalResult,
	DynamicCallerAuthority,
	DynamicContextAuthority,
	DynamicContextPort,
	DynamicEpochTeardownProof,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineOwner,
	DynamicMutationTerminalProof,
	DynamicToolLifecyclePort,
	DynamicTargetAuthority,
	DynamicThreadAuthorityPort,
	DynamicWaitEvent,
	DynamicWaitOwner,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import type { CodexWaitGraph, WaitOwner } from "../../../runtime/codex-wait-graph/index.js";
import type { DynamicServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import type { CodexEpochStore, EpochOperationRecord } from "../../../runtime/codex-epoch/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
} from "../../../runtime/codex-thread-link/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import type { CodexWorkhorseStart } from "../../../runtime/codex-workhorse-start/index.js";
import type { CodexThreadContextController } from "../../../runtime/codex-thread-context/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";

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
	readonly binding: DynamicApprovalBinding;
	readonly decision: Promise<DynamicToolApprovalDecision>;
	readonly resolve: (decision: DynamicToolApprovalDecision) => void;
	readonly timer: ReturnType<typeof setTimeout>;
	settled: boolean;
}

export interface CanvasDynamicApprovalOwner {
	readonly port: DynamicToolApprovalPort;
	readonly browser: BrowserDynamicApprovalActions;
	readonly subscribe: (listener: () => void) => () => void;
	readonly settleAll: (cause: "host_shutdown" | "child_disconnected") => void;
}

export interface CanvasDynamicApprovalOwnerOptions {
	readonly identity: IdentityAuthorities;
	readonly now: () => number;
	readonly bindingForCaller: (threadId: ThreadId) => DynamicApprovalBinding;
}

/** The shared OperationId authority plus exact once-only terminal disposition. */
export function createCanvasDynamicOperationIdAdapter(
	authority: IdentityAuthorities["operation"],
): DynamicOperationIdPort {
	const terminal = new Map<OperationId, DynamicOperationTerminalResult>();
	return Object.freeze({
		issueCanonicalOperationId: () => authority.issuer.mintOperationId(),
		validateCurrentUnconsumedOperationId: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			if (terminal.has(operationId)) throw new Error("The OperationId is already terminal.");
		},
		serializeForOwnedWireFields: (operationId: OperationId) =>
			authority.decoder.serializeOperationId(operationId),
		terminalizeCanonicalOperationId: (input: {
			readonly operationId: OperationId;
			readonly disposition: DynamicOperationTerminalDisposition;
		}) => {
			authority.validator.assertCurrentOperationId(input.operationId);
			const prior = terminal.get(input.operationId);
			if (prior !== undefined) {
				if (prior.disposition !== input.disposition)
					throw new Error("The OperationId already has a different terminal disposition.");
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
		readCanonicalOperationTerminalResult: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			return terminal.get(operationId) ?? null;
		},
	});
}

function waitOwner(owner: DynamicWaitOwner): WaitOwner {
	return {
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	};
}

function quarantineKey(identity: DynamicMutationQuarantineIdentity): string {
	return JSON.stringify([identity.child, identity.epoch, identity.callId]);
}

export interface CanvasDynamicLifecycleOwnerOptions {
	readonly waitGraph: CodexWaitGraph;
	readonly waitForTargets: (input: {
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
	}) => Promise<DynamicWaitEvent>;
	readonly shutdownEpoch: (child: ChildId, epoch: ChildEpoch) => Promise<DynamicEpochTeardownProof>;
	readonly onFatal: (fault: DynamicFatalLifecycleFault) => void;
}

export interface CanvasDynamicLifecycleOwner {
	readonly port: DynamicToolLifecyclePort;
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	readonly shutdown: () => Promise<void>;
}

/** Exact executing-call and wait/quarantine owner for the dynamic dispatcher. */
export function createCanvasDynamicLifecycleOwner(
	options: CanvasDynamicLifecycleOwnerOptions,
): CanvasDynamicLifecycleOwner {
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
		assertCallExecuting: (input: {
			readonly request: DynamicServerRequest;
			readonly caller: DynamicCallerAuthority;
		}) => {
			if (stopped || !input.caller.executing || input.caller.status !== "active")
				throw new Error("The logical dynamic call is no longer executing.");
		},
		registerWaitOwner: ({ owner }: { readonly owner: DynamicWaitOwner }) => {
			const result = options.waitGraph.addEdgeSet({
				owner: waitOwner(owner),
				targets: owner.sortedTargetThreadIds,
			});
			if (!result.ok)
				throw new Error(`The wait owner would create a cycle: ${result.cycle.join(" -> ")}`);
		},
		releaseWaitOwner: ({
			owner,
			cause,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwner"]>[0]) => {
			options.waitGraph.release({ owner: waitOwner(owner), cause });
		},
		releaseWaitOwnersForChild: ({
			child,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwnersForChild"]>[0]) => {
			options.waitGraph.release({ cause: "child-exit", child });
		},
		poisonEpochAndOwnMutationQuarantine: ({
			identity,
			retryTerminalization,
		}: Parameters<DynamicToolLifecyclePort["poisonEpochAndOwnMutationQuarantine"]>[0]) => {
			const key = quarantineKey(identity);
			const prior = quarantines.get(key);
			if (prior !== undefined) return prior.owner;
			let resolveExit!: () => void;
			const childExit = new Promise<{
				readonly child: ChildId;
				readonly epoch: ChildEpoch;
				readonly exited: true;
			}>((resolve) => {
				resolveExit = () => resolve({ child: identity.child, epoch: identity.epoch, exited: true });
			});
			const owner = Object.freeze({
				child: identity.child,
				epoch: identity.epoch,
				poisoned: true as const,
				childExit,
			});
			quarantines.set(key, {
				identity,
				retry: retryTerminalization,
				owner,
				resolveExit,
			});
			return owner;
		},
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
		waitForTargets: options.waitForTargets,
	});
	const childExit = async (child: ChildId, epoch: ChildEpoch): Promise<void> => {
		for (const entry of quarantines.values()) {
			if (entry.identity.child !== child || entry.identity.epoch !== epoch) continue;
			try {
				await entry.retry();
			} finally {
				entry.resolveExit();
				quarantines.delete(quarantineKey(entry.identity));
			}
		}
		options.waitGraph.release({ cause: "child-exit", child });
	};
	return Object.freeze({
		port,
		childExit,
		shutdown: async () => {
			if (stopped) return;
			stopped = true;
			const exits = new Map<string, { child: ChildId; epoch: ChildEpoch }>();
			for (const entry of quarantines.values())
				exits.set(`${entry.identity.child}:${entry.identity.epoch}`, {
					child: entry.identity.child,
					epoch: entry.identity.epoch,
				});
			for (const exit of exits.values()) await childExit(exit.child, exit.epoch);
		},
	});
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
		subscribe: browser.onChange!,
		settleAll: (cause: "host_shutdown" | "child_disconnected") => {
			for (const entry of pending.values())
				terminal(entry, cause === "host_shutdown" ? "cancelled" : "disconnected", cause);
		},
	});
}

export interface CanvasDynamicAuthorityOptions {
	readonly identity: IdentityAuthorities;
	readonly epoch: Pick<CodexEpochStore, "snapshot">;
	readonly threadLink: Pick<CodexThreadLinkPort, "classify" | "read">;
	readonly paneIds: () => readonly string[];
	readonly contextFor: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly authority: DynamicContextAuthority;
		readonly operationId: OperationId;
		readonly kind:
			| "create_thread_initial_turn"
			| "fork_thread_initial_turn"
			| "send_message_to_thread";
		readonly targetThreadId?: ThreadId;
	}) => Promise<ArchboardContext> | ArchboardContext;
}

export interface CanvasDynamicAuthorityAdapters {
	readonly thread: DynamicThreadAuthorityPort;
	readonly context: DynamicContextPort;
	readonly paneForThread: (threadId: ThreadId) => string | null;
	readonly dispose: () => void;
}

function latestThreadRecord(
	epoch: Pick<CodexEpochStore, "snapshot">,
	threadId: ThreadId,
): EpochOperationRecord | null {
	return (
		epoch
			.snapshot()
			.manifest.records.findLast(
				(record) => record.status === "committed" && record.provenance.threadId === threadId,
			) ?? null
	);
}

/** Exact caller/target and pane-context authority over live link and epoch evidence. */
export function createCanvasDynamicAuthorityAdapters(
	options: CanvasDynamicAuthorityOptions,
): CanvasDynamicAuthorityAdapters {
	const issuer = createDynamicAuthorityTokenIssuer();
	const tokens = new Map<string, ReturnType<typeof issuer.issue>>();
	const callerCalls = new Map<
		ReturnType<typeof issuer.issue>,
		DynamicServerRequest["logicalCall"]
	>();
	const tokenFor = (key: string): ReturnType<typeof issuer.issue> => {
		const prior = tokens.get(key);
		if (prior !== undefined && issuer.owns(prior)) return prior;
		const issued = issuer.issue();
		tokens.set(key, issued);
		return issued;
	};
	const paneForThread = (threadId: ThreadId): string | null => {
		for (const paneId of options.paneIds()) {
			const binding = options.threadLink.read(paneId);
			if (binding.link.state === "executable" && binding.link.threadId === threadId) return paneId;
		}
		return null;
	};
	const targetFacts = async (
		threadId: ThreadId,
	): Promise<{
		readonly classification: ThreadLinkClassification;
		readonly base: Omit<DynamicTargetAuthority, "authority" | "role" | "linkClassification">;
	}> => {
		const record = latestThreadRecord(options.epoch, threadId);
		const threadLinkTarget = {
			threadId,
			childId: record?.correlation.childId ?? null,
			epoch: record?.correlation.epoch ?? null,
			operationId: record?.operation.id,
			provenance: record,
		};
		const classification = await options.threadLink.classify(threadLinkTarget);
		if (classification.thread === null) throw new Error("The exact thread is not observable.");
		const activeEpoch = options.epoch.snapshot().manifest.activeEpoch;
		const epochState =
			record === null
				? "unknown"
				: activeEpoch?.childId === record.correlation.childId &&
					  activeEpoch.epoch === record.correlation.epoch
					? "current"
					: "prior";
		return {
			classification,
			base: {
				threadId,
				wireThreadId: String(threadId),
				childId: record?.correlation.childId ?? null,
				epoch: record?.correlation.epoch ?? null,
				epochState,
				ownership:
					record === null
						? "foreign"
						: record.operation.kind === "attached"
							? "attached"
							: "created",
				loaded: classification.observation.loaded,
				directInput: classification.observation.canAcceptDirectInput,
				status: classification.observation.status,
				source: classification.observation.source,
				provenance: classification.proof,
				threadLinkTarget,
			},
		};
	};
	const resolveCaller = async (request: DynamicServerRequest): Promise<DynamicCallerAuthority> => {
		options.identity.identity.validator.assertCurrentEpoch(request.child, request.epoch);
		const facts = await targetFacts(request.logicalCall.threadId);
		if (
			facts.base.ownership !== "created" ||
			facts.base.epochState !== "current" ||
			facts.base.childId === null ||
			facts.base.epoch === null
		)
			throw new Error("The dynamic caller is not in the current child epoch.");
		const turn = facts.classification.thread?.turns.find(
			(candidate) => candidate.id === request.logicalCall.turnId,
		);
		const call = turn?.items.find(
			(item) =>
				item.type === "dynamicToolCall" && String(item.id) === String(request.logicalCall.callId),
		);
		if (
			facts.base.status !== "active" ||
			call?.type !== "dynamicToolCall" ||
			call.status !== "inProgress" ||
			call.namespace !== request.logicalCall.namespace ||
			call.tool !== request.logicalCall.tool
		)
			throw new Error("The exact logical dynamic call is not executing.");
		const authority = tokenFor(`caller:${JSON.stringify(request.logicalCall)}`);
		callerCalls.set(authority, request.logicalCall);
		return Object.freeze({
			...facts.base,
			childId: facts.base.childId,
			epoch: facts.base.epoch,
			authority,
			linkClassification: facts.classification,
			role: "caller",
			turnId: request.logicalCall.turnId,
			wireTurnId: String(request.logicalCall.turnId),
			executing: true,
		});
	};
	const classifyTarget = async (
		caller: DynamicCallerAuthority,
		value: unknown,
	): Promise<DynamicTargetAuthority> => {
		const threadId = options.identity.identity.decoder.adoptThreadId(value);
		const facts = await targetFacts(threadId);
		return Object.freeze({
			...facts.base,
			authority: tokenFor(`target:${caller.authority}:${String(threadId)}`),
			linkClassification: facts.classification,
			role: "target",
		});
	};
	const thread: DynamicThreadAuthorityPort = Object.freeze({
		resolveExactLogicalCaller: (
			input: Parameters<DynamicThreadAuthorityPort["resolveExactLogicalCaller"]>[0],
		) => resolveCaller(input.request),
		classifyExactTarget: (
			input: Parameters<DynamicThreadAuthorityPort["classifyExactTarget"]>[0],
		) => classifyTarget(input.caller, input.threadId),
		resolveExactTurnBoundary: async (
			input: Parameters<DynamicThreadAuthorityPort["resolveExactTurnBoundary"]>[0],
		) => {
			const { caller, target, requestedBeforeTurnId, relation } = input;
			if (relation === "self") return caller.turnId;
			if (requestedBeforeTurnId === null) return null;
			const turnId = options.identity.identity.decoder.adoptTurnId(requestedBeforeTurnId);
			const found = target.linkClassification?.thread?.turns.find(
				(candidate) => candidate.id === turnId,
			);
			if (found === undefined)
				throw new Error("The requested fork boundary is not in the target thread.");
			return found.id;
		},
		revalidateCaller: async (caller: DynamicCallerAuthority) => {
			if (!issuer.owns(caller.authority)) throw new Error("The caller authority was retired.");
			const logicalCall = callerCalls.get(caller.authority);
			if (logicalCall === undefined) throw new Error("The caller authority has no logical call.");
			const facts = await targetFacts(caller.threadId);
			if (
				facts.base.ownership !== "created" ||
				facts.base.epochState !== "current" ||
				facts.base.childId === null ||
				facts.base.epoch === null
			)
				throw new Error("The dynamic caller left its current child epoch.");
			const turn = facts.classification.thread?.turns.find(
				(candidate) => candidate.id === logicalCall.turnId,
			);
			const call = turn?.items.find(
				(item) => item.type === "dynamicToolCall" && String(item.id) === String(logicalCall.callId),
			);
			if (
				facts.base.status !== "active" ||
				call?.type !== "dynamicToolCall" ||
				call.status !== "inProgress" ||
				call.namespace !== logicalCall.namespace ||
				call.tool !== logicalCall.tool
			)
				throw new Error("The exact logical dynamic call is no longer executing.");
			return Object.freeze({
				...caller,
				...facts.base,
				childId: facts.base.childId,
				epoch: facts.base.epoch,
				linkClassification: facts.classification,
			});
		},
		revalidateTarget: async (target: DynamicTargetAuthority) => {
			if (!issuer.owns(target.authority)) throw new Error("The target authority was retired.");
			const facts = await targetFacts(target.threadId);
			return Object.freeze({ ...target, ...facts.base, linkClassification: facts.classification });
		},
	});
	const context: DynamicContextPort = Object.freeze({
		issueAndRevalidatePaneLinkAuthority: (
			input: Parameters<DynamicContextPort["issueAndRevalidatePaneLinkAuthority"]>[0],
		) => {
			const { caller, existing } = input;
			const paneId = paneForThread(caller.threadId);
			if (paneId === null) throw new Error("The dynamic caller has no executable pane binding.");
			if (existing !== undefined) {
				if (!issuer.owns(existing.token) || existing.paneId !== paneId)
					throw new Error("The pane context authority is stale.");
				return existing;
			}
			return Object.freeze({
				token: tokenFor(`context:${caller.authority}:${paneId}`),
				paneId,
				childId: caller.childId,
				epoch: caller.epoch,
				threadId: caller.threadId,
				turnId: caller.turnId,
			});
		},
		readOneFreshArchboardContext: async (
			input: Parameters<DynamicContextPort["readOneFreshArchboardContext"]>[0],
		) => {
			if (!issuer.owns(input.authority.token))
				throw new Error("The context authority was retired.");
			if (paneForThread(input.caller.threadId) !== input.authority.paneId)
				throw new Error("The pane link changed before context capture.");
			return await options.contextFor(input);
		},
	});
	return Object.freeze({
		thread,
		context,
		paneForThread,
		dispose: () => {
			issuer.retireAll();
			tokens.clear();
			callerCalls.clear();
		},
	});
}

/** Adopt only the exact ready workhorse snapshot and its captured link CAS proof. */
export function bindThreadContextToReadyWorkhorse(
	workhorse: Pick<CodexWorkhorseStart, "snapshot">,
	controller: Pick<CodexThreadContextController, "snapshot" | "compareAndSwap">,
): void {
	const snapshot = workhorse.snapshot();
	if (
		snapshot.state !== "ready" ||
		snapshot.paneId === null ||
		snapshot.threadId === null ||
		snapshot.childId === null ||
		snapshot.epoch === null ||
		snapshot.operationId === null ||
		snapshot.binding?.link.state !== "executable"
	)
		throw new Error("Thread context can bind only to an exact ready workhorse snapshot.");
	controller.compareAndSwap({
		expected: controller.snapshot().token,
		next: {
			paneId: snapshot.paneId,
			target: {
				threadId: snapshot.threadId,
				childId: snapshot.childId,
				epoch: snapshot.epoch,
				operationId: snapshot.operationId,
			},
			link: snapshot.binding,
		},
	});
}

export interface CanvasBrowserBindingState {
	readiness: BrowserProjection["readiness"];
	account: BrowserProjection["account"];
	login: BrowserProjection["login"];
	queue: BrowserQueue;
}

/** Closed browser projection/actions over the already-created runtime owners. */
export function createCanvasBrowserGatewayOptions(input: {
	readonly components: Omit<CodexWorkbenchComponents, "gateway">;
	readonly dynamicApprovals: CanvasDynamicApprovalOwner;
	readonly state: CanvasBrowserBindingState;
	readonly onChange: (listener: () => void) => () => void;
}): Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink"> {
	const { components, dynamicApprovals, state } = input;
	const model = createCodexBrowserModel(components.identity);
	const queueProjection = (queue: readonly SessionQueuedSubmission[]): BrowserQueue =>
		model.BrowserQueueSchema.parse({
			kind: "queue",
			status: queue.length === 0 ? "empty" : "queued",
			entries: queue.map((entry) => {
				const textInput = entry.input.find((item) => item.type === "text");
				return {
					submissionId: entry.id,
					prompt: textInput?.type === "text" ? textInput.text : "[non-text input]",
					status: "queued",
					operationId: null,
				};
			}),
		});
	const updateQueue = <Result extends { readonly queue: readonly SessionQueuedSubmission[] }>(
		result: Result,
	): Result => {
		state.queue = queueProjection(result.queue);
		return result;
	};
	const issueOperation = (): OperationId => components.identity.operation.issuer.mintOperationId();
	// Kept beside the action table so every mutation returns the same browser outcome shape.
	// eslint-disable-next-line unicorn/consistent-function-scoping
	const run = async (operation: () => Promise<unknown>): Promise<BrowserActionResult> => {
		await operation();
		return { outcome: "delivered" };
	};
	// Kept beside the actions whose lease evidence it projects.
	// eslint-disable-next-line unicorn/consistent-function-scoping
	const expectedLink = (context: BrowserActionContext) => ({
		revision: context.linkRevision,
		paneId: context.paneId,
		childId: context.link.childId,
		epoch: context.link.epoch,
		threadId: context.link.threadId,
	});
	const actions: BrowserWorkbenchActions = {
		account: {
			read: async () => {
				const result = await components.session.accountRead();
				state.account =
					result.account === null
						? { kind: "account", state: "signed_out" }
						: { kind: "account", state: "ready", accountType: result.account.type };
				state.readiness =
					result.account === null
						? { kind: "readiness", state: "signed_out" }
						: { kind: "readiness", state: "thread_capable" };
				if (components.workhorse.snapshot().state === "ready")
					updateQueue(await components.queue.list());
				return { outcome: "delivered" };
			},
			login: async (command) => {
				const result = await components.session.accountLogin(command.login);
				if ("loginId" in result) {
					state.login = {
						kind: "login",
						state: "pending",
						loginId: result.loginId,
						variant: command.login.type,
					};
					state.account = {
						kind: "account",
						state: "login_pending",
						loginId: result.loginId,
						variant: command.login.type,
					};
					state.readiness = {
						kind: "readiness",
						state: "login_pending",
						loginId: result.loginId,
					};
				}
				return { outcome: "delivered" };
			},
			loginCancel: (command) =>
				run(async () => {
					await components.session.accountLoginCancel({ loginId: command.loginId });
					state.login = { kind: "login", state: "cancelled", loginId: command.loginId };
				}),
			logout: () =>
				run(async () => {
					await components.session.accountLogout();
					state.account = { kind: "account", state: "signed_out" };
					state.readiness = { kind: "readiness", state: "signed_out" };
				}),
		},
		threadLinks: {
			create: async (_command, context) => {
				await components.workhorse.start({
					paneId: context.paneId,
					expected: expectedLink(context),
				});
				bindThreadContextToReadyWorkhorse(components.workhorse, components.semanticDelivery);
				return { outcome: "delivered" };
			},
			attach: async (command, context) => {
				await components.threadLink.classifyAndBind(context.paneId, expectedLink(context), {
					threadId: command.threadId,
					childId: context.childId,
					epoch: context.epoch,
				});
				return { outcome: "delivered" };
			},
			relink: async (command, context) => {
				await components.threadLink.classifyAndBind(context.paneId, expectedLink(context), {
					threadId: command.threadId,
					childId: context.childId,
					epoch: context.epoch,
				});
				return { outcome: "delivered" };
			},
		},
		text: {
			start: (command) =>
				run(() =>
					components.session.turnStart({
						threadId: command.threadId,
						input: [{ type: "text", text: command.prompt, text_elements: [] }],
					}),
				),
			steer: (command) =>
				run(() =>
					components.session.turnSteer({
						threadId: command.threadId,
						expectedTurnId: command.turnId,
						clientUserMessageId: String(command.commandId),
						input: [{ type: "text", text: command.prompt, text_elements: [] }],
						additionalContext: {},
					}),
				),
			interrupt: (command) =>
				run(() =>
					components.session.turnInterrupt({
						threadId: command.threadId,
						turnId: command.turnId,
					}),
				),
		},
		queue: {
			add: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.add({ operationId: issueOperation(), prompt: command.prompt }),
						),
				),
			update: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.update({
								operationId: issueOperation(),
								submissionId: command.submissionId,
								prompt: command.prompt,
							}),
						),
				),
			delete: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.delete({
								operationId: issueOperation(),
								submissionId: command.submissionId,
							}),
						),
				),
			reorder: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.reorder({
								operationId: issueOperation(),
								orderedSubmissionIds: command.orderedSubmissionIds,
							}),
						),
				),
			start: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.start({
								operationId: issueOperation(),
								submissionId: command.submissionId,
							}),
						),
				),
		},
		realtime: {
			start: (command) =>
				run(() =>
					components.realtime.createOffer({
						sessionId: parseRealtimeSessionId(String(command.commandId)),
						correlationId: parseRealtimeCorrelationId(String(command.commandId)),
						sdp: command.sdp,
					}),
				),
			appendText: (command) =>
				run(() =>
					components.realtime.appendText({
						sessionId: parseRealtimeSessionId(String(command.commandId)),
						correlationId: parseRealtimeCorrelationId(String(command.commandId)),
						text: command.text,
					}),
				),
			stop: (command) =>
				run(() =>
					components.realtime.stop({
						sessionId: parseRealtimeSessionId(String(command.commandId)),
						correlationId: parseRealtimeCorrelationId(String(command.commandId)),
					}),
				),
		},
		ordinaryApprovals: {
			pending: (requestId) => {
				try {
					return components.approvals.toBrowserApproval(requestId);
				} catch {
					return null;
				}
			},
			resolve: (command) =>
				run(() =>
					components.approvals.resolve({
						requestId: command.requestId,
						approvalId: command.approvalId,
						response: command.response,
					}),
				),
		},
		dynamicApprovals: dynamicApprovals.browser,
	};
	const projection = {
		read: (): BrowserProjection => {
			const coordinator = components.coordinator.snapshot();
			const workhorse = components.workhorse.snapshot();
			const semantic = components.semanticDelivery.inspect().at(-1);
			const freshSemantic = components.semanticPublisher.freshBrief();
			return {
				readiness: state.readiness,
				account: state.account,
				login: state.login,
				timeline: null,
				queue: state.queue,
				settings: [
					...(workhorse.start === null
						? []
						: [
								model.BrowserSettingsSchema.parse({
									kind: "settings",
									owner: "workhorse",
									model: workhorse.start.model,
									effort: null,
									serviceTier: workhorse.start.serviceTier,
									approvalPolicy: workhorse.start.approvalPolicy,
									approvalsReviewer: workhorse.start.approvalsReviewer,
									sandboxPolicy: workhorse.start.sandbox,
									activePermissionProfile: workhorse.start.activePermissionProfile,
								}),
							]),
					...(coordinator.effective === null ||
					coordinator.approvalPolicy === null ||
					coordinator.approvalsReviewer === null ||
					coordinator.sandboxPolicy === null
						? []
						: [
								model.BrowserSettingsSchema.parse({
									kind: "settings",
									owner: "coordinator",
									model: coordinator.effective.model,
									effort: coordinator.effective.effort,
									serviceTier: coordinator.effective.serviceTier,
									approvalPolicy: coordinator.approvalPolicy,
									approvalsReviewer: coordinator.approvalsReviewer,
									sandboxPolicy: coordinator.sandboxPolicy,
									activePermissionProfile: coordinator.activePermissionProfile,
								}),
							]),
				],
				approvals: components.approvals
					.inspect()
					.flatMap((approval) =>
						approval.state === "pending"
							? [components.approvals.toBrowserApproval(approval.requestId)]
							: [],
					),
				dynamicApprovals: dynamicApprovals.browser.pending(),
				semantic:
					semantic?.targetThreadId === undefined || semantic.targetThreadId === null
						? null
						: {
								kind: "semantic_delivery",
								threadId: semantic.targetThreadId,
								delivery: semantic.outcome,
								capturedAtMs: freshSemantic.freshness.capturedAtMs,
								freshUntilMs: freshSemantic.freshness.freshUntilMs,
								reason: semantic.reason,
							},
				coordinator: {
					kind: "coordinator",
					state: coordinator.state === "inspect_only" ? "failed" : coordinator.state,
					threadId: coordinator.threadId,
					activeTurnId: null,
					model: coordinator.effective?.model ?? null,
					effort: coordinator.effective?.effort ?? null,
					serviceTier: coordinator.effective?.serviceTier ?? null,
					reason: coordinator.reason,
				},
				voice: model.BrowserVoiceSchema.parse({
					kind: "voice",
					state:
						components.realtime.generation() !== null
							? "active"
							: coordinator.state === "ready"
								? "ready"
								: "unavailable",
					realtimeSessionId: components.realtime.generation()?.browserSessionId ?? null,
					transcript: components.realtime.transcript().map((record) => ({
						itemId: record.itemId,
						sequence: record.sequence,
						speaker: record.role,
						text: record.text,
						final: record.status === "final",
					})),
					delivery: null,
					reason: null,
				}),
			};
		},
		onChange: input.onChange,
	};
	return { projection, actions };
}
