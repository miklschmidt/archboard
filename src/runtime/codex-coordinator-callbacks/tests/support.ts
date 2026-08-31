import {
	createCodexCoordinatorCallbacks,
	createCoordinatorCallbackRealtimePort,
	type CoordinatorCallbackCurrentChild,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbackReadyCoordinator,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorCallbackRealtimeRequest,
} from "../index.js";
import { COORDINATOR_CAPABILITY_POLICY } from "../../codex-coordinator/index.js";
import type { EpochExecutionProof, EpochOperationRecord } from "../../codex-epoch/index.js";
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import {
	createSemanticContextPublisher,
	type PaneFocusEvent,
	type PaneSelectionEvent,
	type SemanticContextInput,
	type SemanticContextPublisher,
	type SettledChangeSourceEvent,
	type SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import type { WorkhorseOperationEvent } from "../../codex-workhorse-operations/index.js";
import {
	restoreIdentityAuthorities,
	type IdentityAuthorities,
	type LogicalToolCallCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";

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
	const childId = "archboard:child:h11111111111111111111111111111111";
	const authorities = restoreIdentityAuthorities({
		childId,
		epoch: "archboard:epoch:h11111111111111111111111111111111.h22222222222222222222222222222222",
	});
	const identity = authorities.identity;
	const coordinator = identity.decoder.adoptThreadId("coordinator");
	const workhorse = identity.decoder.adoptThreadId("workhorse");
	const turn = identity.decoder.adoptTurnId("coordinator-turn");
	return {
		authorities,
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		coordinator,
		workhorse,
		turn,
		call: identity.decoder.createLogicalToolCallCorrelation({
			threadId: coordinator,
			turnId: turn,
			callId: identity.decoder.adoptDynamicToolCallId("callback-call"),
			namespace: "archboard_app",
			tool: "delegate_to_workhorse",
			manifestHash: "manifest-hash",
		}),
		wireSessionId: identity.issuer.mintRealtimeSessionId(),
		browserSessionId: parseRealtimeSessionId("browser-session"),
		browserCorrelationId: parseRealtimeCorrelationId("browser-correlation"),
	};
}

function record(ids: Identities): EpochOperationRecord {
	return {
		correlation: { childId: ids.child, epoch: ids.epoch, operationId: "link-operation" },
		operation: { id: "link-operation", kind: "thread_link", rpc: "thread/read" },
		status: "committed",
		outcome: "delivered",
		provenance: {
			childId: ids.child,
			epoch: ids.epoch,
			threadId: ids.workhorse,
			turnId: ids.turn,
			threadSource: "appServer",
			workspaceRoot: "/workspace",
			instructionHash: "instruction-hash",
			manifestHash: "manifest-hash",
			confirmedAtMs: 100,
		},
		reason: null,
		createdAtMs: 90,
		updatedAtMs: 100,
	};
}

function proof(ids: Identities): EpochExecutionProof {
	return { record: record(ids), manifestRevision: 7 };
}

export function link(ids: Identities): CoordinatorCallbackLinkCorrelation {
	const executable = {
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
	} satisfies CoordinatorCallbackLinkCorrelation["binding"]["link"];
	return {
		binding: {
			paneId: "pane-a",
			revision: 4,
			link: executable,
			cas: {
				revision: 4,
				paneId: "pane-a",
				childId: ids.child,
				epoch: ids.epoch,
				threadId: ids.workhorse,
			},
		},
		target: {
			threadId: ids.workhorse,
			childId: ids.child,
			epoch: ids.epoch,
			operationId: "link-operation",
			provenance: proof(ids),
		},
	};
}

function generation(ids: Identities): CoordinatorCallbackRealtimeGeneration {
	return {
		childId: ids.child,
		epoch: ids.epoch,
		coordinatorThreadId: ids.coordinator,
		wireSessionId: ids.wireSessionId,
		browserSessionId: ids.browserSessionId,
		browserCorrelationId: ids.browserCorrelationId,
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
	const queueOperation: WorkhorseOperationEvent["queueOperation"] =
		operation === "manage_workhorse_queue" ? "add" : null;
	const rpc: WorkhorseOperationEvent["rpc"] =
		operation === "manage_workhorse_queue"
			? "thread/queue/add"
			: operation === "steer_workhorse"
				? "turn/steer"
				: "turn/start";
	const queued = ids.authorities.identity.decoder.adoptQueuedSubmissionId("queue-1");
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
			queuedSubmissionId: queueOperation === null ? null : queued,
			turnId: operation === "manage_workhorse_queue" ? null : ids.turn,
		},
		queuedSubmissionIds: queueOperation === null ? [] : [queued],
		detail: "callback detail",
	};
	if (type === "accepted") return Object.freeze({ ...base, type, outcome: "pending" });
	if (type === "failed") return Object.freeze({ ...base, type, outcome: "not_delivered" });
	if (type === "outcome_unknown")
		return Object.freeze({ ...base, type, outcome: "outcome_unknown" });
	return Object.freeze({ ...base, type, outcome: "delivered" });
}

function semanticInput(ids: Identities, active: boolean): SemanticContextInput {
	return {
		repository: "archboard",
		child: { id: ids.child, epoch: ids.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: ids.workhorse, turnId: ids.turn },
		coordinator: {
			threadId: ids.coordinator,
			realtimeSessionId: active ? ids.wireSessionId : null,
		},
		board: { key: "architecture", note: "boards/architecture.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		selection: ["element-a", "element-b"],
		doing: "mapping",
		cursor: { feedId: "feed-1", sequence: 7 },
		description: "Architecture board",
	};
}

export interface SemanticSources {
	readonly publisher: SemanticContextPublisher;
	readonly change: SettledSemanticChangeEvent;
	readonly focus: PaneFocusEvent;
	readonly selection: PaneSelectionEvent;
	readonly dispose: () => void;
}

export function semanticSources(ids: Identities, active: boolean): SemanticSources {
	let change: SettledSemanticChangeEvent | null = null;
	const listeners = new Set<(event: SettledChangeSourceEvent) => void>();
	const input = semanticInput(ids, active);
	const publisher = createSemanticContextPublisher({
		feed: {
			onChange(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		feedId: "feed-1",
		fresh: { read: () => input },
		contextForChange: () => input,
		now: () => 1_700_000_000_000,
	});
	publisher.subscribeSettledChange((event) => {
		change = event;
	});
	const focus = publisher.publishPaneFocus(input);
	const selection = publisher.publishPaneSelection({ ...input, selection: ["element-c"] });
	for (const listener of listeners)
		listener({
			cursor: 7,
			board: "architecture",
			at: "2023-11-14T22:13:20.000Z",
			origin: "human",
			significance: "structural",
			text: "A structural change.",
		});
	if (change === null) throw new Error("semantic fixture failed");
	return { publisher, change, focus, selection, dispose: () => publisher.dispose() };
}

type MutationMode = "delivered" | "rejected" | "lost";

export interface HarnessState {
	child: CoordinatorCallbackCurrentChild | null;
	coordinator: CoordinatorCallbackReadyCoordinator | null;
	link: CoordinatorCallbackLinkCorrelation | null;
	generation: CoordinatorCallbackRealtimeGeneration | null;
	classification: ThreadLinkClassification;
}

export interface Harness {
	readonly ids: Identities;
	readonly state: HarnessState;
	readonly semantic: SemanticSources;
	readonly operations: {
		readonly emit: (event: WorkhorseOperationEvent) => void;
		readonly listenerCount: () => number;
	};
	readonly injections: SessionParams<"thread/inject_items">[];
	readonly realtimeRequests: CoordinatorCallbackRealtimeRequest[];
	readonly callbacks: ReturnType<typeof createCodexCoordinatorCallbacks>;
	readonly options: CoordinatorCallbackOptions;
	readonly setMutationMode: (mode: MutationMode) => void;
	readonly setClassifyHook: (hook: (() => void) | null) => void;
	readonly setMutationHook: (hook: (() => void) | null) => void;
}

export function harness(active = true): Harness {
	const ids = identities();
	const capturedLink = link(ids);
	const classifiedLink = capturedLink.binding.link;
	if (classifiedLink.state !== "executable") throw new Error("workhorse link fixture failed");
	const activeGeneration = active ? generation(ids) : null;
	const state: HarnessState = {
		child: { childId: ids.child, epoch: ids.epoch },
		coordinator: {
			state: "ready",
			threadId: ids.coordinator,
			childId: ids.child,
			epoch: ids.epoch,
			operationId: "coordinator-operation",
			configured: null,
			effective: null,
			approvalPolicy: null,
			approvalsReviewer: null,
			sandboxPolicy: null,
			activePermissionProfile: null,
			review: null,
			capabilities: COORDINATOR_CAPABILITY_POLICY,
			persistence: null,
			reason: null,
		},
		link: capturedLink,
		generation: activeGeneration,
		classification: {
			link: classifiedLink,
			thread: null,
			observation: {
				persisted: true,
				persistedRows: 1,
				loaded: true,
				loadedOccurrences: 1,
				source: "appServer",
				status: "idle",
				canAcceptDirectInput: true,
			},
			currentEpoch: { childId: ids.child, epoch: ids.epoch },
			proof: proof(ids),
		},
	};
	const semantic = semanticSources(ids, active);
	const listeners = new Set<(event: WorkhorseOperationEvent) => void>();
	const injections: SessionParams<"thread/inject_items">[] = [];
	const realtimeRequests: CoordinatorCallbackRealtimeRequest[] = [];
	let mode: MutationMode = "delivered";
	let classifyHook: (() => void) | null = null;
	let mutationHook: (() => void) | null = null;
	const callbackSession = {
		threadInjectItems: async (params: SessionParams<"thread/inject_items">) => {
			injections.push(params);
			mutationHook?.();
			if (mode === "rejected")
				throw new CodexSessionMutationError("thread/inject_items", "not_delivered", "rejected");
			if (mode === "lost") throw new Error("lost");
			return {};
		},
	};
	const realtime = createCoordinatorCallbackRealtimePort({
		currentGeneration: () => state.generation,
		session: {
			realtimeAppendText: async (params) => {
				realtimeRequests.push({ generation: activeGeneration ?? generation(ids), params });
				mutationHook?.();
				if (mode === "rejected")
					throw new CodexSessionMutationError(
						"thread/realtime/appendText",
						"not_delivered",
						"rejected",
					);
				if (mode === "lost") throw new Error("lost");
				return {};
			},
		},
	});
	const options: CoordinatorCallbackOptions = {
		semantic: semantic.publisher,
		operations: {
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		session: callbackSession,
		realtime,
		threadLink: {
			classify: async () => {
				classifyHook?.();
				return state.classification;
			},
		},
		currentChild: () => state.child,
		currentCoordinator: () => state.coordinator,
		currentWorkhorseLink: () => state.link,
		currentRealtimeGeneration: () => state.generation,
	};
	return {
		ids,
		state,
		semantic,
		operations: {
			emit: (event) => {
				for (const listener of listeners) listener(event);
			},
			listenerCount: () => listeners.size,
		},
		injections,
		realtimeRequests,
		callbacks: createCodexCoordinatorCallbacks(options),
		options,
		setMutationMode: (value) => {
			mode = value;
		},
		setClassifyHook: (value) => {
			classifyHook = value;
		},
		setMutationHook: (value) => {
			mutationHook = value;
		},
	};
}

export function close(value: Harness): void {
	value.callbacks.dispose();
	value.semantic.dispose();
}
