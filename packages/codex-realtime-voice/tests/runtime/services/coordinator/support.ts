import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";
import {
	CODEX_PROTOCOL_VERSION,
	type ServerNotificationPayloads,
} from "@archboard/codex-app-server/protocol";
import { type ActiveEpoch } from "#runtime/store/epoch/manifest-contract.ts";
import type {
	CodexSessionMutationError,
	SessionParams,
	SessionResponse,
	SessionThread,
} from "@archboard/codex-app-server/session";
import {
	type CoordinatorModel,
	type CoordinatorSessionPort,
	type CoordinatorStartResponse,
	type CoordinatorThreadLinkClassification,
	type CoordinatorThreadLinkPort,
	type CoordinatorThreadLinkTarget,
	type CoordinatorThreadSettings,
} from "#runtime/protocol/coordinator/contract.ts";
import { COORDINATOR_EFFORT, COORDINATOR_MODEL } from "#runtime/services/coordinator/model.ts";
import { createCodexCoordinator } from "#runtime/services/coordinator/coordinator.ts";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "@archboard/codex-app-server/identity";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import { FakeEpoch } from "#tests/runtime/services/coordinator/fake-epoch.ts";

const WORKING_DIRECTORY = "/state/codex-workbench/coordinator";

function coordinatorModel(overrides: Partial<CoordinatorModel> = {}): CoordinatorModel {
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
		availableAccessPrograms: null,
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
		cwd: WORKING_DIRECTORY,
		cliVersion: CODEX_PROTOCOL_VERSION,
		source: "vscode",
		canAcceptDirectInput: true,
		threadSource: "test-host",
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
		environments: null,
		model: null,
		reasoningEffort: null,
		originator: null,
		daybreakEnabled: null,
	};
	return {
		thread,
		model: COORDINATOR_MODEL,
		modelProvider: "openai",
		serviceTier,
		cwd: WORKING_DIRECTORY,
		runtimeWorkspaceRoots: [WORKING_DIRECTORY],
		instructionSources: [],
		approvalPolicy: "on-request",
		approvalsReviewer: "user",
		sandbox: { type: "dangerFullAccess" },
		activePermissionProfile: { id: "example-default", extends: null },
		reasoningEffort: COORDINATOR_EFFORT,
		multiAgentMode: "explicitRequestOnly",
		disabledPluginIds: [],
	};
}

function settings(
	started: CoordinatorStartResponse,
	overrides: Partial<CoordinatorThreadSettings> = {},
): CoordinatorThreadSettings {
	return {
		cwd: WORKING_DIRECTORY,
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
		disabledPluginIds: [],
		personality: null,
		...overrides,
	};
}

class FakeThreadLink implements CoordinatorThreadLinkPort {
	readonly calls: CoordinatorThreadLinkTarget[] = [];

	constructor(public outcome: CoordinatorThreadLinkClassification | Error) {}

	async classify(
		target: CoordinatorThreadLinkTarget,
	): Promise<CoordinatorThreadLinkClassification> {
		this.calls.push(target);
		if (this.outcome instanceof Error) {
			throw this.outcome;
		}
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
	/** The models model/list advertises; a test replaces it to change the catalog between attempts. */
	advertised: CoordinatorModel[];
	started: CoordinatorStartResponse;
	threadSettings: CoordinatorThreadSettings;
	notify: ((event: TransportServerNotification) => void) | undefined;
	/** Called as each thread/start arrives, before it answers. */
	onStart: (() => void) | undefined;
	private readonly serviceTier: "priority" | null;

	constructor(
		private readonly authority: IdentityAuthority,
		modelValue: CoordinatorModel,
		public startError: CodexSessionMutationError | null,
		private readonly updateError: CodexSessionMutationError | null,
		private readonly staleNotificationAuthority: IdentityAuthority | null,
		private readonly shouldEmitSettingsNotification: boolean,
		private readonly deferSettingsUpdate: boolean,
		threadRawId: string,
		settingsOverrides: Partial<CoordinatorThreadSettings>,
	) {
		this.advertised = [modelValue];
		this.serviceTier = modelValue.serviceTiers.some((tier) => tier.id === "priority")
			? "priority"
			: null;
		this.started = startResponse(authority, threadRawId, this.serviceTier);
		this.threadSettings = settings(this.started, settingsOverrides);
	}

	/**
	 * Answer the next thread/start with another thread.
	 * @param threadRawId The next thread's raw id.
	 */
	nextThread(threadRawId: string): void {
		this.started = startResponse(this.authority, threadRawId, this.serviceTier);
		this.threadSettings = settings(this.started, {});
	}

	private deferredSettingsUpdateRelease: (() => void) | null = null;

	async modelList(params?: SessionParams<"model/list">): Promise<SessionResponse<"model/list">> {
		this.modelRequests.push(params);
		return { data: this.advertised, nextCursor: null };
	}

	async threadStart(
		params: SessionParams<"thread/start">,
	): Promise<SessionResponse<"thread/start">> {
		this.startParams.push(params);
		this.onStart?.();
		if (this.startError !== null) {
			throw this.startError;
		}
		return this.started;
	}

	async threadSettingsUpdate(
		params: SessionParams<"thread/settings/update">,
	): Promise<SessionResponse<"thread/settings/update">> {
		this.updateParams.push(params);
		if (this.updateError !== null) {
			throw this.updateError;
		}
		if (this.deferSettingsUpdate) {
			await new Promise<void>((resolve) => {
				this.deferredSettingsUpdateRelease = resolve;
			});
		}
		if (this.staleNotificationAuthority !== null) {
			this.sendSettingsNotification(this.staleNotificationAuthority);
		}
		if (this.shouldEmitSettingsNotification) {
			this.sendSettingsNotification(this.authority);
		}
		return {};
	}

	readonly unsubscribeParams: Array<SessionParams<"thread/unsubscribe">> = [];
	/** The status each thread/read answers with. */
	readStatus: SessionThread["status"] = { type: "idle" };
	/** Called as each thread/read arrives, before it answers. */
	onRead: (() => void) | undefined;
	unsubscribeError: CodexSessionMutationError | null = null;

	async threadRead(params: SessionParams<"thread/read">): Promise<SessionResponse<"thread/read">> {
		this.onRead?.();
		return { thread: { ...this.started.thread, id: params.threadId, status: this.readStatus } };
	}

	async threadUnsubscribe(
		params: SessionParams<"thread/unsubscribe">,
	): Promise<SessionResponse<"thread/unsubscribe">> {
		this.unsubscribeParams.push(params);
		if (this.unsubscribeError !== null) {
			throw this.unsubscribeError;
		}
		return { status: "unsubscribed" };
	}

	/**
	 * Send a notification from the current child.
	 * @param notification The notification.
	 */
	emit(notification: TransportServerNotification["notification"]): void {
		this.notify?.({
			correlation: {
				child: this.authority.validator.childId,
				epoch: this.authority.validator.epoch,
				requestId: null,
			},
			notification,
		});
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

interface FixtureOptions extends FakeSessionOptions {
	readonly stageError?: Error;
	readonly commitError?: Error;
	readonly activeEpoch?: ActiveEpoch | null;
}

interface Fixture {
	readonly authority: IdentityAuthority;
	readonly epoch: FakeEpoch;
	readonly link: FakeThreadLink;
	readonly session: FakeSession;
	readonly coordinator: ReturnType<typeof createCodexCoordinator>;
}

function fixture(options: FixtureOptions = {}): Fixture {
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
		workingDirectory: WORKING_DIRECTORY,
		profile: TEST_INSTRUCTIONS.coordinator,
	});
	session.notify = coordinator.onNotification;
	return { authority, epoch, link, session, coordinator };
}

export { WORKING_DIRECTORY, coordinatorModel, type FixtureOptions, type Fixture, fixture };
