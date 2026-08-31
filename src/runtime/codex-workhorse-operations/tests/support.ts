import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { ArchboardContextSchema, createTextUserInput } from "../../codex-instructions/index.js";
import {
	type SessionParams,
	type SessionQueuedSubmission,
	type SessionTurn,
} from "../../codex-session/index.js";
import {
	createCodexEpochStore,
	type CodexEpochStore,
	type EpochExecutionProof,
	type EpochStageInput,
} from "../../codex-epoch/index.js";
import {
	CodexWorkhorseQueueError,
	type CodexWorkhorseQueue,
	type QueueMutationOutcome,
	type QueueSnapshot,
} from "../../codex-workhorse-queue/index.js";
import {
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_NAMESPACE,
} from "../../codex-coordinator-tool-contract/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthority,
	type LogicalToolCallCorrelation,
	type OperationAuthority,
	type OperationId,
	type ThreadId,
	type TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexWorkhorseOperations,
	type WorkhorseOperationBinding,
	type WorkhorseOperationName,
	type WorkhorseOperationOptions,
	type WorkhorseOperationSessionPort,
} from "../index.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";

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

export class FakeQueue implements CodexWorkhorseQueue<OperationId> {
	readonly calls: string[] = [];
	state: SessionQueuedSubmission[] = [];
	nextError: Error | null = null;
	nextOutcome: QueueMutationOutcome = "delivered";
	nextStartTurnId: TurnId | null;
	beforeEffect: (() => void) | null = null;
	private nextId = 0;

	constructor(
		readonly identity: IdentityAuthority,
		readonly operation: OperationAuthority,
	) {
		this.nextStartTurnId = identity.decoder.adoptTurnId("queue-start-turn");
	}

	async list() {
		this.calls.push("list");
		return Object.freeze({ operation: "list" as const, queue: this.snapshot() });
	}

	async add(request: Parameters<CodexWorkhorseQueue<OperationId>["add"]>[0]) {
		this.calls.push("add");
		await this.authorize(request.beforeEffect);
		this.throwNext();
		const item = {
			id: this.identity.decoder.adoptQueuedSubmissionId("queue-" + this.nextId++),
			input: [createTextUserInput(request.prompt)],
			clientUserMessageId: this.operation.decoder.serializeOperationId(request.operationId),
		};
		if (this.nextOutcome === "delivered") this.state = [...this.state, item];
		return this.result("add", request.operationId);
	}

	async update(request: Parameters<CodexWorkhorseQueue<OperationId>["update"]>[0]) {
		this.calls.push("update");
		await this.authorize(request.beforeEffect);
		this.throwNext();
		this.state = this.state.map((item) =>
			item.id === request.submissionId
				? { ...item, input: [createTextUserInput(request.prompt)] }
				: item,
		);
		return this.result("update", request.operationId);
	}

	async delete(request: Parameters<CodexWorkhorseQueue<OperationId>["delete"]>[0]) {
		this.calls.push("delete");
		await this.authorize(request.beforeEffect);
		this.throwNext();
		this.state = this.state.filter((item) => item.id !== request.submissionId);
		return this.result("delete", request.operationId);
	}

	async reorder(request: Parameters<CodexWorkhorseQueue<OperationId>["reorder"]>[0]) {
		this.calls.push("reorder");
		await this.authorize(request.beforeEffect);
		this.throwNext();
		const byId = new Map(this.state.map((item) => [item.id, item]));
		this.state = request.orderedSubmissionIds.flatMap((id) => {
			const item = byId.get(id);
			return item === undefined ? [] : [item];
		});
		return this.result("reorder", request.operationId);
	}

	async start(request: Parameters<CodexWorkhorseQueue<OperationId>["start"]>[0]) {
		this.calls.push("start");
		await this.authorize(request.beforeEffect);
		this.throwNext();
		this.state = this.state.filter((item) => item.id !== request.submissionId);
		return Object.freeze({
			...this.result("start", request.operationId),
			turnId: this.nextOutcome === "not_delivered" ? null : this.nextStartTurnId,
		});
	}

	private snapshot(): QueueSnapshot {
		return Object.freeze([...this.state]);
	}

	private async authorize(hook: (() => void | Promise<void>) | undefined): Promise<void> {
		try {
			this.beforeEffect?.();
			await hook?.();
		} catch (error) {
			throw new CodexWorkhorseQueueError("authorization_failed", "revoked", {
				outcome: "not_delivered",
				cause: error,
			});
		}
	}

	private throwNext(): void {
		if (this.nextError === null) return;
		const error = this.nextError;
		this.nextError = null;
		throw error;
	}

	private result<Operation extends "add" | "update" | "delete" | "reorder" | "start">(
		operation: Operation,
		operationId: OperationId,
	) {
		return Object.freeze({
			operation,
			operationId,
			outcome: this.nextOutcome,
			queue: this.snapshot(),
		});
	}
}

export interface Fixture {
	readonly identity: IdentityAuthority;
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

export function fixture(initialStatus: "idle" | "active" = "idle"): Fixture {
	const authorities = createIdentityAuthorities();
	const identity = authorities.identity;
	const parent = mkdtempSync(join("/tmp", "archboard-workhorse-operations-"));
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
	const coordinatorThreadId = identity.decoder.adoptThreadId("coordinator");
	const workhorseThreadId = identity.decoder.adoptThreadId("workhorse");
	const coordinatorTurnId = identity.decoder.adoptTurnId("coordinator-turn");
	epoch.startEpoch(input(identity, "epoch-start", "epoch_start", "epoch/start"));
	const coordinatorProof = committedProof(
		epoch,
		identity,
		"coordinator-link",
		"link",
		coordinatorThreadId,
		"appServer",
		"turn/start",
	);
	const workhorseProof = committedProof(
		epoch,
		identity,
		"workhorse-create",
		"create_thread",
		workhorseThreadId,
		"archboard",
		"thread/start",
	);
	const attachedWorkhorseProof = committedProof(
		epoch,
		identity,
		"workhorse-attach",
		"link",
		workhorseThreadId,
		"attached",
		"thread/link",
	);
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
			namespace: ARCHBOARD_WORKHORSE_NAMESPACE.name,
			tool,
			manifestHash: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
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
			source: "appServer" as const,
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
				source: "appServer",
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
				source: "appServer",
				status: targetStatus,
				canAcceptDirectInput: targetControllable,
			},
			currentEpoch: { childId: identity.validator.childId, epoch: identity.validator.epoch },
			proof,
		} as unknown as ThreadLinkClassification;
	};
	const options: WorkhorseOperationOptions = {
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
			ArchboardContextSchema.parse({
				schema: 1,
				paneId: "pane",
				board: { note: "board", version: 0, cursor: null },
				threadLink: { state: "executable", reason: null },
				child: { id: String(identity.validator.childId), epoch: String(identity.validator.epoch) },
				workhorse: { threadId: String(workhorseThreadId), turnId: null },
				coordinator: { threadId: String(coordinatorThreadId), realtimeSessionId: null },
				semantic: { brief: "", capturedAtMs: 0, freshUntilMs: 0, truncated: false },
				focus: { paneId: null, capturedAtMs: 0 },
				selection: { elementIds: [], capturedAtMs: 0 },
				claim: { holder: "none", doing: null },
				ambiguity: [],
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
		cleanup: () => {
			epoch.close();
			rmSync(parent, { recursive: true, force: true });
		},
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
		workspaceRoot: "/workspace/archboard",
		instructionHash: INSTRUCTION_HASH,
		manifestHash: MANIFEST_HASH,
		expected: undefined,
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
