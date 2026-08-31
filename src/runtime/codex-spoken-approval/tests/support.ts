import type {
	RealtimeSemanticEvent,
	RealtimeSemanticEventListener,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthority,
	type DynamicToolCallId,
	type IdentityAuthority,
	type ThreadId,
	type TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	COORDINATOR_CAPABILITY_POLICY,
	type CoordinatorSnapshot,
} from "../../codex-coordinator/index.js";
import { decodeServerNotification } from "../../codex-protocol/index.js";
import {
	createCodexApprovalBroker,
	type ApprovalBindingInput,
	type ApprovalResponsePort,
	type ApprovalSnapshot,
	type CodexApprovalBroker,
} from "../../codex-approvals/index.js";
import { ARCHBOARD_VOICE_MANIFEST_SHA256 } from "../../codex-coordinator-tool-contract/index.js";
import type { TransportServerRequest } from "../../codex-transport/index.js";
import type { TransportServerNotification } from "../../codex-transport/index.js";
import type {
	CodexSession,
	SessionParams,
	SessionResponse,
	SessionTurn,
} from "../../codex-session/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import {
	createCodexSpokenApprovalGate,
	type CodexSpokenApprovalGate,
	type SpokenApprovalArmInput,
	type SpokenApprovalEffectPrompt,
} from "../index.js";

export const REALTIME = Object.freeze({
	sessionId: parseRealtimeSessionId("browser-session"),
	correlationId: parseRealtimeCorrelationId("browser-correlation"),
});

export const PROMPT: SpokenApprovalEffectPrompt = Object.freeze({
	itemId: parseRealtimeItemId("assistant-effect"),
	sequence: 10,
});

export function transcript(
	role: RealtimeTranscriptRecord["role"],
	status: RealtimeTranscriptRecord["status"],
	itemId: string,
	sequence: number,
	text: string,
	correlation = REALTIME,
): RealtimeTranscriptRecord {
	return {
		...correlation,
		itemId: parseRealtimeItemId(itemId),
		sequence,
		role,
		status,
		text,
	};
}

export class FakeRealtime {
	private readonly listeners = new Set<RealtimeSemanticEventListener>();
	private recordsValue: readonly RealtimeTranscriptRecord[];

	constructor(records: readonly RealtimeTranscriptRecord[]) {
		this.recordsValue = records;
	}

	onSemanticEvent(listener: RealtimeSemanticEventListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	transcript(): readonly RealtimeTranscriptRecord[] {
		return this.recordsValue;
	}

	emit(event: RealtimeSemanticEvent): void {
		for (const listener of this.listeners) listener(event);
	}

	emitTranscript(record: RealtimeTranscriptRecord): void {
		this.recordsValue = [...this.recordsValue, record];
		this.emit({ kind: "transcript", record });
	}
}

export interface HarnessOptions {
	readonly records?: readonly RealtimeTranscriptRecord[];
	readonly turnFailure?: Error;
	readonly deferTurn?: boolean;
	readonly settlementFailure?: "not_delivered" | "outcome_unknown";
}

export interface GateHarness {
	readonly identity: IdentityAuthority;
	readonly broker: CodexApprovalBroker;
	readonly port: ApprovalResponsePort & { readonly responses: unknown[] };
	readonly realtime: FakeRealtime;
	readonly gate: CodexSpokenApprovalGate;
	readonly approval: ApprovalSnapshot;
	readonly turnId: TurnId;
	readonly startParams: SessionParams<"turn/start">[];
	readonly armInput: SpokenApprovalArmInput;
	coordinatorState: CoordinatorSnapshot;
	currentBinding: ApprovalBindingInput;
	realtimeCorrelation: typeof REALTIME;
	now: number;
	resolveTurn: (() => void) | null;
	readonly fallbackReasons: readonly string[];
}

function approvalRequest(identity: IdentityAuthority): TransportServerRequest {
	const requestId = identity.decoder.adoptJsonRpcRequestId("approval-request");
	const params = {
		kind: "command",
		threadId: "coordinator-thread",
		turnId: "approval-turn",
		itemId: "approval-item",
		startedAtMs: 1,
		approvalId: "approval-id",
		environmentId: null,
		reason: "Run the reviewed command",
		networkApprovalContext: null,
		command: "echo approved",
		cwd: "/workspace",
		commandActions: null,
		additionalPermissions: null,
		proposedExecpolicyAmendment: null,
		proposedNetworkPolicyAmendments: null,
		availableDecisions: ["accept", "decline"],
	} satisfies Extract<
		TransportServerRequest,
		{ readonly method: "item/commandExecution/requestApproval" }
	>["params"];
	return {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId,
		correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
		method: "item/commandExecution/requestApproval",
		params,
		owner: "codex-approvals",
	};
}

function readySnapshot(identity: IdentityAuthority, threadId: ThreadId): CoordinatorSnapshot {
	return {
		state: "ready",
		threadId,
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
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
	};
}

function classifierContext(
	identity: IdentityAuthority,
	threadId: ThreadId,
	operationId: string,
): ArchboardContext {
	return {
		schema: 1,
		paneId: "pane-1",
		board: { note: "vault/board.md", version: 1, cursor: null },
		threadLink: { state: "executable", reason: null },
		child: { id: identity.validator.childId, epoch: identity.validator.epoch },
		workhorse: { threadId: null, turnId: null },
		coordinator: { threadId, realtimeSessionId: REALTIME.sessionId },
		semantic: {
			brief: "The reviewed command is bounded.",
			capturedAtMs: 1,
			freshUntilMs: 30_000,
			truncated: false,
		},
		focus: { paneId: "pane-1", capturedAtMs: 1 },
		selection: { elementIds: [], capturedAtMs: 1 },
		claim: { holder: "human", doing: "Reviewing the command" },
		ambiguity: [],
		operation: {
			id: operationId,
			kind: "spoken_approval_classifier",
			rpc: "turn/start",
			outcome: null,
		},
	};
}

export function makeHarness(options: HarnessOptions = {}): GateHarness {
	const identity = createIdentityAuthority();
	const responses: unknown[] = [];
	const port = {
		responses,
		respond: async (
			request: TransportServerRequest,
			owner: "codex-approvals",
			response: unknown,
		) => {
			responses.push({ request, owner, response });
			if (options.settlementFailure === "not_delivered")
				throw { accepted: false, outcome: "not_delivered", reason: "test backpressure" };
			if (options.settlementFailure === "outcome_unknown")
				throw { accepted: true, outcome: "outcome_unknown", reason: "test lost response" };
		},
	} satisfies ApprovalResponsePort & { readonly responses: unknown[] };
	let currentBinding: ApprovalBindingInput = {};
	const broker = createCodexApprovalBroker({
		identity,
		transport: port,
		getCurrentBinding: () => currentBinding,
	});
	const approval = broker.receive(approvalRequest(identity));
	const threadId = approval.threadId;
	const turnId = identity.decoder.adoptTurnId("classifier-turn");
	const turn: SessionTurn = {
		id: turnId,
		items: [],
		itemsView: "full",
		status: "inProgress",
		error: null,
		startedAt: 2,
		completedAt: null,
		durationMs: null,
	};
	const startParams: SessionParams<"turn/start">[] = [];
	let resolveTurn: (() => void) | null = null;
	const session: Pick<CodexSession, "turnStart"> = {
		turnStart: async (params): Promise<SessionResponse<"turn/start">> => {
			startParams.push(params);
			if (options.turnFailure) throw options.turnFailure;
			if (!options.deferTurn) return { turn };
			return new Promise((resolve) => {
				resolveTurn = () => resolve({ turn });
			});
		},
	};
	const prompt = transcript(
		"assistant",
		"final",
		PROMPT.itemId,
		PROMPT.sequence,
		"Run echo approved",
	);
	const realtime = new FakeRealtime(options.records ?? [prompt]);
	let coordinatorState = readySnapshot(identity, threadId);
	const context = classifierContext(identity, threadId, "classifier-operation");
	const armInput: SpokenApprovalArmInput = {
		requestId: approval.requestId,
		effectSummary: "Run echo approved",
		realtime: REALTIME,
		effectPrompt: PROMPT,
		classifier: {
			operationId: "classifier-operation",
			clientUserMessageId: "classifier-message",
			context,
		},
	};
	const fallbackReasons: string[] = [];
	let currentNow = 1_000;
	let currentRealtime = REALTIME;
	const gate = createCodexSpokenApprovalGate({
		approvalBroker: broker,
		coordinator: { snapshot: () => coordinatorState },
		realtime,
		session,
		identity,
		currentRealtime: () => currentRealtime,
		now: () => currentNow,
		onVisualFallback: (reason) => fallbackReasons.push(reason),
	});
	return {
		identity,
		broker,
		port,
		realtime,
		approval,
		turnId,
		startParams,
		armInput,
		gate,
		get coordinatorState() {
			return coordinatorState;
		},
		set coordinatorState(value: CoordinatorSnapshot) {
			coordinatorState = value;
		},
		get currentBinding() {
			return currentBinding;
		},
		set currentBinding(value: ApprovalBindingInput) {
			currentBinding = value;
		},
		get realtimeCorrelation() {
			return currentRealtime;
		},
		set realtimeCorrelation(value: typeof REALTIME) {
			currentRealtime = value;
		},
		get now() {
			return currentNow;
		},
		set now(value: number) {
			currentNow = value;
		},
		get resolveTurn() {
			return resolveTurn;
		},
		set resolveTurn(value: (() => void) | null) {
			resolveTurn = value;
		},
		fallbackReasons,
	};
}

export function resolverRequest(
	harness: GateHarness,
	verdict: "accept" | "decline" = "accept",
	options: {
		readonly threadId?: ThreadId;
		readonly turnId?: TurnId;
		readonly callId?: DynamicToolCallId;
		readonly namespace?: string;
		readonly tool?: string;
		readonly manifestHash?: string;
	} = {},
): Extract<TransportServerRequest, { readonly method: "item/tool/call" }> {
	const requestId = harness.identity.decoder.adoptJsonRpcRequestId(
		`resolver-${harness.startParams.length}-${verdict}`,
	);
	const threadId = options.threadId ?? harness.approval.threadId;
	const turnId = options.turnId ?? harness.turnId;
	const callId =
		options.callId ??
		harness.identity.decoder.adoptDynamicToolCallId(`resolver-call-${harness.startParams.length}`);
	const namespace = options.namespace ?? "archboard_voice";
	const tool = options.tool ?? "resolve_spoken_approval";
	const manifestHash = options.manifestHash ?? ARCHBOARD_VOICE_MANIFEST_SHA256;
	const params = {
		threadId: String(threadId),
		turnId: String(turnId),
		callId: String(callId),
		namespace,
		tool,
		arguments: { verdict },
	} satisfies Extract<TransportServerRequest, { readonly method: "item/tool/call" }>["params"];
	return {
		child: harness.identity.validator.childId,
		epoch: harness.identity.validator.epoch,
		requestId,
		correlation: harness.identity.decoder.createWireRequestCorrelation({ requestId }),
		method: "item/tool/call",
		params,
		owner: "codex-coordinator-tools",
		logicalCall: harness.identity.decoder.createLogicalToolCallCorrelation({
			threadId,
			turnId,
			callId,
			namespace,
			tool,
			manifestHash,
		}),
	};
}

export function stateEvent(harness: GateHarness, phase: "idle" | "closed"): RealtimeSemanticEvent {
	return {
		kind: "state",
		sessionId: harness.realtimeCorrelation.sessionId,
		correlationId: harness.realtimeCorrelation.correlationId,
		state:
			phase === "idle"
				? { phase: "idle", reason: "created" }
				: { phase: "closed", reason: "stopped" },
	};
}

export function turnEvent(
	harness: GateHarness,
	method: "turn/started" | "turn/completed",
): TransportServerNotification {
	const status = method === "turn/started" ? "inProgress" : "completed";
	const notification = decodeServerNotification({
		method,
		params: {
			threadId: String(harness.approval.threadId),
			turn: {
				id: String(harness.turnId),
				items: [],
				itemsView: "full",
				status,
				error: null,
				startedAt: 2,
				completedAt: method === "turn/completed" ? 3 : null,
				durationMs: method === "turn/completed" ? 1 : null,
			},
		},
	});
	return {
		correlation: {
			child: harness.identity.validator.childId,
			epoch: harness.identity.validator.epoch,
			requestId: null,
		},
		notification,
	};
}

export function cleanup(harness: GateHarness): void {
	harness.gate.dispose();
	harness.broker.dispose();
}
