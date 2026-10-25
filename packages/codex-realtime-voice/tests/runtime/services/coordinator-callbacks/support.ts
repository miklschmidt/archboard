import { createCodexCoordinatorCallbacks } from "#runtime/services/coordinator-callbacks/callbacks.ts";
import { TEST_CALLBACK_POLICY } from "#tests/runtime/support/host.ts";
import type { CoordinatorHostContextSource } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { createCoordinatorCallbackRealtimePort } from "#runtime/services/coordinator-callbacks/realtime.ts";
import {
	type CoordinatorCallbackCurrentChild,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbackReadyCoordinator,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorCallbackContextPort,
	type CoordinatorCallbackRealtimeRequest,
	type CoordinatorCallbackTurnPort,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { COORDINATOR_CAPABILITY_POLICY } from "#runtime/protocol/coordinator/contract.ts";
import { type EpochExecutionProof } from "#runtime/store/epoch/contract.ts";
import { type EpochOperationRecord } from "#runtime/store/epoch/manifest-contract.ts";
import { CodexSessionMutationError } from "@archboard/codex-app-server/session";
import { type ThreadLinkClassification } from "#runtime/rules/thread-link/contract.ts";
import type { ReverseResponse } from "@archboard/codex-app-server/transport";
import { type WorkhorseOperationEvent } from "#runtime/protocol/workhorse-operations/contract.ts";
import {
	restoreIdentityAuthorities,
	type IdentityAuthorities,
	type LogicalToolCallCorrelation,
} from "@archboard/codex-app-server/identity";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "@archboard/codex-realtime-voice/realtime";

interface Identities {
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

function identities(): Identities {
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

function link(ids: Identities): CoordinatorCallbackLinkCorrelation {
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
		checkout: "/work/payments",
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

type CallbackSourceType = WorkhorseOperationEvent["type"];

function operationEvent(
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
	if (type === "accepted") {
		return Object.freeze({ ...base, type, outcome: "pending" });
	}
	if (type === "failed") {
		return Object.freeze({ ...base, type, outcome: "not_delivered" });
	}
	if (type === "outcome_unknown") {
		return Object.freeze({ ...base, type, outcome: "outcome_unknown" });
	}
	return Object.freeze({ ...base, type, outcome: "delivered" });
}

type MutationMode = "delivered" | "rejected" | "lost";

/** One answer the callbacks module sent to a workhorse tool call. */
interface Answer {
	readonly owner: string;
	readonly response: ReverseResponse;
}

interface HarnessState {
	child: CoordinatorCallbackCurrentChild | null;
	coordinator: CoordinatorCallbackReadyCoordinator | null;
	link: CoordinatorCallbackLinkCorrelation | null;
	/** The workhorses of the tab session's other checkouts (ADR 0050). */
	others: CoordinatorCallbackLinkCorrelation[];
	generation: CoordinatorCallbackRealtimeGeneration | null;
	classification: ThreadLinkClassification;
	/** The boards the tab's panes show. */
	boards: readonly string[];
	/** The board a narration in the tab is on, or null. */
	narrated: string | null;
}

interface Harness {
	readonly ids: Identities;
	readonly state: HarnessState;
	readonly operations: {
		readonly emit: (event: WorkhorseOperationEvent) => void;
		readonly listenerCount: () => number;
	};
	/** What the coordinator was given, in order: every workhorse outcome that reached it. */
	readonly reports: Parameters<CoordinatorCallbackTurnPort["report"]>[0][];
	readonly realtimeRequests: CoordinatorCallbackRealtimeRequest[];
	/** What the coordinator thread was given without a turn, in order. */
	readonly injections: Parameters<CoordinatorCallbackContextPort["inject"]>[0][];
	/** The next answer to a workhorse tool call, once it is sent. */
	readonly nextAnswer: () => Promise<Answer>;
	readonly callbacks: ReturnType<typeof createCodexCoordinatorCallbacks>;
	readonly options: CoordinatorCallbackOptions;
	readonly setMutationMode: (mode: MutationMode) => void;
	readonly setClassifyHook: (hook: (() => void) | null) => void;
	readonly setMutationHook: (hook: (() => void) | null) => void;
}

function harness(active = true): Harness {
	const ids = identities();
	const capturedLink = link(ids);
	const classifiedLink = capturedLink.binding.link;
	if (classifiedLink.state !== "executable") {
		throw new Error("workhorse link fixture failed");
	}
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
		others: [],
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
		boards: ["architecture"],
		narrated: null,
	};
	const listeners = new Set<(event: WorkhorseOperationEvent) => void>();
	const reports: Parameters<CoordinatorCallbackTurnPort["report"]>[0][] = [];
	const realtimeRequests: CoordinatorCallbackRealtimeRequest[] = [];
	const injections: Parameters<CoordinatorCallbackContextPort["inject"]>[0][] = [];
	let mode: MutationMode = "delivered";
	let classifyHook: (() => void) | null = null;
	let mutationHook: (() => void) | null = null;
	const coordinatorTurn: CoordinatorCallbackTurnPort = {
		report: async (request) => {
			reports.push(request);
			mutationHook?.();
			if (mode === "rejected") {
				return { attempted: true, outcome: "not_delivered", reason: "session_rejected" };
			}
			if (mode === "lost") {
				return { attempted: true, outcome: "outcome_unknown", reason: "response_lost" };
			}
			return { attempted: true, outcome: "delivered", reason: null };
		},
	};
	const appended = async (request: CoordinatorCallbackRealtimeRequest) => {
		realtimeRequests.push(request);
		mutationHook?.();
		const method = "thread/realtime/appendText";
		if (mode === "rejected") throw new CodexSessionMutationError(method, "not_delivered", "x");
		if (mode === "lost") throw new Error("lost");
		return {};
	};
	const live = activeGeneration ?? generation(ids);
	const realtime = createCoordinatorCallbackRealtimePort({
		currentGeneration: () => state.generation,
		session: {
			realtimeAppendText: (params) => appended({ generation: live, channel: "context", params }),
			realtimeAppendSpeech: (params) => appended({ generation: live, channel: "speech", params }),
		},
	});
	let answerWaiter: ((answer: Answer) => void) | null = null;
	const options: CoordinatorCallbackOptions = {
		transport: {
			respond: async (_request, owner, response) => {
				answerWaiter?.({ owner, response });
				answerWaiter = null;
			},
		},
		host: TEST_CALLBACK_POLICY,
		operations: {
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		identity: ids.authorities.identity,
		realtime,
		coordinatorTurn,
		threadLink: {
			classify: async (target) => {
				classifyHook?.();
				const other = state.others.find((each) => each.target.threadId === target.threadId);
				return other === undefined
					? state.classification
					: ({ ...state.classification, link: other.binding.link } as ThreadLinkClassification);
			},
		},
		currentChild: () => state.child,
		currentCoordinator: () => state.coordinator,
		workhorseLinks: () => (state.link === null ? state.others : [state.link, ...state.others]),
		currentRealtimeGeneration: () => state.generation,
		coordinatorContext: {
			inject: async (request) => {
				injections.push(request);
				return { attempted: true, outcome: "delivered", reason: null };
			},
		},
	};
	return {
		ids,
		state,
		operations: {
			emit: (event) => {
				for (const listener of listeners) {
					listener(event);
				}
			},
			listenerCount: () => listeners.size,
		},
		reports,
		realtimeRequests,
		injections,
		nextAnswer: () =>
			new Promise<Answer>((resolve) => {
				answerWaiter = resolve;
			}),
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

function close(value: Harness): void {
	value.callbacks.dispose();
}

export {
	type Answer,
	type Identities,
	identities,
	link,
	type CallbackSourceType,
	operationEvent,
	hostEvent,
	type HarnessState,
	type Harness,
	harness,
	close,
};

function hostEvent(ids: Identities): CoordinatorHostContextSource {
	return {
		kind: "host",
		type: "selection",
		child: { id: ids.child, epoch: ids.epoch },
		coordinator: { threadId: ids.coordinator, realtimeSessionId: ids.wireSessionId },
		workhorse: { threadId: ids.workhorse, turnId: null },
		threadLink: { state: "executable", reason: null },
		author: null,
		context: {
			feedId: "test-feed",
			sequence: 1,
			brief: "Task changed.",
			capturedAtMs: 100,
			freshUntilMs: 30100,
			identity: "one",
			coalesces: true,
			payload: null,
		},
	};
}
