import type {
	EpochConfirmation,
	EpochOperationRecord,
	EpochSnapshot,
	EpochStageInput,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import { emptyManifest } from "../../codex-epoch/index.js";
import type { ReverseResponse, ResponseOwner } from "../../codex-transport/server-requests.js";
import type {
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	OperationId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { GeneralThreadToolName } from "../../codex-thread-tools/index.js";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicContextAuthority,
	DynamicImmutableEffect,
	DynamicTargetAuthority,
	DynamicThreadAuthorityPort,
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
} from "../index.js";
import type { ThreadLinkTarget } from "../../codex-thread-link/index.js";
import type { CodexWaitGraph } from "../../codex-wait-graph/index.js";
import {
	CALLER_WIRE_ID,
	CHECKOUT_ROOT,
	authorityToken,
	callerAuthority,
	contextFor,
	targetAuthority,
	type AuthorityIds,
} from "./fixtures.js";
import { FakeLifecycle } from "./lifecycle-fake.js";
import { FakeSession } from "./session-fake.js";
import { FakeOperationIds } from "./operation-id-fake.js";

export class FakeEpoch {
	readonly stages: EpochStageInput[] = [];
	readonly settlements: Array<{ readonly operationId: string; readonly outcome: string }> = [];
	readonly commitConfirmations: Array<EpochConfirmation | undefined> = [];
	stageError: Error | null = null;
	commitError: Error | null = null;
	commitErrorAt: number | null = null;
	rollbackError: Error | null = null;
	unknownError: Error | null = null;
	private commitAttempts = 0;
	private revision = 0;

	constructor(private readonly authorities: AuthorityIds) {}

	snapshot(): EpochSnapshot {
		const manifest = emptyManifest();
		return {
			manifest: {
				...manifest,
				revision: this.revision,
				activeEpoch: {
					childId: this.authorities.identity.validator.childId,
					epoch: this.authorities.identity.validator.epoch,
					operationId: "epoch-start",
				},
			},
			cas: { revision: this.revision, bytesHash: null },
			manifestPath: "/tmp/fake-epoch-manifest.json",
			recordsPath: "/tmp/fake-epoch-records.json",
		};
	}

	stageOperation(input: EpochStageInput): EpochTransaction {
		if (this.stageError !== null) throw this.stageError;
		this.stages.push(input);
		const record: EpochOperationRecord = {
			correlation: { childId: input.childId, epoch: input.epoch, operationId: input.operationId },
			operation: { id: input.operationId, kind: input.kind, rpc: input.rpc ?? null },
			status: "staged",
			outcome: "pending",
			provenance: {
				childId: input.childId,
				epoch: input.epoch,
				threadId: null,
				turnId: null,
				threadSource: null,
				workspaceRoot: input.workspaceRoot,
				instructionHash: input.instructionHash,
				manifestHash: input.manifestHash,
				confirmedAtMs: null,
			},
			reason: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		};
		this.revision += 1;
		return { record, cas: { revision: this.revision, bytesHash: null } };
	}

	commitOperation(
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		this.commitAttempts += 1;
		this.commitConfirmations.push(confirmation);
		if (
			this.commitError !== null &&
			(this.commitErrorAt === null || this.commitErrorAt === this.commitAttempts)
		)
			throw this.commitError;
		this.settlements.push({ operationId: transaction.record.operation.id, outcome: "delivered" });
		return terminalRecord(transaction.record, "committed", "delivered", confirmation);
	}

	rollbackOperation(transaction: EpochTransaction, reason: string): EpochOperationRecord {
		if (this.rollbackError !== null) throw this.rollbackError;
		this.settlements.push({
			operationId: transaction.record.operation.id,
			outcome: "not_delivered",
		});
		return terminalRecord(transaction.record, "rolled_back", "not_delivered", {
			threadSource: reason,
		});
	}

	markOutcomeUnknown(
		transaction: EpochTransaction,
		reason: string,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		if (this.unknownError !== null) throw this.unknownError;
		this.settlements.push({
			operationId: transaction.record.operation.id,
			outcome: "outcome_unknown",
		});
		return terminalRecord(transaction.record, "inspect_only", "outcome_unknown", {
			...confirmation,
			threadSource: reason,
		});
	}
}

function terminalRecord(
	record: EpochOperationRecord,
	status: EpochOperationRecord["status"],
	outcome: EpochOperationRecord["outcome"],
	confirmation?: EpochConfirmation,
): EpochOperationRecord {
	return {
		...record,
		status,
		outcome,
		provenance: {
			...record.provenance,
			threadId: confirmation?.threadId ?? null,
			turnId: confirmation?.turnId ?? null,
			threadSource: confirmation?.threadSource ?? null,
			confirmedAtMs: confirmation?.confirmedAtMs ?? 2,
		},
		reason: "fixture settled",
		updatedAtMs: 2,
	};
}

export class FakeApproval implements DynamicToolApprovalPort {
	readonly presented: DynamicImmutableEffect[] = [];
	readonly settled: Array<{
		readonly request: Parameters<
			DynamicToolApprovalPort["settleIdentityAndEffectHashOnce"]
		>[0]["request"];
		readonly decision: DynamicToolApprovalDecision;
	}> = [];

	constructor(
		private readonly choose: (
			request: Parameters<DynamicToolApprovalPort["awaitOneExactVisualDecision"]>[0],
		) => DynamicToolApprovalDecision,
	) {}

	presentImmutableRequest(
		request: Parameters<DynamicToolApprovalPort["presentImmutableRequest"]>[0],
	): void {
		this.presented.push(request.effect);
	}

	async awaitOneExactVisualDecision(
		request: Parameters<DynamicToolApprovalPort["awaitOneExactVisualDecision"]>[0],
	): Promise<DynamicToolApprovalDecision> {
		return this.choose(request);
	}

	settleIdentityAndEffectHashOnce(
		input: Parameters<DynamicToolApprovalPort["settleIdentityAndEffectHashOnce"]>[0],
	): void {
		this.settled.push(input);
	}
}

export function approvedFor(
	request: Parameters<DynamicToolApprovalPort["awaitOneExactVisualDecision"]>[0],
	nowMs: number,
): DynamicToolApprovalDecision {
	return {
		outcome: "approved",
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs: nowMs,
		cause: "person_approved",
	};
}

export class FakeThreadAuthority implements DynamicThreadAuthorityPort {
	caller: DynamicCallerAuthority;
	readonly targets = new Map<string, DynamicTargetAuthority>();
	boundary: TurnId | null = null;
	callerError: Error | null = null;
	targetError: Error | null = null;
	revalidateCallerError: Error | null = null;
	revalidateTargetError: Error | null = null;

	constructor(caller: DynamicCallerAuthority) {
		this.caller = caller;
	}

	async resolveExactLogicalCaller(): Promise<DynamicCallerAuthority> {
		if (this.callerError !== null) throw this.callerError;
		return this.caller;
	}

	async classifyExactTarget(input: {
		readonly threadId: unknown;
	}): Promise<DynamicTargetAuthority> {
		if (this.targetError !== null) throw this.targetError;
		const target =
			this.targets.get(String(input.threadId)) ??
			[...this.targets.values()].find((candidate) => candidate.threadId === input.threadId);
		if (target === undefined) throw new Error(`no target for ${String(input.threadId)}`);
		return target;
	}

	async resolveExactTurnBoundary(): Promise<TurnId | null> {
		return this.boundary;
	}

	async revalidateCaller(): Promise<DynamicCallerAuthority> {
		if (this.revalidateCallerError !== null) throw this.revalidateCallerError;
		return this.caller;
	}

	async revalidateTarget(target: DynamicTargetAuthority): Promise<DynamicTargetAuthority> {
		if (this.revalidateTargetError !== null) throw this.revalidateTargetError;
		return this.targets.get(target.wireThreadId) ?? target;
	}
}

export function optionsFor(
	authorities: AuthorityIds,
	caller: DynamicCallerAuthority,
	overrides: Partial<CodexDynamicToolsOptions> = {},
): {
	readonly options: CodexDynamicToolsOptions;
	readonly session: FakeSession;
	readonly epoch: FakeEpoch;
	readonly approval: FakeApproval;
	readonly lifecycle: FakeLifecycle;
	readonly threadAuthority: FakeThreadAuthority;
	readonly operationIds: FakeOperationIds;
	readonly transportResponses: Array<{
		readonly request: unknown;
		readonly owner: ResponseOwner;
		readonly response: ReverseResponse;
	}>;
	readonly contextReads: Array<{ readonly operationId: OperationId; readonly kind: string }>;
} {
	const session = new FakeSession();
	const epoch = new FakeEpoch(authorities);
	const threadAuthority = new FakeThreadAuthority(caller);
	const operationIds = new FakeOperationIds(authorities);
	const lifecycle = new FakeLifecycle();
	const transportResponses: Array<{
		readonly request: unknown;
		readonly owner: ResponseOwner;
		readonly response: ReverseResponse;
	}> = [];
	const contextReads: Array<{ readonly operationId: OperationId; readonly kind: string }> = [];
	const contextAuthority: DynamicContextAuthority = {
		token: authorityToken("pane-authority"),
		paneId: "pane-1",
		childId: caller.childId,
		epoch: caller.epoch,
		threadId: caller.threadId,
		turnId: caller.turnId,
	};
	const approval = new FakeApproval((request) => approvedFor(request, 100));
	const context = {
		issueAndRevalidatePaneLinkAuthority: () => contextAuthority,
		readOneFreshArchboardContext: async (input: {
			readonly caller: DynamicCallerAuthority;
			readonly authority: DynamicContextAuthority;
			readonly operationId: OperationId;
			readonly kind:
				| "create_thread_initial_turn"
				| "fork_thread_initial_turn"
				| "send_message_to_thread";
			readonly rpc: "turn/start";
			targetThreadId?: ThreadId;
		}) => {
			contextReads.push({ operationId: input.operationId, kind: input.kind });
			return contextFor(
				input.caller,
				String(operationIds.serializeForOwnedWireFields(input.operationId)),
				input.kind,
			);
		},
	};
	const transport = {
		respond: async (
			request: unknown,
			owner: ResponseOwner,
			response: ReverseResponse,
		): Promise<void> => {
			transportResponses.push({ request, owner, response });
		},
	};
	const options = {
		session,
		transport,
		threadLink: {
			classify: async (target: ThreadLinkTarget) => {
				const authority =
					threadAuthority.targets.get(String(target.threadId)) ??
					[...threadAuthority.targets.values()].find(
						(candidate) => candidate.threadId === target.threadId,
					) ??
					(String(target.threadId) === String(caller.threadId) ? caller : undefined);
				if (authority?.linkClassification === undefined)
					throw new Error("missing thread-link fixture");
				return authority.linkClassification;
			},
		},
		epoch,
		waitGraph:
			overrides.waitGraph ??
			({
				addEdgeSet: () => ({ ok: true, edges: [] }),
				release: () => [],
				inspect: () => [],
			} as CodexWaitGraph),
		approval,
		threadAuthority,
		context,
		operationId: operationIds,
		lifecycle,
		checkoutRoot: CHECKOUT_ROOT,
		now: () => 100,
		...overrides,
	};
	return {
		options,
		session,
		epoch,
		approval,
		lifecycle,
		threadAuthority,
		operationIds,
		transportResponses,
		contextReads,
	};
}

export function setupAuthorities(): {
	readonly authorities: AuthorityIds;
	readonly caller: DynamicCallerAuthority;
	readonly otherTarget: DynamicTargetAuthority;
	readonly selfTarget: DynamicTargetAuthority;
} {
	const authorities = createIdentityAuthorities();
	const caller = callerAuthority(authorities);
	const otherTarget = targetAuthority(authorities, "other-thread", caller);
	const selfTarget = targetAuthority(authorities, CALLER_WIRE_ID, caller, {
		threadId: caller.threadId,
		wireThreadId: caller.wireThreadId,
		status: "active",
		linkClassification: caller.linkClassification,
		provenance: caller.provenance,
		threadLinkTarget: caller.threadLinkTarget,
	});
	return { authorities, caller, otherTarget, selfTarget };
}

export function dynamicDecision(
	request: Parameters<DynamicToolApprovalPort["awaitOneExactVisualDecision"]>[0],
	decision: Pick<DynamicToolApprovalDecision, "outcome" | "cause">,
	nowMs = request.createdAtMs,
): DynamicToolApprovalDecision {
	return {
		...decision,
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs: nowMs,
	};
}

export type FixtureDynamicTool = GeneralThreadToolName;
export type FixtureChildEpoch = ChildEpoch;
export type FixtureChildId = ChildId;
export type FixtureDynamicCallId = DynamicToolCallId;
