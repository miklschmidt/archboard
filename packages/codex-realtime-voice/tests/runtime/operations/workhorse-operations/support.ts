import { TEST_TOOLS } from "#tests/runtime/support/toolset.ts";
import { TEST_CONTEXT_CODEC } from "#tests/runtime/support/host.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

import { TEST_CONTEXT_SCHEMA } from "#tests/runtime/support/host.ts";
import { createTextUserInput } from "#runtime/rules/host/text-input.ts";
import { CODEX_SESSION_THREAD_SOURCE } from "@archboard/codex-app-server/session";
import type { SessionParams, SessionTurn } from "@archboard/codex-app-server/session";
import { createCodexEpochStore } from "#runtime/store/epoch/epoch.ts";
import {
	type CodexEpochStore,
	type EpochExecutionProof,
	type EpochStageInput,
} from "#runtime/store/epoch/contract.ts";
import { type CodexWorkhorseQueue } from "#runtime/services/workhorse-queue/contract.ts";
import {
	createIdentityAuthorities,
	type IdentityAuthority,
	type IdentityAuthorities,
	type LogicalToolCallCorrelation,
	type OperationAuthority,
	type OperationId,
	type ThreadId,
	type TurnId,
} from "@archboard/codex-app-server/identity";
import { createCodexWorkhorseOperations } from "#runtime/services/workhorse-operations/operations.ts";
import {
	type WorkhorseOperationBinding,
	type WorkhorseOperationName,
	type WorkhorseOperationOptions,
	type WorkhorseOperationSessionPort,
} from "#runtime/protocol/workhorse-operations/contract.ts";
import { type ThreadLinkClassification } from "#runtime/rules/thread-link/contract.ts";
import { FakeQueue } from "#tests/runtime/operations/workhorse-operations/queue-support.ts";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);

export class FakeSession implements WorkhorseOperationSessionPort {
	readonly starts: Array<SessionParams<"turn/start">> = [];
	readonly steers: Array<SessionParams<"turn/steer">> = [];
	nextStartTurn: SessionTurn;
	nextStartError: Error | null = null;
	nextSteerError: Error | null = null;
	nextSteerTurnId: TurnId | null = null;
	beforeStart: (() => void) | null = null;

	constructor(readonly identity: IdentityAuthority) {
		this.nextStartTurn = turn(identity, "default-turn", "inProgress");
	}

	turnStart = async (
		params: SessionParams<"turn/start">,
	): Promise<{ readonly turn: SessionTurn }> => {
		this.starts.push(params);
		this.beforeStart?.();
		if (this.nextStartError !== null) {
			const error = this.nextStartError;
			this.nextStartError = null;
			throw error;
		}
		return { turn: this.nextStartTurn };
	};

	turnSteer = async (params: SessionParams<"turn/steer">): Promise<{ readonly turnId: TurnId }> => {
		this.steers.push(params);
		if (this.nextSteerError !== null) {
			const error = this.nextSteerError;
			this.nextSteerError = null;
			throw error;
		}
		return { turnId: this.nextSteerTurnId ?? params.expectedTurnId };
	};
}

export interface Fixture {
	readonly identity: IdentityAuthority;
	readonly operation: OperationAuthority;
	readonly epoch: CodexEpochStore;
	readonly binding: WorkhorseOperationBinding;
	readonly session: FakeSession;
	readonly queue: FakeQueue;
	readonly operations: ReturnType<typeof createCodexWorkhorseOperations>;
	readonly setCall: (tool: WorkhorseOperationName) => LogicalToolCallCorrelation;
	readonly setStatus: (
		status: "notLoaded" | "idle" | "systemError" | "active",
		turns?: readonly SessionTurn[],
	) => void;
	readonly setAttached: () => void;
	readonly setControllable: (value: boolean) => void;
	readonly replaceCall: (call: LogicalToolCallCorrelation | null) => void;
	readonly replaceBinding: (binding: WorkhorseOperationBinding) => void;
	readonly setBeforeContext: (hook: (() => void) | null) => void;
	readonly cleanup: () => void;
}

export interface PreparedFixture {
	readonly coordinatorProof: EpochExecutionProof;
	readonly workhorseProof: EpochExecutionProof;
	readonly attachedWorkhorseProof: EpochExecutionProof;
}

export function fixture(
	initialStatus: "idle" | "active" = "idle",
	authorities: IdentityAuthorities = createIdentityAuthorities(),
): Fixture {
	const group = createStandaloneFixture(initialStatus, authorities);
	return group.fixture;
}

function createStandaloneFixture(
	initialStatus: "idle" | "active",
	authorities: IdentityAuthorities,
): { readonly fixture: Fixture } {
	const identity = authorities.identity;
	const parent = realpathSync(mkdtempSync(join("/tmp", "voice-workhorse-operations-")));
	const epochRoot = join(parent, "epoch");
	const codexHome = join(parent, "codex-home");
	const sqliteHome = join(parent, "codex-sqlite");
	mkdirSync(epochRoot, { recursive: true, mode: 0o700 });
	mkdirSync(codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
	const epoch = createCodexEpochStore({
		rootDirectory: epochRoot,
		codexHome,
		sqliteHome,
		now: () => 100,
	});
	const prepared = prepareFixture(epoch, identity);
	let closed = false;
	const cleanup = (): void => {
		if (closed) return;
		closed = true;
		epoch.close();
		rmSync(parent, { recursive: true, force: true });
	};
	return {
		fixture: buildFixture(initialStatus, authorities, epoch, prepared, cleanup),
	};
}

export function prepareFixture(
	epoch: CodexEpochStore,
	identity: IdentityAuthority,
): PreparedFixture {
	const coordinatorThreadId = identity.decoder.adoptThreadId("coordinator");
	const workhorseThreadId = identity.decoder.adoptThreadId("workhorse");
	epoch.startEpoch(input(identity, "epoch-start", "epoch_start", "epoch/start"));
	return Object.freeze({
		coordinatorProof: Object.freeze(
			committedProof(
				epoch,
				identity,
				"coordinator-link",
				"link",
				coordinatorThreadId,
				CODEX_SESSION_THREAD_SOURCE,
				"turn/start",
			),
		),
		workhorseProof: Object.freeze(
			committedProof(
				epoch,
				identity,
				"workhorse-create",
				"create_thread",
				workhorseThreadId,
				CODEX_SESSION_THREAD_SOURCE,
				"thread/start",
			),
		),
		attachedWorkhorseProof: Object.freeze(
			committedProof(
				epoch,
				identity,
				"workhorse-attach",
				"link",
				workhorseThreadId,
				"attached",
				"thread/link",
			),
		),
	});
}

export function buildFixture(
	initialStatus: "idle" | "active",
	authorities: IdentityAuthorities,
	epoch: CodexEpochStore,
	prepared: PreparedFixture,
	cleanup: () => void,
): Fixture {
	const identity = authorities.identity;
	const { coordinatorProof, workhorseProof, attachedWorkhorseProof } = prepared;
	const coordinatorThreadId = identity.decoder.adoptThreadId("coordinator");
	const workhorseThreadId = identity.decoder.adoptThreadId("workhorse");
	const coordinatorTurnId = identity.decoder.adoptTurnId("coordinator-turn");
	const binding: WorkhorseOperationBinding = {
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		coordinator: {
			childId: identity.validator.childId,
			epoch: identity.validator.epoch,
			threadId: coordinatorThreadId,
			operationId: "coordinator-link",
		},
		workhorse: {
			childId: identity.validator.childId,
			epoch: identity.validator.epoch,
			threadId: workhorseThreadId,
			operationId: "workhorse-create",
		},
	};
	let currentBinding = binding;
	let status: "notLoaded" | "idle" | "systemError" | "active" = initialStatus;
	let turns: readonly SessionTurn[] = [];
	let created = true;
	let controllable = true;
	let currentCall: LogicalToolCallCorrelation | null = null;
	let callCount = 0;
	let beforeContext: (() => void) | null = null;
	const session = new FakeSession(identity);
	const queue = new FakeQueue(identity, authorities.operation);
	const setCall = (tool: WorkhorseOperationName): LogicalToolCallCorrelation => {
		const call = identity.decoder.createLogicalToolCallCorrelation({
			threadId: coordinatorThreadId,
			turnId: coordinatorTurnId,
			callId: identity.decoder.adoptDynamicToolCallId("call-" + tool + "-" + callCount++),
			namespace: TEST_TOOLS.workhorse.namespace.name,
			tool,
			manifestHash: TEST_TOOLS.workhorse.sha256,
		});
		currentCall = call;
		return call;
	};
	const classify = async (
		target: WorkhorseOperationBinding["coordinator"],
	): Promise<ThreadLinkClassification> => {
		const isWorkhorse = target.threadId === workhorseThreadId;
		const targetStatus = isWorkhorse ? status : "idle";
		const targetControllable = isWorkhorse ? controllable : true;
		const executable =
			!isWorkhorse || (status !== "notLoaded" && status !== "systemError" && targetControllable);
		const reason: ThreadLinkClassification["link"]["reason"] = executable
			? null
			: targetStatus === "notLoaded"
				? "thread_status_not_loaded"
				: targetStatus === "systemError"
					? "thread_status_system_error"
					: "direct_input_false";
		const thread = {
			id: target.threadId,
			source: CODEX_SESSION_THREAD_SOURCE,
			status:
				targetStatus === "active"
					? { type: "active" as const, activeFlags: [] }
					: { type: targetStatus as "idle" | "notLoaded" | "systemError" },
			canAcceptDirectInput: targetControllable,
			turns: isWorkhorse ? turns : [],
		};
		const proof = isWorkhorse
			? created
				? workhorseProof
				: attachedWorkhorseProof
			: coordinatorProof;
		return {
			link: {
				kind: "thread_link",
				state: executable ? "executable" : "inspect_only",
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
				threadId: target.threadId,
				source: CODEX_SESSION_THREAD_SOURCE,
				status: targetStatus,
				loaded: targetStatus !== "notLoaded",
				canAcceptDirectInput: targetControllable,
				reason,
			},
			thread: thread as unknown as ThreadLinkClassification["thread"],
			observation: {
				persisted: true,
				persistedRows: 1,
				loaded: targetStatus !== "notLoaded",
				loadedOccurrences: 1,
				source: CODEX_SESSION_THREAD_SOURCE,
				status: targetStatus,
				canAcceptDirectInput: targetControllable,
			},
			currentEpoch: { childId: identity.validator.childId, epoch: identity.validator.epoch },
			proof,
		} as unknown as ThreadLinkClassification;
	};
	const options: WorkhorseOperationOptions = {
		tools: TEST_TOOLS,
		contextCodec: TEST_CONTEXT_CODEC,
		session,
		queue: queue as CodexWorkhorseQueue<OperationId>,
		epoch,
		identity,
		operation: authorities.operation,
		currentBinding: () => currentBinding,
		currentCoordinatorCall: () => currentCall,
		threadLink: {
			classify: (target) => classify(target as WorkhorseOperationBinding["coordinator"]),
		},
		contextFor: ({ operationId, kind, rpc }) => (
			beforeContext?.(),
			TEST_CONTEXT_SCHEMA.parse({
				threadLink: { state: "executable", reason: null },
				child: { id: String(identity.validator.childId), epoch: String(identity.validator.epoch) },
				workhorse: { threadId: String(workhorseThreadId), turnId: null },
				coordinator: { threadId: String(coordinatorThreadId), realtimeSessionId: null },
				brief: { text: "", capturedAtMs: 0, freshUntilMs: 0 },
				operation: {
					id: authorities.operation.decoder.serializeOperationId(operationId),
					kind,
					rpc,
					outcome: null,
				},
			})
		),
	};
	const operations = createCodexWorkhorseOperations(options);
	return {
		identity,
		operation: authorities.operation,
		epoch,
		binding,
		session,
		queue,
		operations,
		setCall,
		setStatus: (nextStatus, nextTurns = []) => {
			status = nextStatus;
			turns = nextTurns;
		},
		setAttached: () => {
			created = false;
			currentBinding = {
				...currentBinding,
				workhorse: { ...currentBinding.workhorse, operationId: "workhorse-attach" },
			};
		},
		setControllable: (value) => {
			controllable = value;
		},
		replaceCall: (call) => {
			currentCall = call;
		},
		replaceBinding: (next) => {
			currentBinding = next;
		},
		setBeforeContext: (hook) => {
			beforeContext = hook;
		},
		cleanup,
	};
}

function input(
	identity: IdentityAuthority,
	operationId: string,
	kind: string,
	rpc: string,
): EpochStageInput {
	return {
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		operationId,
		kind,
		rpc,
		workspaceRoot: "/workspace/example",
		instructionHash: INSTRUCTION_HASH,
		manifestHash: MANIFEST_HASH,
	};
}

function committedProof(
	epoch: CodexEpochStore,
	identity: IdentityAuthority,
	operationId: string,
	kind: string,
	threadId: ThreadId,
	threadSource: string,
	rpc: string,
): EpochExecutionProof {
	const transaction = epoch.stageOperation({
		...input(identity, operationId, kind, rpc),
		expected: epoch.snapshot().cas,
	});
	epoch.commitOperation(transaction, { threadId, threadSource });
	return epoch.assertCurrent({
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		operationId,
		threadId,
	});
}

export function turn(
	identity: IdentityAuthority,
	rawId: string,
	status: "inProgress" | "completed" | "interrupted" | "failed",
	clientId: string | null = null,
): SessionTurn {
	return {
		id: identity.decoder.adoptTurnId(rawId),
		items: [
			{
				type: "userMessage",
				id: identity.decoder.adoptItemId("item-" + rawId),
				clientId,
				content: [createTextUserInput("turn")],
			},
		],
		itemsView: "full",
		status,
		error: null,
		startedAt: 1,
		completedAt: status === "inProgress" ? null : 2,
		durationMs: status === "inProgress" ? null : 1,
	};
}
