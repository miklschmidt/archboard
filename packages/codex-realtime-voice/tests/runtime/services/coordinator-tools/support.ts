import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	type CoordinatorToolName,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import {
	type CodexWorkhorseOperations,
	type WorkhorseOperationBinding,
} from "#runtime/protocol/workhorse-operations/contract.ts";
import {
	type SpokenApprovalSnapshot,
	type SpokenApprovalToolResult,
} from "#runtime/protocol/spoken-approval/contract.ts";
import type { DynamicServerRequest, ReverseResponse } from "@archboard/codex-app-server/transport";
import {
	COORDINATOR_TOOLS_OWNER,
	type CoordinatorToolAuthorityPort,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolDispatcher,
	type CoordinatorToolStop,
} from "#runtime/protocol/coordinator-tools/contract.ts";
import { createCodexCoordinatorTools } from "#runtime/services/coordinator-tools/dispatcher.ts";
import {
	createIdentityAuthorities,
	type DynamicToolCallId,
	type IdentityAuthority,
	type IdentityAuthorities,
	type LogicalToolCallCorrelation,
	type OperationAuthority,
	type OperationId,
	type ThreadId,
	type TurnId,
} from "@archboard/codex-app-server/identity";
import {
	bindingFor,
	readyAuthority,
} from "#tests/runtime/services/coordinator-tools/authority-support.ts";
import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";

interface ResponseWrite {
	readonly request: DynamicServerRequest;
	readonly owner: typeof COORDINATOR_TOOLS_OWNER;
	readonly response: ReverseResponse;
}

interface CoordinatorToolsFixture {
	readonly authorities: IdentityAuthorities;
	readonly identity: IdentityAuthority;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
	readonly expectedTurnId: TurnId;
	readonly binding: WorkhorseOperationBinding;
	readonly operation: Pick<OperationAuthority, "issuer" | "validator" | "decoder"> & {
		setNextIssued: (value: OperationId) => void;
	};
	readonly timeline: string[];
	readonly operations: Pick<
		CodexWorkhorseOperations,
		"inspect" | "delegate" | "manageQueue" | "steer"
	> & {
		readonly calls: {
			readonly inspect: Array<Parameters<CodexWorkhorseOperations["inspect"]>[0]>;
			readonly delegate: Array<Parameters<CodexWorkhorseOperations["delegate"]>[0]>;
			readonly manageQueue: Array<Parameters<CodexWorkhorseOperations["manageQueue"]>[0]>;
			readonly steer: Array<Parameters<CodexWorkhorseOperations["steer"]>[0]>;
		};
		setError: (error: unknown) => void;
		hold: () => void;
		release: () => void;
	};
	/** The tab session's stop of its workhorses; it shares the barrier and error of `operations`. */
	readonly stop: {
		readonly calls: { count: number };
		setResult: (result: readonly CoordinatorToolStop[]) => void;
	};
	readonly spokenApproval: {
		readonly snapshot: () => SpokenApprovalSnapshot;
		readonly resolve: (request: DynamicServerRequest) => Promise<SpokenApprovalToolResult>;
		readonly calls: DynamicServerRequest[];
		setResult: (result: SpokenApprovalToolResult) => void;
		setOperationId: (operationId: string | null) => void;
		setSnapshot: (snapshot: SpokenApprovalSnapshot) => void;
	};
	readonly transport: {
		readonly writes: ResponseWrite[];
		respond: (
			request: DynamicServerRequest,
			owner: typeof COORDINATOR_TOOLS_OWNER,
			response: ReverseResponse,
		) => Promise<void>;
		failWrites: boolean;
		failFor: (request: DynamicServerRequest) => void;
		hold: () => void;
		release: () => void;
	};
	readonly authority: CoordinatorToolAuthorityPort & {
		setCoordinator: (value: CoordinatorToolCoordinatorAuthority | null) => void;
		setBinding: (value: WorkhorseOperationBinding | null) => void;
		setCall: (value: LogicalToolCallCorrelation | null) => void;
		setExpectedTurnId: (value: TurnId | null) => void;
	};
	readonly dispatcher: CoordinatorToolDispatcher;
	readonly request: (
		tool: CoordinatorToolName,
		options?: {
			readonly arguments?: unknown;
			readonly callId?: DynamicToolCallId;
			readonly namespace?: string;
			readonly manifestHash?: string;
			readonly threadId?: ThreadId;
			readonly turnId?: TurnId;
		},
	) => DynamicServerRequest;
}

/** The checkout the fixture's one workhorse works in (ADR 0050). */
const CHECKOUT = "/work/payments";

/**
 * A coordinator-tools dispatcher over one workhorse.
 * @param authorities - The identity authorities.
 * @param checkouts - The checkouts the workhorse answers in: its own, and more when a test needs a
 * second checkout that a call can name and that has a workhorse.
 * @returns The fixture.
 */
function fixture(
	authorities: IdentityAuthorities = createIdentityAuthorities(),
	checkouts: readonly string[] = [CHECKOUT],
): CoordinatorToolsFixture {
	const identity = authorities.identity;
	const coordinatorThreadId = identity.decoder.adoptThreadId("coordinator");
	const workhorseThreadId = identity.decoder.adoptThreadId("workhorse");
	const expectedTurnId = identity.decoder.adoptTurnId("workhorse-turn");
	const binding = bindingFor(identity, coordinatorThreadId, workhorseThreadId);
	let coordinator: CoordinatorToolCoordinatorAuthority | null = readyAuthority(
		identity,
		coordinatorThreadId,
	);
	let currentBinding: WorkhorseOperationBinding | null = binding;
	let currentCall: LogicalToolCallCorrelation | null = null;
	let currentExpectedTurnId: TurnId | null = expectedTurnId;
	let nextIssuedOperation: OperationId | null = null;
	let nextOperationError: unknown = null;
	let operationBarrier: Promise<void> | null = null;
	let releaseOperation: (() => void) | null = null;
	let requestNumber = 0;
	const waitForOperation = async (): Promise<void> => {
		const barrier = operationBarrier;
		if (barrier !== null) {
			await barrier;
		}
	};

	const operationCalls = {
		inspect: [] as Array<Parameters<CodexWorkhorseOperations["inspect"]>[0]>,
		delegate: [] as Array<Parameters<CodexWorkhorseOperations["delegate"]>[0]>,
		manageQueue: [] as Array<Parameters<CodexWorkhorseOperations["manageQueue"]>[0]>,
		steer: [] as Array<Parameters<CodexWorkhorseOperations["steer"]>[0]>,
	};
	const timeline: string[] = [];
	const operations = {
		inspect: async (request: Parameters<CodexWorkhorseOperations["inspect"]>[0]) => {
			operationCalls.inspect.push(request);
			timeline.push("workhorse.inspect");
			await waitForOperation();
			if (nextOperationError !== null) {
				const error = nextOperationError;
				nextOperationError = null;
				throw error;
			}
			return {
				threadId: workhorseThreadId,
				status: "idle" as const,
				activeTurnId: null,
				queuedSubmissionIds: [],
			};
		},
		delegate: async (request: Parameters<CodexWorkhorseOperations["delegate"]>[0]) => {
			operationCalls.delegate.push(request);
			timeline.push("workhorse.delegate");
			await waitForOperation();
			if (nextOperationError !== null) {
				const error = nextOperationError;
				nextOperationError = null;
				throw error;
			}
			return {
				mode: "started" as const,
				clientUserMessageId: "client-user-message",
				queuedSubmissionId: null,
				turnId: expectedTurnId,
			};
		},
		manageQueue: async (request: Parameters<CodexWorkhorseOperations["manageQueue"]>[0]) => {
			operationCalls.manageQueue.push(request);
			timeline.push("workhorse.manageQueue");
			await waitForOperation();
			if (nextOperationError !== null) {
				const error = nextOperationError;
				nextOperationError = null;
				throw error;
			}
			return { operation: request.operation, queuedSubmissionIds: [] };
		},
		steer: async (request: Parameters<CodexWorkhorseOperations["steer"]>[0]) => {
			operationCalls.steer.push(request);
			timeline.push("workhorse.steer");
			await waitForOperation();
			if (nextOperationError !== null) {
				const error = nextOperationError;
				nextOperationError = null;
				throw error;
			}
			return { turnId: request.expectedTurnId, delivery: "delivered" as const };
		},
		calls: operationCalls,
		setError: (error: unknown) => {
			nextOperationError = error;
		},
		hold: () => {
			if (operationBarrier !== null) {
				throw new Error("operation barrier is already held");
			}
			operationBarrier = new Promise<void>((resolve) => {
				releaseOperation = resolve;
			});
		},
		release: () => {
			const release = releaseOperation;
			releaseOperation = null;
			operationBarrier = null;
			release?.();
		},
	};

	const stopCalls = { count: 0 };
	let stopResult: readonly CoordinatorToolStop[] = [{ checkout: CHECKOUT, outcome: "interrupted" }];
	const stopWork = async (): Promise<readonly CoordinatorToolStop[]> => {
		stopCalls.count += 1;
		timeline.push("workhorses.stop");
		await waitForOperation();
		if (nextOperationError !== null) {
			const error = nextOperationError;
			nextOperationError = null;
			throw error;
		}
		return stopResult;
	};
	const stop = {
		calls: stopCalls,
		setResult: (result: readonly CoordinatorToolStop[]) => {
			stopResult = result;
		},
	};

	let spokenResult: SpokenApprovalToolResult = {
		tag: "ok",
		value: { verdict: "accept", settlement: "delivered" },
	};
	const initialSpokenOperation = authorities.operation.issuer.mintOperationId();
	let spokenSnapshot: SpokenApprovalSnapshot = Object.freeze({
		state: "awaiting_resolver",
		requestId: identity.decoder.adoptJsonRpcRequestId("spoken-approval-request"),
		approvalId: identity.decoder.adoptApprovalId("spoken-approval"),
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		coordinatorThreadId,
		realtimeSessionId: parseRealtimeSessionId("spoken-session"),
		realtimeCorrelationId: parseRealtimeCorrelationId("spoken-correlation"),
		effectSummary: "Apply the requested operation",
		effectFingerprint: "spoken-effect-fingerprint",
		effectPromptItemId: parseRealtimeItemId("spoken-effect-prompt"),
		effectPromptSequence: 7,
		finalUserItemId: parseRealtimeItemId("spoken-final-user"),
		finalUserSequence: 8,
		finalUserText: "yes",
		operationId: authorities.operation.decoder.serializeOperationId(initialSpokenOperation),
		classifierTurnId: identity.decoder.adoptTurnId("spoken-classifier-turn"),
		resolverCallId: identity.decoder.adoptDynamicToolCallId("spoken-resolver-call"),
		expiresAtMs: 10_000,
		settlement: null,
		reason: null,
	});
	const spokenCalls: DynamicServerRequest[] = [];
	const spokenApproval = {
		snapshot: () => spokenSnapshot,
		resolve: async (request: DynamicServerRequest) => {
			spokenCalls.push(request);
			timeline.push("voice.resolve");
			return spokenResult;
		},
		calls: spokenCalls,
		setResult: (result: SpokenApprovalToolResult) => {
			spokenResult = result;
		},
		setOperationId: (operationId: string | null) => {
			spokenSnapshot = Object.freeze({ ...spokenSnapshot, operationId });
		},
		setSnapshot: (snapshot: SpokenApprovalSnapshot) => {
			spokenSnapshot = snapshot;
		},
	};

	const writes: ResponseWrite[] = [];
	let responseBarrier: Promise<void> | null = null;
	let releaseResponse: (() => void) | null = null;
	const failedRequests = new Set<DynamicServerRequest["requestId"]>();
	const transport = {
		writes,
		failWrites: false,
		respond: async (
			request: DynamicServerRequest,
			owner: typeof COORDINATOR_TOOLS_OWNER,
			response: ReverseResponse,
		): Promise<void> => {
			writes.push({ request, owner, response });
			timeline.push("transport.respond");
			if (responseBarrier !== null) {
				await responseBarrier;
			}
			if (transport.failWrites || failedRequests.has(request.requestId)) {
				throw new Error("response write lost");
			}
		},
		failFor: (request: DynamicServerRequest) => {
			failedRequests.add(request.requestId);
		},
		hold: () => {
			if (responseBarrier !== null) {
				throw new Error("response barrier is already held");
			}
			responseBarrier = new Promise<void>((resolve) => {
				releaseResponse = resolve;
			});
		},
		release: () => {
			const release = releaseResponse;
			releaseResponse = null;
			responseBarrier = null;
			release?.();
		},
	};

	const authority = {
		currentCoordinator: () => coordinator,
		currentCall: () => currentCall,
		expectedTurnId: () => currentExpectedTurnId,
		setCoordinator: (value: CoordinatorToolCoordinatorAuthority | null) => {
			coordinator = value;
		},
		setBinding: (value: WorkhorseOperationBinding | null) => {
			currentBinding = value;
		},
		setCall: (value: LogicalToolCallCorrelation | null) => {
			currentCall = value;
		},
		setExpectedTurnId: (value: TurnId | null) => {
			currentExpectedTurnId = value;
		},
	} satisfies CoordinatorToolAuthorityPort & {
		setCoordinator: (value: CoordinatorToolCoordinatorAuthority | null) => void;
		setBinding: (value: WorkhorseOperationBinding | null) => void;
		setCall: (value: LogicalToolCallCorrelation | null) => void;
		setExpectedTurnId: (value: TurnId | null) => void;
	};
	const operation = {
		issuer: {
			mintOperationId: () => {
				const selected = nextIssuedOperation ?? authorities.operation.issuer.mintOperationId();
				nextIssuedOperation = null;
				return selected;
			},
		},
		validator: authorities.operation.validator,
		decoder: authorities.operation.decoder,
		setNextIssued: (value: OperationId) => {
			nextIssuedOperation = value;
		},
	};

	const dispatcher = createCodexCoordinatorTools({
		identity,
		authority,
		operation,
		/**
		 * The fixture's workhorse, in the checkouts it answers in.
		 * @param checkout - The checkout a call names.
		 * @returns The workhorse, or null for another checkout.
		 */
		workhorseFor: (checkout) =>
			checkouts.includes(checkout) ? { binding: () => currentBinding, operations } : null,
		stopWork,
		spokenApproval,
		transport,
	});

	const request = (
		tool: CoordinatorToolName,
		options: {
			readonly arguments?: unknown;
			readonly callId?: DynamicToolCallId;
			readonly namespace?: string;
			readonly manifestHash?: string;
			readonly threadId?: ThreadId;
			readonly turnId?: TurnId;
		} = {},
	): DynamicServerRequest => {
		const namespace =
			options.namespace ??
			(tool === "resolve_spoken_approval" ? "archboard_voice" : "archboard_workhorse");
		const manifestHash =
			options.manifestHash ??
			(namespace === "archboard_voice"
				? ARCHBOARD_VOICE_MANIFEST_SHA256
				: ARCHBOARD_WORKHORSE_MANIFEST_SHA256);
		const threadId = options.threadId ?? coordinatorThreadId;
		const turnId = options.turnId ?? expectedTurnId;
		const callId =
			options.callId ?? identity.decoder.adoptDynamicToolCallId(`call-${requestNumber++}-${tool}`);
		const argumentsValue =
			options.arguments ??
			(tool === "inspect_workhorse"
				? { checkout: CHECKOUT }
				: tool === "delegate_to_workhorse"
					? { checkout: CHECKOUT, input: "delegate input", transcriptDelta: "spoken context" }
					: tool === "manage_workhorse_queue"
						? { checkout: CHECKOUT, operation: "list" }
						: tool === "steer_workhorse"
							? { checkout: CHECKOUT, input: "steer input" }
							: tool === "stop_workhorses"
								? {}
								: { verdict: "accept" });
		const call = identity.decoder.createLogicalToolCallCorrelation({
			threadId,
			turnId,
			callId,
			namespace,
			tool,
			manifestHash,
		});
		currentCall = call;
		if (tool === "resolve_spoken_approval") {
			spokenSnapshot = Object.freeze({ ...spokenSnapshot, resolverCallId: callId });
		}
		const requestId = identity.decoder.adoptJsonRpcRequestId(`request-${requestNumber++}`);
		return {
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			requestId,
			correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
			method: "item/tool/call",
			params: {
				threadId: identity.decoder.serializeCodexIdentity(threadId),
				turnId: identity.decoder.serializeCodexIdentity(turnId),
				callId: identity.decoder.serializeCodexIdentity(callId),
				namespace,
				tool,
				arguments: argumentsValue,
			} as DynamicServerRequest["params"],
			owner: COORDINATOR_TOOLS_OWNER,
			logicalCall: call,
		};
	};

	return {
		authorities,
		identity,
		coordinatorThreadId,
		workhorseThreadId,
		expectedTurnId,
		binding,
		operation,
		timeline,
		operations,
		stop,
		spokenApproval,
		transport,
		authority,
		dispatcher,
		request,
	};
}

export { type ResponseWrite, type CoordinatorToolsFixture, CHECKOUT, fixture };
export {
	copyRequest,
	responseValue,
	responseEnvelope,
	nextMicrotasks,
} from "#tests/runtime/services/coordinator-tools/response-inspection.ts";
