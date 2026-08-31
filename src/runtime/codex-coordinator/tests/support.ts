import {
	emptyManifest,
	type ActiveEpoch,
	type EpochConfirmation,
	type EpochExecutionRequest,
	type EpochOperationRecord,
	type EpochSnapshot,
	type EpochStageInput,
	type EpochTransaction,
} from "../../codex-epoch/index.js";
import type { ServerNotificationPayloads } from "../../codex-protocol/index.js";
import type {
	CodexSessionMutationError,
	SessionParams,
	SessionResponse,
	SessionThread,
} from "../../codex-session/index.js";
import type {
	CoordinatorEpochPort,
	CoordinatorModel,
	CoordinatorSessionPort,
	CoordinatorStartResponse,
	CoordinatorThreadLinkClassification,
	CoordinatorThreadLinkPort,
	CoordinatorThreadLinkTarget,
	CoordinatorThreadSettings,
} from "../index.js";
import { COORDINATOR_EFFORT, COORDINATOR_MODEL, createCodexCoordinator } from "../index.js";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";

export const CHECKOUT_ROOT = "/workspace/archboard";

export function coordinatorModel(overrides: Partial<CoordinatorModel> = {}): CoordinatorModel {
	return {
		id: COORDINATOR_MODEL,
		model: COORDINATOR_MODEL,
		upgrade: null,
		upgradeInfo: null,
		availabilityNux: null,
		displayName: "Luna",
		description: "coordinator fixture",
		modelSpecialty: null,
		hidden: false,
		supportedReasoningEfforts: [{ reasoningEffort: COORDINATOR_EFFORT, description: "fixture" }],
		defaultReasoningEffort: COORDINATOR_EFFORT,
		inputModalities: ["text"],
		supportsPersonality: false,
		multiAgentVersion: null,
		additionalSpeedTiers: [],
		serviceTiers: [{ id: "priority", name: "Priority", description: "fixture" }],
		defaultServiceTier: "priority",
		isDefault: true,
		...overrides,
	};
}

function startResponse(
	authority: IdentityAuthority,
	rawThreadId: string,
	serviceTier: "priority" | null,
): CoordinatorStartResponse {
	const thread: SessionThread = {
		id: authority.decoder.adoptThreadId(rawThreadId),
		extra: {},
		sessionId: "session-1",
		forkedFromId: null,
		parentThreadId: null,
		preview: "coordinator fixture",
		ephemeral: false,
		section: null,
		sectionEnteredAt: null,
		projectId: null,
		historyMode: "paginated",
		modelProvider: "openai",
		createdAt: 1,
		updatedAt: 2,
		recencyAt: null,
		status: { type: "idle" },
		path: null,
		cwd: CHECKOUT_ROOT,
		cliVersion: "0.151.0",
		source: "appServer",
		canAcceptDirectInput: true,
		threadSource: "archboard",
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
	};
	return {
		thread,
		model: COORDINATOR_MODEL,
		modelProvider: "openai",
		serviceTier,
		cwd: CHECKOUT_ROOT,
		runtimeWorkspaceRoots: [CHECKOUT_ROOT],
		instructionSources: [],
		approvalPolicy: "on-request",
		approvalsReviewer: "user",
		sandbox: { type: "dangerFullAccess" },
		activePermissionProfile: { id: "archboard-default", extends: null },
		reasoningEffort: COORDINATOR_EFFORT,
		multiAgentMode: "explicitRequestOnly",
	};
}

function settings(
	started: CoordinatorStartResponse,
	overrides: Partial<CoordinatorThreadSettings> = {},
): CoordinatorThreadSettings {
	return {
		cwd: CHECKOUT_ROOT,
		approvalPolicy: started.approvalPolicy,
		approvalsReviewer: started.approvalsReviewer,
		sandboxPolicy: started.sandbox,
		activePermissionProfile: started.activePermissionProfile,
		model: COORDINATOR_MODEL,
		modelProvider: started.modelProvider,
		serviceTier: started.serviceTier,
		effort: COORDINATOR_EFFORT,
		summary: "auto",
		collaborationMode: {
			mode: "default",
			settings: {
				model: COORDINATOR_MODEL,
				reasoning_effort: COORDINATOR_EFFORT,
				developer_instructions: null,
			},
		},
		multiAgentMode: "explicitRequestOnly",
		personality: null,
		...overrides,
	};
}

class FakeEpoch implements CoordinatorEpochPort {
	readonly records: EpochOperationRecord[] = [];
	readonly assertRequests: EpochExecutionRequest[] = [];
	unknownCalls = 0;
	private revision = 0;

	constructor(
		authority: IdentityAuthority,
		private readonly stageError: Error | null = null,
		private readonly commitError: Error | null = null,
		private readonly activeEpoch: ActiveEpoch | null = {
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			operationId: "epoch-start",
		},
	) {}

	snapshot(): EpochSnapshot {
		return {
			manifest: { ...emptyManifest(), activeEpoch: this.activeEpoch, records: this.records },
			cas: { revision: this.revision, bytesHash: null },
			manifestPath: "/tmp/fake-epoch-manifest.json",
			recordsPath: "/tmp/fake-epoch-records.json",
		};
	}

	stageOperation(input: EpochStageInput): EpochTransaction {
		if (this.stageError !== null) throw this.stageError;
		const record: EpochOperationRecord = {
			correlation: {
				childId: input.childId,
				epoch: input.epoch,
				operationId: input.operationId,
			},
			operation: {
				id: input.operationId,
				kind: input.kind,
				rpc: input.rpc ?? null,
			},
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
		this.records.push(record);
		this.revision += 1;
		return { record, cas: { revision: this.revision, bytesHash: null } };
	}

	commitOperation(
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		if (this.commitError !== null) throw this.commitError;
		const record = this.recordFor(transaction);
		return this.replace({
			...record,
			status: "committed",
			outcome: "delivered",
			provenance: {
				...record.provenance,
				threadId: confirmation?.threadId ?? null,
				threadSource: confirmation?.threadSource ?? null,
				confirmedAtMs: confirmation?.confirmedAtMs ?? 2,
			},
			reason: "effect confirmed",
			updatedAtMs: 2,
		});
	}

	rollbackOperation(transaction: EpochTransaction, reason: string): EpochOperationRecord {
		const record = this.recordFor(transaction);
		return this.replace({ ...record, status: "rolled_back", outcome: "not_delivered", reason });
	}

	markOutcomeUnknown(
		transaction: EpochTransaction,
		reason: string,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		this.unknownCalls += 1;
		const record = this.recordFor(transaction);
		return this.replace({
			...record,
			status: "inspect_only",
			outcome: "outcome_unknown",
			provenance: {
				...record.provenance,
				threadId: confirmation?.threadId ?? null,
				threadSource: confirmation?.threadSource ?? null,
				confirmedAtMs: confirmation?.confirmedAtMs ?? null,
			},
			reason,
			updatedAtMs: 2,
		});
	}

	assertCurrent(request: EpochExecutionRequest) {
		this.assertRequests.push(request);
		const record = this.records.find(
			(candidate) =>
				candidate.correlation.childId === request.childId &&
				candidate.correlation.epoch === request.epoch &&
				candidate.correlation.operationId === request.operationId &&
				candidate.provenance.threadId === request.threadId &&
				candidate.status === "committed" &&
				candidate.outcome === "delivered",
		);
		if (record === undefined) throw new Error("fake epoch proof unavailable");
		return { record, manifestRevision: this.revision };
	}

	private recordFor(transaction: EpochTransaction): EpochOperationRecord {
		const record = this.records.find(
			(candidate) =>
				candidate.correlation.operationId === transaction.record.correlation.operationId,
		);
		if (record === undefined) throw new Error("fake epoch transaction missing");
		return record;
	}

	private replace(record: EpochOperationRecord): EpochOperationRecord {
		const index = this.records.findIndex(
			(candidate) => candidate.correlation.operationId === record.correlation.operationId,
		);
		if (index < 0) throw new Error("fake epoch record missing");
		this.records[index] = record;
		this.revision += 1;
		return record;
	}
}

class FakeThreadLink implements CoordinatorThreadLinkPort {
	readonly calls: CoordinatorThreadLinkTarget[] = [];

	constructor(public outcome: CoordinatorThreadLinkClassification | Error) {}

	async classify(
		target: CoordinatorThreadLinkTarget,
	): Promise<CoordinatorThreadLinkClassification> {
		this.calls.push(target);
		if (this.outcome instanceof Error) throw this.outcome;
		return this.outcome;
	}
}

interface FakeSessionOptions {
	readonly model?: CoordinatorModel;
	readonly threadRawId?: string;
	readonly startError?: CodexSessionMutationError;
	readonly updateError?: CodexSessionMutationError;
	readonly settingsOverrides?: Partial<CoordinatorThreadSettings>;
	readonly staleNotificationAuthority?: IdentityAuthority;
	readonly emitSettings?: boolean;
	readonly deferSettingsUpdate?: boolean;
}

class FakeSession implements CoordinatorSessionPort {
	readonly modelRequests: Array<SessionParams<"model/list"> | undefined> = [];
	readonly startParams: Array<SessionParams<"thread/start">> = [];
	readonly updateParams: Array<SessionParams<"thread/settings/update">> = [];
	readonly started: CoordinatorStartResponse;
	readonly threadSettings: CoordinatorThreadSettings;
	notify: ((event: TransportServerNotification) => void) | undefined;

	constructor(
		private readonly authority: IdentityAuthority,
		private readonly modelValue: CoordinatorModel,
		private readonly startError: CodexSessionMutationError | null,
		private readonly updateError: CodexSessionMutationError | null,
		private readonly staleNotificationAuthority: IdentityAuthority | null,
		private readonly shouldEmitSettingsNotification: boolean,
		private readonly deferSettingsUpdate: boolean,
		threadRawId: string,
		settingsOverrides: Partial<CoordinatorThreadSettings>,
	) {
		const serviceTier = modelValue.serviceTiers.some((tier) => tier.id === "priority")
			? "priority"
			: null;
		this.started = startResponse(authority, threadRawId, serviceTier);
		this.threadSettings = settings(this.started, settingsOverrides);
	}

	private deferredSettingsUpdateRelease: (() => void) | null = null;

	async modelList(params?: SessionParams<"model/list">): Promise<SessionResponse<"model/list">> {
		this.modelRequests.push(params);
		return { data: [this.modelValue], nextCursor: null };
	}

	async threadStart(
		params: SessionParams<"thread/start">,
	): Promise<SessionResponse<"thread/start">> {
		this.startParams.push(params);
		if (this.startError !== null) throw this.startError;
		return this.started;
	}

	async threadSettingsUpdate(
		params: SessionParams<"thread/settings/update">,
	): Promise<SessionResponse<"thread/settings/update">> {
		this.updateParams.push(params);
		if (this.updateError !== null) throw this.updateError;
		if (this.deferSettingsUpdate) {
			await new Promise<void>((resolve) => {
				this.deferredSettingsUpdateRelease = resolve;
			});
		}
		if (this.staleNotificationAuthority !== null) {
			this.sendSettingsNotification(this.staleNotificationAuthority);
		}
		if (this.shouldEmitSettingsNotification) this.sendSettingsNotification(this.authority);
		return {};
	}

	releaseSettingsUpdate(): void {
		const release = this.deferredSettingsUpdateRelease;
		this.deferredSettingsUpdateRelease = null;
		release?.();
	}

	private sendSettingsNotification(authority: IdentityAuthority): void {
		this.emitSettingsNotification(this.threadSettings, authority);
	}

	emitSettingsNotification(
		threadSettings: CoordinatorThreadSettings = this.threadSettings,
		authority: IdentityAuthority = this.authority,
	): void {
		const rawThreadId = this.authority.decoder.serializeCodexIdentity(this.started.thread.id);
		const notification: ServerNotificationPayloads["thread/settings/updated"] = {
			threadId: rawThreadId,
			threadSettings,
		};
		this.notify?.({
			correlation: {
				child: authority.validator.childId,
				epoch: authority.validator.epoch,
				requestId: null,
			},
			notification: { method: "thread/settings/updated", params: notification },
		});
	}
}

export interface FixtureOptions extends FakeSessionOptions {
	readonly stageError?: Error;
	readonly commitError?: Error;
	readonly activeEpoch?: ActiveEpoch | null;
}

export interface Fixture {
	readonly authority: IdentityAuthority;
	readonly epoch: FakeEpoch;
	readonly link: FakeThreadLink;
	readonly session: FakeSession;
	readonly coordinator: ReturnType<typeof createCodexCoordinator>;
}

export function fixture(options: FixtureOptions = {}): Fixture {
	const authority = createIdentityAuthority();
	const modelValue = options.model ?? coordinatorModel();
	const epoch = new FakeEpoch(
		authority,
		options.stageError ?? null,
		options.commitError ?? null,
		options.activeEpoch === undefined
			? {
					childId: authority.validator.childId,
					epoch: authority.validator.epoch,
					operationId: "epoch-start",
				}
			: options.activeEpoch,
	);
	const link = new FakeThreadLink(new Error("thread-link classification was not requested"));
	const session = new FakeSession(
		authority,
		modelValue,
		options.startError ?? null,
		options.updateError ?? null,
		options.staleNotificationAuthority ?? null,
		options.emitSettings ?? true,
		options.deferSettingsUpdate ?? false,
		options.threadRawId ?? "coordinator-thread",
		options.settingsOverrides ?? {},
	);
	const coordinator = createCodexCoordinator({
		session,
		threadLink: link,
		epoch,
		identity: authority,
		checkoutRoot: CHECKOUT_ROOT,
	});
	session.notify = coordinator.onNotification;
	return { authority, epoch, link, session, coordinator };
}
