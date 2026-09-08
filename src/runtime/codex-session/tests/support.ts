import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	createIdentityAuthority,
	type IdentityAuthority,
	type WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCodexSession, type CodexSession, type CodexSessionStorage } from "../index.js";
import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import type {
	CodexTransport,
	CodexTransportRequestOptions,
	CodexTransportResponse,
} from "../../codex-transport/index.js";
import type {
	DynamicDispatcherRegistration,
	ResponseOwner,
	ReverseResponse,
	TransportServerNotification,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type {
	TransportExit,
	TransportIssue,
	TransportLateResponse,
	TransportSnapshot,
	TransportStderrChunk,
	TransportStderrSnapshot,
	Unsubscribe,
} from "../../codex-transport/diagnostics.js";

export interface RequestRecord {
	readonly method: ResponseMethod;
	readonly params: unknown;
	readonly options: CodexTransportRequestOptions | undefined;
}

export interface ReverseResponseRecord {
	readonly request: TransportServerRequest;
	readonly owner: ResponseOwner;
	readonly response: ReverseResponse;
}

type ResponseValue = unknown;

export class FakeTransport implements CodexTransport {
	readonly requests: RequestRecord[] = [];
	readonly notifications: string[] = [];
	readonly reverseResponses: ReverseResponseRecord[] = [];
	private readonly responseQueues = new Map<ResponseMethod, ResponseValue[]>();
	private identity: IdentityAuthority;
	private notificationListener: ((event: TransportServerNotification) => void) | undefined;
	private requestListener: ((request: TransportServerRequest) => void) | undefined;
	beforeRequest: ((method: ResponseMethod, params: unknown) => void) | undefined;
	beforeNotificationWrite: ((method: "initialized") => void) | undefined;
	nextResponseCorrelation: WireRequestCorrelation | undefined;

	constructor(identity: IdentityAuthority) {
		this.identity = identity;
	}

	replaceIdentity(identity: IdentityAuthority): void {
		this.identity = identity;
	}

	enqueueResponse<Method extends ResponseMethod>(
		method: Method,
		response: ResponsePayloads[Method] | Error,
	): void {
		const queue = this.responseQueues.get(method) ?? [];
		queue.push(response);
		this.responseQueues.set(method, queue);
	}

	prependResponse<Method extends ResponseMethod>(
		method: Method,
		response: ResponsePayloads[Method] | Error,
	): void {
		const queue = this.responseQueues.get(method) ?? [];
		queue.unshift(response);
		this.responseQueues.set(method, queue);
	}

	async request<Method extends ResponseMethod>(
		method: Method,
		params: unknown,
		options?: CodexTransportRequestOptions,
	): Promise<CodexTransportResponse<Method>> {
		this.requests.push({ method, params, options });
		this.beforeRequest?.(method, params);
		const queue = this.responseQueues.get(method);
		const value = queue?.shift();
		if (value === undefined) throw new Error(`no fake response for ${method}`);
		if (value instanceof Error) throw value;
		const requestId = this.identity.issuer.mintJsonRpcRequestId();
		const correlation =
			this.nextResponseCorrelation ??
			this.identity.decoder.createWireRequestCorrelation({ requestId });
		this.nextResponseCorrelation = undefined;
		return {
			method,
			correlation,
			result: value as ResponsePayloads[Method],
		};
	}

	async sendNotification(method: "initialized"): Promise<void> {
		this.notifications.push(method);
		this.beforeNotificationWrite?.(method);
	}

	registerDynamicDispatcher(_registration: DynamicDispatcherRegistration): void {}

	ownsPendingReverseRequest(): boolean {
		return true;
	}

	async respond(
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	): Promise<void> {
		this.reverseResponses.push({ request, owner, response });
	}

	onServerRequest(listener: (request: TransportServerRequest) => void): Unsubscribe {
		this.requestListener = listener;
		return () => {
			if (this.requestListener === listener) this.requestListener = undefined;
		};
	}

	onServerNotification(listener: (event: TransportServerNotification) => void): Unsubscribe {
		this.notificationListener = listener;
		return () => {
			if (this.notificationListener === listener) this.notificationListener = undefined;
		};
	}

	onIssue(_listener: (issue: TransportIssue) => void): Unsubscribe {
		return () => undefined;
	}

	onStderr(_listener: (chunk: TransportStderrChunk) => void): Unsubscribe {
		return () => undefined;
	}

	onExit(_listener: (exit: TransportExit) => void): Unsubscribe {
		return () => undefined;
	}

	inspect(): TransportSnapshot {
		return {
			state: "open",
			pendingRequests: 0,
			pendingReverseRequests: 0,
			pendingReverseBytes: 0,
			queuedFrames: 0,
			queuedBytes: 0,
			writeInFlight: false,
			maxQueuedFrames: 0,
			maxQueuedBytes: 0,
			responseQueuedFrames: 0,
			responseQueuedBytes: 0,
			maxResponseQueuedFrames: 0,
			maxResponseQueuedBytes: 0,
			maxPendingReverseRequests: 0,
			maxPendingReverseBytes: 0,
		};
	}

	inspectLateResponses(): readonly TransportLateResponse[] {
		return [];
	}

	inspectIssues(): readonly TransportIssue[] {
		return [];
	}

	inspectStderr(): TransportStderrSnapshot {
		return { text: "", retainedBytes: 0, totalBytes: 0, truncated: false };
	}

	async shutdown(): Promise<void> {}

	emitNotification(event: TransportServerNotification): void {
		this.notificationListener?.(event);
	}

	emitServerRequest(request: TransportServerRequest): void {
		this.requestListener?.(request);
	}
}

export const configFixture = (
	sqliteHome: string,
	configPath: string,
): ResponsePayloads["config/read"] => ({
	config: {
		model: null,
		review_model: null,
		model_context_window: null,
		model_auto_compact_token_limit: null,
		model_auto_compact_token_limit_scope: null,
		model_provider: null,
		approval_policy: null,
		approvals_reviewer: null,
		sandbox_mode: null,
		sandbox_workspace_write: null,
		forced_chatgpt_workspace_id: null,
		forced_login_method: null,
		web_search: null,
		tools: null,
		instructions: null,
		developer_instructions: null,
		compact_prompt: null,
		model_reasoning_effort: null,
		model_reasoning_summary: null,
		model_verbosity: null,
		service_tier: null,
		analytics: null,
		apps: null,
		browser_use: null,
		computer_use: null,
		desktop: null,
		sqlite_home: sqliteHome,
	},
	origins: {
		sqlite_home: {
			name: { type: "user", file: configPath, profile: null },
			version: "fixture",
		},
	},
	layers: null,
});

export const modelFixture = {
	id: "gpt-5.6-luna",
	model: "gpt-5.6-luna",
	upgrade: null,
	upgradeInfo: null,
	availabilityNux: null,
	displayName: "Luna",
	description: "fixture",
	modelSpecialty: null,
	hidden: false,
	supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "fixture" }],
	defaultReasoningEffort: "medium",
	inputModalities: ["text"],
	supportsPersonality: false,
	multiAgentVersion: null,
	additionalSpeedTiers: [],
	serviceTiers: [],
	defaultServiceTier: null,
	isDefault: true,
} satisfies ResponsePayloads["model/list"]["data"][number];

export const requirementsFixture = (
	sqliteHome: string | null,
): ResponsePayloads["configRequirements/read"] => ({
	requirements: {
		cliAuthCredentialsStore: null,
		chatgptBaseUrl: null,
		additionalDeveloperInstructions: null,
		allowedApprovalPolicies: null,
		allowedApprovalsReviewers: null,
		allowedSandboxModes: null,
		allowedWindowsSandboxImplementations: null,
		allowedPermissionProfiles: null,
		defaultPermissions: null,
		allowedWebSearchModes: null,
		allowManagedHooksOnly: null,
		allowBrowserAndComputerUse: null,
		allowAppshots: null,
		allowRemoteControl: null,
		computerUse: null,
		browserUse: null,
		inAppBrowser: null,
		featureRequirements: null,
		hooks: null,
		enforceResidency: null,
		network: null,
		autoReview: null,
		models: null,
		sqliteHome,
		logDir: null,
		modelCatalogJson: null,
		checkForUpdateOnStartup: null,
		allowLoginShell: null,
		feedback: null,
		windowsSandboxPrivateDesktop: null,
	},
});

export const threadItemFixture = {
	type: "userMessage",
	id: "item-1",
	clientId: null,
	content: [{ type: "text", text: "hello", text_elements: [] }],
} satisfies ResponsePayloads["thread/items/list"]["data"][number]["item"];

export const turnFixture = {
	id: "turn-1",
	items: [threadItemFixture],
	itemsView: "full",
	status: "completed",
	error: null,
	startedAt: 1,
	completedAt: 2,
	durationMs: 1,
} satisfies ResponsePayloads["turn/start"]["turn"];

export const threadFixture = {
	id: "thread-1",
	extra: {},
	sessionId: "session-1",
	forkedFromId: null,
	parentThreadId: null,
	preview: "fixture",
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
	cwd: "/tmp/archboard",
	cliVersion: "0.151.0",
	source: "appServer",
	canAcceptDirectInput: true,
	threadSource: "archboard",
	agentNickname: null,
	agentRole: null,
	gitInfo: null,
	name: null,
	turns: [turnFixture],
} satisfies ResponsePayloads["thread/read"]["thread"];

export const emptyResponse = {};

export function makeStorage(): { readonly root: string; readonly storage: CodexSessionStorage } {
	const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "archboard-session-")));
	const codexHome = path.join(root, "codex-home");
	const sqliteHome = path.join(root, "sqlite-home");
	const configPath = path.join(codexHome, "config.toml");
	mkdirSync(codexHome, { mode: 0o700 });
	mkdirSync(sqliteHome, { mode: 0o700 });
	writeFileSync(configPath, `sqlite_home = ${JSON.stringify(sqliteHome)}\n`, { mode: 0o600 });
	return { root, storage: { codexHome, sqliteHome, configPath } };
}

export interface SessionFixture {
	readonly root: string;
	readonly storage: CodexSessionStorage;
	readonly checkoutRoot: string;
	readonly identity: IdentityAuthority;
	readonly transport: FakeTransport;
	readonly session: CodexSession;
	readonly lifecycle: {
		readonly appServerReady: () => number;
		readonly accountReady: () => number;
		readonly terminalFailure: () => number;
	};
	readonly events: TransportServerNotification[];
	readonly close: () => void;
}

export function createSessionFixture(
	options: {
		readonly requirements?: unknown;
		readonly config?: unknown;
		readonly storage?: CodexSessionStorage;
		readonly storageTransform?: (storage: CodexSessionStorage) => CodexSessionStorage;
		readonly checkoutRoot?: string;
		readonly initializeCodexHome?: string;
		readonly onNotification?: (event: TransportServerNotification) => void;
		readonly listenerOwnership?: "self" | "composition";
		readonly now?: () => number;
	} = {},
): SessionFixture {
	const { root, storage: createdStorage } = makeStorage();
	const storage = options.storage ?? options.storageTransform?.(createdStorage) ?? createdStorage;
	const checkoutRoot = realpathSync(options.checkoutRoot ?? process.cwd());
	const identity = createIdentityAuthority();
	const transport = new FakeTransport(identity);
	transport.enqueueResponse("initialize", {
		userAgent: "Codex Desktop/0.151.0",
		codexHome: options.initializeCodexHome ?? storage.codexHome,
		platformFamily: "unix",
		platformOs: "linux",
	});
	transport.enqueueResponse(
		"configRequirements/read",
		(options.requirements ?? requirementsFixture(null)) as never,
	);
	transport.enqueueResponse(
		"config/read",
		(options.config ?? configFixture(storage.sqliteHome, storage.configPath)) as never,
	);
	const events: TransportServerNotification[] = [];
	let appServerReady = 0;
	let accountReady = 0;
	let terminalFailure = 0;
	const lifecycle = {
		markAppServerReady: () => {
			appServerReady += 1;
		},
		markAccountReady: () => {
			accountReady += 1;
		},
		markTerminalFailure: () => {
			terminalFailure += 1;
		},
	};
	const session = createCodexSession({
		transport,
		identity,
		storage,
		checkoutRoot,
		lifecycle,
		...(options.now === undefined ? {} : { now: options.now }),
		onNotification: (event) => {
			events.push(event);
			options.onNotification?.(event);
		},
		...(options.listenerOwnership === undefined
			? {}
			: { listenerOwnership: options.listenerOwnership }),
	});
	return {
		root,
		storage,
		checkoutRoot,
		identity,
		transport,
		session,
		lifecycle: {
			appServerReady: () => appServerReady,
			accountReady: () => accountReady,
			terminalFailure: () => terminalFailure,
		},
		events,
		close: () => rmSync(root, { recursive: true, force: true }),
	};
}

export function reverseRequest(
	fixture: SessionFixture,
	method: "currentTime/read" | "account/chatgptAuthTokens/refresh" | "attestation/generate",
	params: Record<string, unknown>,
): TransportServerRequest {
	const requestId = fixture.identity.issuer.mintJsonRpcRequestId();
	const correlation = fixture.identity.decoder.createWireRequestCorrelation({ requestId });
	return {
		child: fixture.identity.validator.childId,
		epoch: fixture.identity.validator.epoch,
		requestId,
		correlation,
		method,
		params,
		owner: "codex-session",
	} as TransportServerRequest;
}

export function makeNotification(fixture: SessionFixture, method = "warning") {
	return {
		correlation: {
			child: fixture.identity.validator.childId,
			epoch: fixture.identity.validator.epoch,
			requestId: null,
		},
		notification: { method, params: { message: "fixture" } },
	};
}
