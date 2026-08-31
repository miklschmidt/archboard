import {
	createCodexCoordinatorCallbacks,
	type CoordinatorCallback,
	type CoordinatorCallbackCurrent,
	type CoordinatorCallbackOptions,
} from "../index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
	type LogicalToolCallCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type AppendTextRequest,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createSemanticContextPublisher,
	type PaneFocusEvent,
	type PaneSelectionEvent,
	type SemanticContextInput,
	type SemanticContextPublisher,
	type SettledChangeSourceEvent,
	type SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import type { ThreadLinkSnapshot } from "../../codex-thread-link/index.js";
import type { WorkhorseOperationEvent } from "../../codex-workhorse-operations/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";

export interface Identities {
	readonly authorities: IdentityAuthorities;
	readonly child: IdentityAuthorities["identity"]["validator"]["childId"];
	readonly epoch: IdentityAuthorities["identity"]["validator"]["epoch"];
	readonly coordinator: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptThreadId"]>;
	readonly workhorse: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptThreadId"]>;
	readonly turn: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptTurnId"]>;
	readonly call: LogicalToolCallCorrelation;
	readonly wireSessionId: ReturnType<
		IdentityAuthorities["identity"]["issuer"]["mintRealtimeSessionId"]
	>;
	readonly browserSessionId: ReturnType<typeof parseRealtimeSessionId>;
	readonly browserCorrelationId: ReturnType<typeof parseRealtimeCorrelationId>;
}

export function identities(): Identities {
	const authorities = createIdentityAuthorities();
	const identity = authorities.identity;
	const coordinator = identity.decoder.adoptThreadId("coordinator");
	const workhorse = identity.decoder.adoptThreadId("workhorse");
	const turn = identity.decoder.adoptTurnId("coordinator-turn");
	const call = identity.decoder.createLogicalToolCallCorrelation({
		threadId: coordinator,
		turnId: turn,
		callId: identity.decoder.adoptDynamicToolCallId("callback-call"),
		namespace: "archboard_app",
		tool: "delegate_to_workhorse",
		manifestHash: "manifest-hash",
	});
	return {
		authorities,
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		coordinator,
		workhorse,
		turn,
		call,
		wireSessionId: identity.issuer.mintRealtimeSessionId(),
		browserSessionId: parseRealtimeSessionId("browser-session"),
		browserCorrelationId: parseRealtimeCorrelationId("browser-correlation"),
	};
}

function executableLink(ids: Identities): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: ids.child,
		epoch: ids.epoch,
		threadId: ids.workhorse,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

function currentFor(ids: Identities, active = true): CoordinatorCallbackCurrent {
	return {
		childId: ids.child,
		epoch: ids.epoch,
		coordinatorThreadId: ids.coordinator,
		link: executableLink(ids),
		realtime: active
			? {
					wireSessionId: ids.wireSessionId,
					correlation: {
						sessionId: ids.browserSessionId,
						correlationId: ids.browserCorrelationId,
					},
				}
			: null,
	};
}

export type CallbackSourceType = WorkhorseOperationEvent["type"];

export function operationEvent(
	ids: Identities,
	type: CallbackSourceType,
	operation:
		| "delegate_to_workhorse"
		| "manage_workhorse_queue"
		| "steer_workhorse" = "delegate_to_workhorse",
): WorkhorseOperationEvent {
	const queueOperation = operation === "manage_workhorse_queue" ? ("add" as const) : null;
	const rpc =
		operation === "manage_workhorse_queue"
			? ("thread/queue/add" as const)
			: operation === "steer_workhorse"
				? ("turn/steer" as const)
				: ("turn/start" as const);
	const queuedSubmissionId = ids.authorities.identity.decoder.adoptQueuedSubmissionId("queue-1");
	const base = {
		operation,
		queueOperation,
		rpc,
		correlation: {
			operationId: ids.authorities.operation.issuer.mintOperationId(),
			childId: ids.child,
			epoch: ids.epoch,
			coordinatorThreadId: ids.coordinator,
			coordinatorTurnId: ids.turn,
			workhorseThreadId: ids.workhorse,
			coordinatorCall: ids.call,
			clientUserMessageId: "client-message",
			queuedSubmissionId: queueOperation === null ? null : queuedSubmissionId,
			turnId: operation === "manage_workhorse_queue" ? null : ids.turn,
		},
		queuedSubmissionIds: queueOperation === null ? [] : [queuedSubmissionId],
		detail: "callback detail",
	};
	if (type === "accepted") return Object.freeze({ ...base, type, outcome: "pending" });
	if (type === "failed") return Object.freeze({ ...base, type, outcome: "not_delivered" });
	if (type === "outcome_unknown")
		return Object.freeze({ ...base, type, outcome: "outcome_unknown" });
	return Object.freeze({ ...base, type, outcome: "delivered" });
}

function semanticInput(
	ids: Identities,
	wireSessionId: Identities["wireSessionId"] | null,
	selection: readonly string[] = ["element-a", "element-b"],
): SemanticContextInput {
	return {
		repository: "archboard",
		child: { id: ids.child, epoch: ids.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: ids.workhorse, turnId: ids.turn },
		coordinator: { threadId: ids.coordinator, realtimeSessionId: wireSessionId },
		board: { key: "architecture", note: "boards/architecture.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		selection,
		claim: { holder: "human", doing: "mapping the boundary" },
		doing: "mapping the boundary",
		cursor: { feedId: "feed-1", sequence: 7 },
		description: "The architecture board contains the coordinator boundary.",
		ambiguity: [],
	};
}

export interface SemanticSources {
	readonly publisher: SemanticContextPublisher;
	readonly change: SettledSemanticChangeEvent;
	readonly focus: PaneFocusEvent;
	readonly selection: PaneSelectionEvent;
	readonly nextFocus: () => PaneFocusEvent;
	readonly dispose: () => void;
}

export function semanticSources(
	ids: Identities,
	wireSessionId: Identities["wireSessionId"] | null,
): SemanticSources {
	let now = 1_700_000_000_000;
	let changeListener: ((event: SettledSemanticChangeEvent) => void) | null = null;
	const feedListeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const feed = {
		onChange(listener: (event: SettledChangeSourceEvent) => void) {
			feedListeners.add(listener);
			return () => feedListeners.delete(listener);
		},
	};
	const input = semanticInput(ids, wireSessionId);
	const publisher = createSemanticContextPublisher({
		feed,
		feedId: "feed-1",
		fresh: { read: () => input },
		contextForChange: (event) => ({
			...input,
			board: { ...input.board, version: event.cursor },
			cursor: { feedId: "feed-1", sequence: event.cursor },
		}),
		now: () => now,
	});
	publisher.subscribeSettledChange((event) => {
		changeListener?.(event);
	});
	let change: SettledSemanticChangeEvent | null = null;
	changeListener = (event) => {
		change = event;
	};
	const focus = publisher.publishPaneFocus(input);
	const selection = publisher.publishPaneSelection({ ...input, selection: ["element-c"] });
	for (const listener of feedListeners)
		listener({
			cursor: 7,
			board: "architecture",
			at: new Date(now).toISOString(),
			origin: "human",
			significance: "structural",
			text: "A person settled a structural change.",
		});
	if (change === null) throw new Error("semantic change fixture did not publish");
	return {
		publisher,
		change,
		focus,
		selection,
		nextFocus: () => {
			now += 1;
			return publisher.publishPaneFocus({ ...input, pane: { paneId: "pane-a", focused: false } });
		},
		dispose: () => publisher.dispose(),
	};
}

export function contextFor(
	callback: CoordinatorCallback,
	current: CoordinatorCallbackCurrent,
): ArchboardContext {
	const semantic = callback.kind === "semantic" ? callback.semantic : null;
	const target = callback.correlation;
	const operation: ArchboardContext["operation"] =
		callback.kind === "operation" && callback.operation !== "manage_workhorse_queue"
			? {
					id: target.operationId!,
					kind: callback.operation,
					rpc: callback.rpc as "turn/start" | "turn/steer",
					outcome: callback.outcome === "pending" ? null : callback.outcome,
				}
			: { id: null, kind: null, rpc: null, outcome: null };
	const capturedAtMs = semantic?.capturedAtMs ?? 0;
	return {
		schema: 1,
		paneId: semantic?.paneId ?? "pane-a",
		board: {
			note: "boards/architecture.md",
			version: 7,
			cursor:
				semantic?.sequence == null ? "operation-cursor" : `${semantic.feedId}:${semantic.sequence}`,
		},
		threadLink: { state: "executable", reason: null },
		child: { id: current.childId, epoch: current.epoch },
		workhorse: { threadId: target.workhorseThreadId, turnId: target.turnId },
		coordinator: {
			threadId: current.coordinatorThreadId,
			realtimeSessionId: current.realtime?.wireSessionId ?? null,
		},
		semantic: {
			brief: semantic?.brief ?? "operation callback context",
			capturedAtMs,
			freshUntilMs: capturedAtMs + 30_000,
			truncated: false,
		},
		focus: {
			paneId:
				callback.kind === "semantic" && callback.type === "focus" && semantic?.focused
					? semantic.paneId
					: null,
			capturedAtMs: callback.kind === "semantic" && callback.type === "focus" ? capturedAtMs : 0,
		},
		selection: {
			elementIds: semantic?.selection ? [...semantic.selection] : ["element-a"],
			capturedAtMs:
				callback.kind === "semantic" && callback.type === "selection" ? capturedAtMs : 0,
		},
		claim: { holder: "human", doing: "mapping the boundary" },
		ambiguity: [],
		operation,
	};
}

type AppendMode = "delivered" | "rejected" | "unknown" | "lost" | "mismatched";
type InjectionMode = "delivered" | "rejected" | "unknown";

export interface Harness {
	readonly ids: Identities;
	readonly state: { current: CoordinatorCallbackCurrent | null };
	readonly operations: {
		readonly subscribe: (listener: (event: WorkhorseOperationEvent) => void) => () => boolean;
		readonly emit: (event: WorkhorseOperationEvent) => void;
	};
	readonly semantic: SemanticSources;
	readonly appendRequests: AppendTextRequest[];
	readonly injections: SessionParams<"thread/inject_items">[];
	readonly setAppendMode: (mode: AppendMode) => void;
	readonly setInjectionMode: (mode: InjectionMode) => void;
	readonly setAppendHook: (hook: (() => void) | null) => void;
	readonly setContextHook: (hook: (() => void) | null) => void;
	readonly callbacks: ReturnType<typeof createCodexCoordinatorCallbacks>;
}

export function harness(active = true): Harness {
	const ids = identities();
	const state = { current: currentFor(ids, active) };
	const operationListeners = new Set<(event: WorkhorseOperationEvent) => void>();
	const operations = {
		subscribe(listener: (event: WorkhorseOperationEvent) => void) {
			operationListeners.add(listener);
			return () => operationListeners.delete(listener);
		},
		emit(event: WorkhorseOperationEvent) {
			for (const listener of operationListeners) listener(event);
		},
	};
	const semantic = semanticSources(ids, active ? ids.wireSessionId : null);
	const appendRequests: AppendTextRequest[] = [];
	const injections: SessionParams<"thread/inject_items">[] = [];
	let appendMode: AppendMode = "delivered";
	let injectionMode: InjectionMode = "delivered";
	let appendHook: (() => void) | null = null;
	let contextHook: (() => void) | null = null;
	const realtime: CoordinatorCallbackOptions["realtime"] = {
		appendText: async (request) => {
			appendRequests.push(request);
			appendHook?.();
			if (appendMode === "lost") throw new Error("realtime response lost");
			if (appendMode === "mismatched")
				return {
					sessionId: parseRealtimeSessionId("stale-session"),
					correlationId: parseRealtimeCorrelationId("stale-correlation"),
					outcome: "delivered",
				};
			if (appendMode === "unknown")
				return {
					sessionId: request.sessionId,
					correlationId: request.correlationId,
					outcome: "outcome_unknown",
					reason: "transport_failure",
				};
			if (appendMode === "rejected")
				return {
					sessionId: request.sessionId,
					correlationId: request.correlationId,
					outcome: "not_delivered",
					reason: "rejected",
				};
			return {
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				outcome: "delivered",
			};
		},
	};
	const session: CoordinatorCallbackOptions["session"] = {
		threadInjectItems: async (params) => {
			injections.push(params);
			if (injectionMode === "rejected")
				throw new CodexSessionMutationError(
					"thread/inject_items",
					"not_delivered",
					"injection rejected",
				);
			if (injectionMode === "unknown")
				throw new CodexSessionMutationError(
					"thread/inject_items",
					"outcome_unknown",
					"injection response lost",
				);
			return {};
		},
	};
	const options: CoordinatorCallbackOptions = {
		semantic: semantic.publisher,
		operations,
		realtime,
		session,
		current: () => state.current,
		contextFor: (callback, current) => {
			const context = contextFor(callback, current);
			contextHook?.();
			return context;
		},
	};
	return {
		ids,
		state,
		operations,
		semantic,
		appendRequests,
		injections,
		setAppendMode: (mode) => {
			appendMode = mode;
		},
		setInjectionMode: (mode) => {
			injectionMode = mode;
		},
		setAppendHook: (hook) => {
			appendHook = hook;
		},
		setContextHook: (hook) => {
			contextHook = hook;
		},
		callbacks: createCodexCoordinatorCallbacks(options),
	};
}

export function close(h: Harness): void {
	h.callbacks.dispose();
	h.semantic.dispose();
}
