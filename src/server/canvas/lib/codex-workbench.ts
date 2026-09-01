import {
	createCodexApprovalBroker,
	type CodexApprovalBroker,
	type CodexApprovalBrokerOptions,
} from "../../../runtime/codex-approvals/index.js";
import {
	createCodexCoordinatorCallbacks,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbacks,
} from "../../../runtime/codex-coordinator-callbacks/index.js";
import {
	COORDINATOR_DYNAMIC_DISPATCHERS,
	createCodexCoordinatorTools,
	type CodexCoordinatorToolsOptions,
	type CoordinatorToolDispatcher,
} from "../../../runtime/codex-coordinator-tools/index.js";
import {
	createCodexCoordinator,
	type CodexCoordinator,
	type CodexCoordinatorOptions,
} from "../../../runtime/codex-coordinator/index.js";
import {
	createCodexDynamicTools,
	type CodexDynamicTools,
	type CodexDynamicToolsOptions,
	type DynamicContextPort,
	type DynamicOperationIdPort,
	type DynamicThreadAuthorityPort,
	type DynamicToolApprovalPort,
	type DynamicToolLifecyclePort,
} from "../../../runtime/codex-dynamic-tools/index.js";
import {
	createCodexEpochStore,
	type CodexEpochStore,
	type CodexEpochStoreOptions,
} from "../../../runtime/codex-epoch/index.js";
import {
	createCodexProcess,
	type CodexProcess,
	type CodexProcessChild,
	type CodexProcessOptions,
} from "../../../runtime/codex-process/index.js";
import type {
	CodexSession,
	SessionAttestationRequest,
	SessionCurrentTimeRequest,
	SessionTokenRefreshRequest,
} from "../../../runtime/codex-session/index.js";
import {
	CODEX_SESSION_CONTROL,
	createCodexSession,
	type CodexSessionOptions,
	type ControlledCodexSession,
} from "../../../runtime/codex-session/index.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeAdapterOptions,
} from "../../../runtime/codex-realtime/index.js";
import {
	createSemanticContextPublisher,
	type SemanticContextPublisher,
	type SemanticContextPublisherOptions,
} from "../../../runtime/codex-semantic-context/index.js";
import {
	createCodexSpokenApprovalGate,
	type CodexSpokenApprovalGate,
	type CodexSpokenApprovalGateOptions,
} from "../../../runtime/codex-spoken-approval/index.js";
import {
	createCodexThreadContextController,
	type CodexThreadContextController,
	type CodexThreadContextControllerHooks,
	type CodexThreadContextControllerOptions,
} from "../../../runtime/codex-thread-context/index.js";
import {
	createCodexThreadLink,
	type CodexThreadLinkOptions,
	type CodexThreadLinkPort,
} from "../../../runtime/codex-thread-link/index.js";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "../../../runtime/codex-thread-tools/index.js";
import {
	createCodexTransport,
	type CodexTransport,
	type CodexTransportOptions,
} from "../../../runtime/codex-transport/index.js";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../../runtime/codex-transport/server-requests.js";
import {
	createCodexWorkhorseOperations,
	type CodexWorkhorseOperations,
	type WorkhorseOperationOptions,
} from "../../../runtime/codex-workhorse-operations/index.js";
import {
	createCodexWorkhorseQueue,
	type CodexWorkhorseQueue,
	type WorkhorseQueueOptions,
} from "../../../runtime/codex-workhorse-queue/index.js";
import {
	createCodexWorkhorseStart,
	type CodexWorkhorseStart,
	type CodexWorkhorseStartOptions,
} from "../../../runtime/codex-workhorse-start/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
	type OperationId,
} from "../../../shared/codex-workbench-identity/index.js";
import { kept } from "../../../runtime/engine/hot.js";
import {
	createCodexWorkbenchGateway,
	type CodexWorkbenchGateway,
	type CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import { CodexWorkbenchCompositionError } from "./codex-workbench-error.js";
import { assertCodexWorkbenchRetainedState } from "./codex-workbench-retained-policy.js";

export { CodexWorkbenchCompositionError, assertCodexWorkbenchRetainedState };

export const CODEX_WORKBENCH_OWNER = "archboard-canvas-codex-workbench" as const;

export interface CodexWorkbenchRequestOwners {
	readonly approvals: Pick<CodexApprovalBroker, "receive">;
	readonly dynamicTools: Pick<CodexDynamicTools, "dispatch">;
	readonly coordinatorTools: Pick<CoordinatorToolDispatcher, "onServerRequest">;
	readonly session: Pick<
		CodexSession,
		"respondCurrentTime" | "respondUnsupportedTokenRefresh" | "respondUnsupportedAttestation"
	>;
}

export interface CodexWorkbenchRequestRouter {
	readonly route: (request: TransportServerRequest) => void;
}

function routeDynamicRequest(
	request: DynamicServerRequest,
	owners: CodexWorkbenchRequestOwners,
): void {
	switch (request.owner) {
		case "codex-dynamic-tools":
			void owners.dynamicTools.dispatch(request);
			return;
		case "codex-coordinator-tools":
			owners.coordinatorTools.onServerRequest(request);
			return;
		default:
			return assertUnreachable(request.owner);
	}
}

function assertUnreachable(value: never): never {
	throw new TypeError(`Unreachable Codex server request: ${String(value)}`);
}

function isCoordinatorToolRequest(
	request: TransportServerRequest,
): request is Parameters<CoordinatorToolDispatcher["dispatch"]>[0] {
	return request.method === "item/tool/call" && request.owner === "codex-coordinator-tools";
}

/** Route every generated app-server request to its sole response owner. */
export function createCodexWorkbenchRequestRouter(
	owners: CodexWorkbenchRequestOwners,
): CodexWorkbenchRequestRouter {
	const route = (request: TransportServerRequest): void => {
		switch (request.method) {
			case "item/commandExecution/requestApproval":
			case "item/fileChange/requestApproval":
			case "item/tool/requestUserInput":
			case "mcpServer/elicitation/request":
			case "item/permissions/requestApproval":
			case "applyPatchApproval":
			case "execCommandApproval":
				owners.approvals.receive(request);
				return;
			case "item/tool/call":
				routeDynamicRequest(request, owners);
				return;
			case "currentTime/read":
				void owners.session.respondCurrentTime(request as SessionCurrentTimeRequest);
				return;
			case "account/chatgptAuthTokens/refresh":
				void owners.session.respondUnsupportedTokenRefresh(request as SessionTokenRefreshRequest);
				return;
			case "attestation/generate":
				void owners.session.respondUnsupportedAttestation(request as SessionAttestationRequest);
				return;
			default:
				return assertUnreachable(request);
		}
	};
	return Object.freeze({ route });
}

export type CodexWorkbenchState = "idle" | "starting" | "ready" | "stopping" | "failed";

export interface CodexWorkbenchSnapshot {
	readonly owner: typeof CODEX_WORKBENCH_OWNER;
	readonly state: CodexWorkbenchState;
	readonly generation: number;
	readonly childPid: number | null;
	readonly ready: boolean;
	readonly failure: string | null;
}

export interface CodexWorkbenchGeneration {
	/** Process-lifetime resources and mutable lifecycle state, never a source callable. */
	readonly state: CodexWorkbenchGenerationState;
	readonly transport: CodexTransport;
	readonly gateway: CodexWorkbenchGateway;
	readonly router: CodexWorkbenchRequestRouter;
	readonly onNotification: Parameters<CodexTransport["onServerNotification"]>[0];
	readonly onExit: Parameters<CodexTransport["onExit"]>[0];
	readonly replaceHooks: (source: CodexWorkbenchGenerationSourceInput) => Promise<void>;
	readonly stop: (reason: "shutdown" | "child_exit") => Promise<void>;
	readonly finishStop: () => void;
}

export interface CodexWorkbenchGenerationSourceInput {
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly onChildExitStart?: () => void;
	readonly onChildExitFinished?: (failure: Error | null) => Promise<void> | void;
}

export interface CodexWorkbenchGenerationSlots {
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly onChildExitStart: (() => void) | null;
	readonly onChildExitFinished: ((failure: Error | null) => Promise<void> | void) | null;
	readonly route: CodexWorkbenchRequestRouter["route"];
	readonly onNotification: Parameters<CodexTransport["onServerNotification"]>[0];
	readonly onExit: Parameters<CodexTransport["onExit"]>[0];
	readonly replaceHooks: (source: CodexWorkbenchGenerationSourceInput) => Promise<void>;
	readonly stop: (reason: "shutdown" | "child_exit") => Promise<void>;
	readonly finishStop: () => void;
}

export interface CodexWorkbenchGenerationRegistrations {
	transportRequest: (() => void) | null;
	transportNotification: (() => void) | null;
	transportExit: (() => void) | null;
	lifecycleSignals: (() => void) | null;
	browserGateway: (() => void) | null;
	approvalProjection: (() => void) | null;
}

export interface CodexWorkbenchGenerationState {
	readonly components: CodexWorkbenchComponents;
	readonly owners: CodexWorkbenchRequestOwners;
	current: CodexWorkbenchGenerationSlots | null;
	registrations: CodexWorkbenchGenerationRegistrations;
	readonly pendingChildSettlements: Set<Promise<unknown>>;
	stopped: boolean;
	stopPromise: Promise<void> | null;
	stopComplete: boolean;
	stopFinished: boolean;
}

export interface CodexWorkbenchComponents {
	readonly identity: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly transport: CodexTransport;
	readonly session: ControlledCodexSession;
	readonly threadLink: CodexThreadLinkPort;
	readonly workhorse: CodexWorkhorseStart;
	readonly semanticPublisher: SemanticContextPublisher;
	readonly realtime: CodexRealtimeAdapter;
	readonly approvals: CodexApprovalBroker;
	readonly dynamicTools: CodexDynamicTools;
	readonly coordinatorTools: CoordinatorToolDispatcher;
	readonly semanticDelivery: CodexThreadContextController;
	readonly coordinator: CodexCoordinator;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly operations: CodexWorkhorseOperations;
	readonly callbacks: CoordinatorCallbacks;
	readonly spokenApproval: CodexSpokenApprovalGate;
	readonly gateway: CodexWorkbenchGateway;
}

type ComponentName = keyof CodexWorkbenchComponents;

export type CodexWorkbenchComponentFactories = {
	readonly [Name in ComponentName]: (
		created: Readonly<Partial<CodexWorkbenchComponents>>,
	) => CodexWorkbenchComponents[Name];
};

export interface CodexWorkbenchGenerationHooks {
	readonly threadContext: CodexThreadContextControllerHooks;
	readonly installIdentityDecoders: (identity: IdentityAuthorities) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installApprovalProjection: (components: CodexWorkbenchComponents) => () => void;
	readonly installBrowserGateway: (gateway: CodexWorkbenchGateway) => () => void;
	readonly initializeSession: (
		session: CodexSession,
		components: CodexWorkbenchComponents,
	) => Promise<void>;
	readonly stopBrowser: (gateway: CodexWorkbenchGateway) => Promise<void>;
	readonly stopRealtime: (realtime: CodexRealtimeAdapter) => Promise<void>;
	readonly stopQueue: (queue: CodexWorkhorseQueue<OperationId>) => Promise<void> | void;
	readonly cancelDynamicApprovalsAndWaits: (
		components: CodexWorkbenchComponents,
		cause: "host_shutdown" | "child_disconnected",
	) => Promise<void>;
	readonly settleOrdinaryRequests: (
		approvals: CodexApprovalBroker,
		cause: "host_shutdown" | "child_disconnected",
	) => Promise<void>;
}

function installDynamicRegistrations(transport: CodexTransport): void {
	transport.registerDynamicDispatcher({
		owner: "codex-dynamic-tools",
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
	for (const registration of COORDINATOR_DYNAMIC_DISPATCHERS)
		transport.registerDynamicDispatcher(registration);
}

export interface ComposeCodexWorkbenchGenerationOptions {
	readonly factories: CodexWorkbenchComponentFactories;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly onChildExitStart?: () => void;
	readonly onChildExitFinished?: (failure: Error | null) => Promise<void> | void;
}

type ComponentBuilder<Value> = (created: Readonly<Partial<CodexWorkbenchComponents>>) => Value;

export interface CodexWorkbenchDynamicAdapterFactories {
	readonly approval: ComponentBuilder<DynamicToolApprovalPort>;
	readonly threadAuthority: ComponentBuilder<DynamicThreadAuthorityPort>;
	readonly context: ComponentBuilder<DynamicContextPort>;
	readonly operationId: ComponentBuilder<DynamicOperationIdPort>;
	readonly lifecycle: ComponentBuilder<DynamicToolLifecyclePort>;
}

export interface CodexWorkbenchCoordinatorCallOwner {
	readonly run: <Value>(
		request: DynamicServerRequest,
		operation: () => Promise<Value>,
	) => Promise<Value>;
}

export interface ProductionCodexWorkbenchBindings {
	readonly epoch: ComponentBuilder<CodexEpochStoreOptions>;
	readonly transport: ComponentBuilder<Omit<CodexTransportOptions, "identity">>;
	readonly session: ComponentBuilder<
		Omit<CodexSessionOptions, "transport" | "identity" | "listenerOwnership">
	>;
	readonly threadLink: ComponentBuilder<Omit<CodexThreadLinkOptions, "session" | "epoch">>;
	readonly workhorse: ComponentBuilder<
		Omit<CodexWorkhorseStartOptions, "session" | "threadLink" | "epoch" | "identity" | "operation">
	>;
	readonly semanticPublisher: ComponentBuilder<SemanticContextPublisherOptions>;
	readonly realtime: ComponentBuilder<Omit<CodexRealtimeAdapterOptions, "session" | "identity">>;
	readonly approvals: ComponentBuilder<
		Omit<CodexApprovalBrokerOptions, "transport" | "identity" | "listenerOwnership">
	>;
	readonly dynamicAdapters: CodexWorkbenchDynamicAdapterFactories;
	readonly dynamicTools: ComponentBuilder<
		Omit<
			CodexDynamicToolsOptions,
			| "session"
			| "transport"
			| "threadLink"
			| "epoch"
			| "approval"
			| "threadAuthority"
			| "context"
			| "operationId"
			| "lifecycle"
		>
	>;
	readonly semanticDelivery: ComponentBuilder<
		Omit<CodexThreadContextControllerOptions, "session" | "threadLink" | "identity" | "epoch">
	>;
	readonly coordinator: ComponentBuilder<
		Omit<CodexCoordinatorOptions, "session" | "threadLink" | "epoch" | "identity">
	>;
	readonly queue: ComponentBuilder<
		Omit<WorkhorseQueueOptions<OperationId>, "session" | "identity" | "operationIds">
	>;
	readonly operations: ComponentBuilder<
		Omit<
			WorkhorseOperationOptions,
			"session" | "threadLink" | "queue" | "epoch" | "identity" | "operation"
		>
	>;
	readonly spokenApproval: ComponentBuilder<
		Omit<
			CodexSpokenApprovalGateOptions,
			"approvalBroker" | "coordinator" | "realtime" | "session" | "identity"
		>
	>;
	readonly coordinatorTools: ComponentBuilder<
		Omit<
			CodexCoordinatorToolsOptions,
			"identity" | "operation" | "operations" | "spokenApproval" | "transport"
		>
	>;
	readonly coordinatorCall: CodexWorkbenchCoordinatorCallOwner;
	readonly callbacks: ComponentBuilder<
		Omit<CoordinatorCallbackOptions, "operations" | "session" | "threadLink">
	>;
	readonly gateway: (
		created: Readonly<Omit<CodexWorkbenchComponents, "gateway">>,
	) => Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink">;
}

function requireComponent<Name extends ComponentName>(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
	name: Name,
): CodexWorkbenchComponents[Name] {
	const value = created[name];
	if (value === undefined)
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			`The Codex workbench tried to create ${name} before its dependency was ready.`,
		);
	return created[name]!;
}

/** Bind the reviewed runtime constructors to one production generation. */
export function createProductionCodexWorkbenchFactories(
	bindings: ProductionCodexWorkbenchBindings,
): CodexWorkbenchComponentFactories {
	return Object.freeze({
		identity: () => createIdentityAuthorities(),
		epoch: (created) => createCodexEpochStore(bindings.epoch(created)),
		transport: (created) =>
			createCodexTransport({
				...bindings.transport(created),
				identity: requireComponent(created, "identity").identity,
			}),
		session: (created) =>
			createCodexSession({
				...bindings.session(created),
				transport: requireComponent(created, "transport"),
				identity: requireComponent(created, "identity").identity,
				listenerOwnership: "composition",
			}),
		threadLink: (created) =>
			createCodexThreadLink({
				...bindings.threadLink(created),
				session: requireComponent(created, "session"),
				epoch: requireComponent(created, "epoch"),
			}),
		workhorse: (created) =>
			createCodexWorkhorseStart({
				...bindings.workhorse(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
			}),
		semanticPublisher: (created) =>
			createSemanticContextPublisher(bindings.semanticPublisher(created)),
		realtime: (created) =>
			createCodexRealtimeAdapter({
				...bindings.realtime(created),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
			}),
		approvals: (created) =>
			createCodexApprovalBroker({
				...bindings.approvals(created),
				transport: requireComponent(created, "transport"),
				identity: requireComponent(created, "identity").identity,
				listenerOwnership: "composition",
			}),
		dynamicTools: (created) =>
			createCodexDynamicTools({
				...bindings.dynamicTools(created),
				session: requireComponent(created, "session"),
				transport: requireComponent(created, "transport"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				approval: bindings.dynamicAdapters.approval(created),
				threadAuthority: bindings.dynamicAdapters.threadAuthority(created),
				context: bindings.dynamicAdapters.context(created),
				operationId: bindings.dynamicAdapters.operationId(created),
				lifecycle: bindings.dynamicAdapters.lifecycle(created),
			}),
		semanticDelivery: (created) =>
			createCodexThreadContextController({
				...bindings.semanticDelivery(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				identity: requireComponent(created, "identity").identity,
				epoch: requireComponent(created, "epoch"),
			}),
		coordinator: (created) =>
			createCodexCoordinator({
				...bindings.coordinator(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
			}),
		queue: (created) => {
			const operation = requireComponent(created, "identity").operation;
			return createCodexWorkhorseQueue({
				...bindings.queue(created),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
				operationIds: {
					assertCurrent: operation.validator.assertCurrentOperationId,
					serialize: operation.decoder.serializeOperationId,
				},
			});
		},
		operations: (created) =>
			createCodexWorkhorseOperations({
				...bindings.operations(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				queue: requireComponent(created, "queue"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
			}),
		spokenApproval: (created) =>
			createCodexSpokenApprovalGate({
				...bindings.spokenApproval(created),
				approvalBroker: requireComponent(created, "approvals"),
				coordinator: requireComponent(created, "coordinator"),
				realtime: requireComponent(created, "realtime"),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
			}),
		coordinatorTools: (created) => {
			const dispatcher = createCodexCoordinatorTools({
				...bindings.coordinatorTools(created),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
				operations: requireComponent(created, "operations"),
				spokenApproval: requireComponent(created, "spokenApproval"),
				transport: requireComponent(created, "transport"),
			});
			const dispatch: CoordinatorToolDispatcher["dispatch"] = (request) =>
				bindings.coordinatorCall.run(request, () => dispatcher.dispatch(request));
			return Object.freeze({
				...dispatcher,
				dispatch,
				onServerRequest: (request: TransportServerRequest) => {
					if (!isCoordinatorToolRequest(request)) return;
					void dispatch(request).catch(() => undefined);
				},
			});
		},
		callbacks: (created) =>
			createCodexCoordinatorCallbacks({
				...bindings.callbacks(created),
				operations: requireComponent(created, "operations"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
			}),
		gateway: (created) => {
			const dependencies = {
				identity: requireComponent(created, "identity"),
				epoch: requireComponent(created, "epoch"),
				transport: requireComponent(created, "transport"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				workhorse: requireComponent(created, "workhorse"),
				semanticPublisher: requireComponent(created, "semanticPublisher"),
				realtime: requireComponent(created, "realtime"),
				approvals: requireComponent(created, "approvals"),
				dynamicTools: requireComponent(created, "dynamicTools"),
				semanticDelivery: requireComponent(created, "semanticDelivery"),
				coordinator: requireComponent(created, "coordinator"),
				queue: requireComponent(created, "queue"),
				operations: requireComponent(created, "operations"),
				spokenApproval: requireComponent(created, "spokenApproval"),
				coordinatorTools: requireComponent(created, "coordinatorTools"),
				callbacks: requireComponent(created, "callbacks"),
			};
			return createCodexWorkbenchGateway({
				...bindings.gateway(dependencies),
				identity: requireComponent(created, "identity"),
				threadLink: requireComponent(created, "threadLink"),
			});
		},
	});
}

const GENERATION_REGISTRATION_RELEASE_ORDER = Object.freeze([
	"approvalProjection",
	"browserGateway",
	"lifecycleSignals",
	"transportExit",
	"transportNotification",
	"transportRequest",
] satisfies readonly (keyof CodexWorkbenchGenerationRegistrations)[]);

class CodexWorkbenchGenerationInstallError extends Error {
	override readonly name = "CodexWorkbenchGenerationInstallError";
	override readonly cause: unknown;

	constructor(
		readonly stage: string,
		readonly cleanupFailure: Error | null,
		installCause: unknown,
	) {
		super(`Codex generation installation failed at ${stage}.`);
		const causeError =
			installCause instanceof Error ? installCause : new Error(String(installCause));
		this.cause =
			cleanupFailure === null
				? causeError
				: new AggregateError(
						[causeError, cleanupFailure],
						"Codex generation installation and partial cleanup both failed.",
					);
	}
}

class CodexWorkbenchGenerationReplacementError extends Error {
	override readonly name = "CodexWorkbenchGenerationReplacementError";

	constructor(
		readonly recovered: boolean,
		readonly terminalSlots: CodexWorkbenchGenerationSlots,
		override readonly cause: unknown,
	) {
		super(
			recovered
				? "Codex generation replacement failed; the previous generation was restored."
				: "Codex generation replacement failed and retired the active generation.",
		);
	}
}

function emptyGenerationRegistrations(): CodexWorkbenchGenerationRegistrations {
	return {
		transportRequest: null,
		transportNotification: null,
		transportExit: null,
		lifecycleSignals: null,
		browserGateway: null,
		approvalProjection: null,
	};
}

/** Clear ownership before invoking each cleanup so a throwing disposer cannot remain reachable. */
function releaseGenerationRegistrations(
	registrations: CodexWorkbenchGenerationRegistrations,
	label: string,
): Error | null {
	let failure: Error | null = null;
	for (const key of GENERATION_REGISTRATION_RELEASE_ORDER) {
		const cleanup = registrations[key];
		registrations[key] = null;
		if (cleanup === null) continue;
		try {
			cleanup();
		} catch (error) {
			failure = appendFailure(failure, error, `${label} ${key} cleanup failed.`);
		}
	}
	return failure;
}

function installGenerationRegistrations(
	state: CodexWorkbenchGenerationState,
	slots: CodexWorkbenchGenerationSlots,
): CodexWorkbenchGenerationRegistrations {
	const registrations = emptyGenerationRegistrations();
	let stage = "transportRequest";
	try {
		registrations.transportRequest = state.components.transport.onServerRequest(slots.route);
		stage = "transportNotification";
		registrations.transportNotification = state.components.transport.onServerNotification(
			slots.onNotification,
		);
		stage = "transportExit";
		registrations.transportExit = state.components.transport.onExit(slots.onExit);
		stage = "threadContext";
		state.components.semanticDelivery.replaceHooks(slots.hooks.threadContext);
		stage = "identityDecoders";
		slots.hooks.installIdentityDecoders(state.components.identity);
		stage = "lifecycleSignals";
		registrations.lifecycleSignals = slots.hooks.installLifecycleSignals(state.components);
		stage = "browserGateway";
		registrations.browserGateway = slots.hooks.installBrowserGateway(state.components.gateway);
		stage = "approvalProjection";
		registrations.approvalProjection = slots.hooks.installApprovalProjection(state.components);
		return registrations;
	} catch (error) {
		throw new CodexWorkbenchGenerationInstallError(
			stage,
			releaseGenerationRegistrations(registrations, "Partial Codex generation"),
			error,
		);
	}
}

function trackGenerationChildSettlement(
	state: CodexWorkbenchGenerationState,
	promise: Promise<unknown>,
): void {
	state.pendingChildSettlements.add(promise);
	void promise.then(
		() => state.pendingChildSettlements.delete(promise),
		() => state.pendingChildSettlements.delete(promise),
	);
}

async function settleGenerationChildExit(
	state: CodexWorkbenchGenerationState,
	child: Parameters<CodexWorkbenchGateway["childExit"]>[0],
	childEpoch: Parameters<CodexWorkbenchGateway["childExit"]>[1],
): Promise<void> {
	const { approvals, coordinatorTools, gateway, semanticDelivery, spokenApproval } =
		state.components;
	let failure: Error | null = null;
	const attempt = async (operation: () => Promise<unknown> | void): Promise<void> => {
		try {
			await operation();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child-exit cleanup failed.");
		}
	};
	await attempt(() => semanticDelivery.childExit(child, childEpoch));
	await attempt(() => gateway.childExit(child, childEpoch));
	await attempt(() => spokenApproval.onChildExit({ child, epoch: childEpoch }));
	await attempt(() => coordinatorTools.onChildExit({ child, epoch: childEpoch }));
	await attempt(() => approvals.childExit({ child, epoch: childEpoch }));
	if (failure !== null) throw failure;
}

async function replaceGenerationSource(
	state: CodexWorkbenchGenerationState,
	previous: CodexWorkbenchGenerationSlots,
	input: CodexWorkbenchGenerationSourceInput,
): Promise<CodexWorkbenchGenerationSlots> {
	if (state.stopped || state.current !== previous)
		throw new CodexWorkbenchCompositionError(
			"not_started",
			"The production Codex workbench cannot reload a retired source generation.",
		);
	const next = createCodexWorkbenchGenerationSlots(state, input);
	const previousRegistrations = state.registrations;
	state.current = null;
	state.registrations = emptyGenerationRegistrations();
	const removalFailure = releaseGenerationRegistrations(
		previousRegistrations,
		"Retired Codex generation",
	);
	if (removalFailure !== null)
		throw new CodexWorkbenchGenerationReplacementError(false, next, removalFailure);

	let nextRegistrations: CodexWorkbenchGenerationRegistrations;
	try {
		nextRegistrations = installGenerationRegistrations(state, next);
	} catch (error) {
		const installError = error as CodexWorkbenchGenerationInstallError;
		if (installError.cleanupFailure !== null)
			throw new CodexWorkbenchGenerationReplacementError(false, next, installError);
		try {
			state.registrations = installGenerationRegistrations(state, previous);
			state.current = previous;
		} catch (rollbackError) {
			throw new CodexWorkbenchGenerationReplacementError(
				false,
				next,
				new AggregateError(
					[error, rollbackError],
					"Codex generation installation and rollback both failed.",
				),
			);
		}
		throw new CodexWorkbenchGenerationReplacementError(true, previous, error);
	}
	state.registrations = nextRegistrations;
	state.current = next;
	return next;
}

function stopGeneration(
	state: CodexWorkbenchGenerationState,
	slots: CodexWorkbenchGenerationSlots,
	reason: "shutdown" | "child_exit",
): Promise<void> {
	if (state.current !== null && state.current !== slots)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"A retired Codex generation cannot stop the active workbench.",
			),
		);
	if (state.stopComplete) return Promise.resolve();
	if (state.stopPromise !== null) return state.stopPromise;
	state.stopped = true;
	const operation = (async (): Promise<void> => {
		const {
			approvals,
			callbacks,
			coordinatorTools,
			dynamicTools,
			gateway,
			queue,
			realtime,
			semanticDelivery,
			semanticPublisher,
			session,
			spokenApproval,
			transport,
		} = state.components;
		const cause = reason === "shutdown" ? "host_shutdown" : "child_disconnected";
		let failure: Error | null = null;
		const attempt = async (cleanup: () => Promise<unknown> | void): Promise<void> => {
			try {
				await cleanup();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
			}
		};
		await attempt(() => slots.hooks.stopBrowser(gateway));
		await attempt(() => slots.hooks.stopRealtime(realtime));
		await attempt(() => realtime.dispose());
		await attempt(() => semanticPublisher.dispose());
		await attempt(() => slots.hooks.stopQueue(queue));
		await attempt(() => slots.hooks.cancelDynamicApprovalsAndWaits(state.components, cause));
		await attempt(() => slots.hooks.settleOrdinaryRequests(approvals, cause));
		await attempt(() => session[CODEX_SESSION_CONTROL].dispose());
		await attempt(() => callbacks.dispose());
		await attempt(() => spokenApproval.dispose());
		await attempt(() => semanticDelivery.dispose());
		await attempt(() => coordinatorTools.dispose());
		await attempt(() => dynamicTools.dispose());
		if (reason === "shutdown") await attempt(() => transport.shutdown());
		if (reason === "shutdown")
			await attempt(() => Promise.allSettled(Array.from(state.pendingChildSettlements)));
		if (failure !== null) throw failure;
	})().finally(() => {
		state.stopPromise = null;
		state.stopComplete = true;
	});
	state.stopPromise = operation;
	return operation;
}

function finishGenerationStop(
	state: CodexWorkbenchGenerationState,
	slots: CodexWorkbenchGenerationSlots,
): void {
	if (state.current !== null && state.current !== slots)
		throw new CodexWorkbenchCompositionError(
			"not_started",
			"A retired Codex generation cannot finish the active workbench stop.",
		);
	if (state.stopFinished) return;
	state.stopFinished = true;
	if (state.current === slots) state.current = null;
	const registrations = state.registrations;
	state.registrations = emptyGenerationRegistrations();
	let failure = releaseGenerationRegistrations(registrations, "Terminal Codex generation");
	for (const dispose of [
		() => state.components.approvals.dispose(),
		() => state.components.epoch.close(),
	]) {
		try {
			dispose();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex final cleanup failed.");
		}
	}
	if (failure !== null) throw failure;
}

/** Construct every callable owned by the currently executing source generation. */
function createCodexWorkbenchGenerationSlots(
	state: CodexWorkbenchGenerationState,
	input: CodexWorkbenchGenerationSourceInput,
): CodexWorkbenchGenerationSlots {
	const router = createCodexWorkbenchRequestRouter(state.owners);
	let slots!: CodexWorkbenchGenerationSlots;
	slots = {
		hooks: input.hooks,
		onChildExitStart: input.onChildExitStart ?? null,
		onChildExitFinished: input.onChildExitFinished ?? null,
		route: (request) => {
			if (state.current === slots) router.route(request);
		},
		onNotification: (
			event: Parameters<CodexTransport["onServerNotification"]>[0] extends (
				value: infer Value,
			) => void
				? Value
				: never,
		) => {
			if (state.current !== slots) return;
			state.components.session[CODEX_SESSION_CONTROL].onNotification(event);
			state.components.coordinator.onNotification(event);
			state.components.operations.onNotification(event);
			state.components.realtime.onNotification(event);
			state.components.spokenApproval.onNotification(event);
		},
		onExit: ({
			child,
			epoch: childEpoch,
		}: Parameters<Parameters<CodexTransport["onExit"]>[0]>[0]) => {
			if (state.current !== slots) return;
			slots.onChildExitStart?.();
			const settlement = settleGenerationChildExit(state, child, childEpoch);
			trackGenerationChildSettlement(state, settlement);
			const retirement = (async (): Promise<void> => {
				let failure: Error | null = null;
				for (const operation of [
					() => settlement,
					() => slots.stop("child_exit"),
					() => slots.finishStop(),
				]) {
					try {
						await Promise.resolve(operation());
					} catch (error) {
						failure = appendFailure(failure, error, "Codex child retirement failed.");
					}
				}
				try {
					await slots.onChildExitFinished?.(failure);
				} catch (error) {
					failure = appendFailure(failure, error, "Codex child retirement failed.");
				}
				if (failure !== null) throw failure;
			})();
			void retirement.catch(() => undefined);
		},
		replaceHooks: async (source: CodexWorkbenchGenerationSourceInput) => {
			await replaceGenerationSource(state, slots, source);
		},
		stop: (reason: "shutdown" | "child_exit") => stopGeneration(state, slots, reason),
		finishStop: () => finishGenerationStop(state, slots),
	};
	return slots;
}

function createCodexWorkbenchGenerationFacade(
	state: CodexWorkbenchGenerationState,
	slots: CodexWorkbenchGenerationSlots,
): CodexWorkbenchGeneration {
	return {
		state,
		transport: state.components.transport,
		gateway: state.components.gateway,
		router: { route: slots.route },
		onNotification: slots.onNotification,
		onExit: slots.onExit,
		replaceHooks: slots.replaceHooks,
		stop: slots.stop,
		finishStop: slots.finishStop,
	};
}

/** Replace listeners and hooks with callables constructed by this source generation. */
export async function reloadCodexWorkbenchGeneration(
	state: CodexWorkbenchGenerationState,
	source: CodexWorkbenchGenerationSourceInput,
): Promise<CodexWorkbenchGeneration> {
	const previous = state.current;
	if (previous === null)
		throw new CodexWorkbenchCompositionError(
			"not_started",
			"The production Codex workbench has no source generation to reload.",
		);
	const next = await replaceGenerationSource(state, previous, source);
	return createCodexWorkbenchGenerationFacade(state, next);
}

/** Build and activate the one complete child-generation graph. */
export async function composeCodexWorkbenchGeneration(
	options: ComposeCodexWorkbenchGenerationOptions,
): Promise<CodexWorkbenchGeneration> {
	type MutableComponents = {
		-readonly [Name in keyof CodexWorkbenchComponents]?: CodexWorkbenchComponents[Name];
	};
	const created: MutableComponents = {};
	const constructionCleanups: Array<() => Promise<unknown> | void> = [];
	let identity!: IdentityAuthorities;
	let epoch!: CodexEpochStore;
	let transport!: CodexTransport;
	let session!: ControlledCodexSession;
	let threadLink!: CodexThreadLinkPort;
	let workhorse!: CodexWorkhorseStart;
	let semanticPublisher!: SemanticContextPublisher;
	let realtime!: CodexRealtimeAdapter;
	let approvals!: CodexApprovalBroker;
	let dynamicTools!: CodexDynamicTools;
	let semanticDelivery!: CodexThreadContextController;
	let coordinator!: CodexCoordinator;
	let queue!: CodexWorkhorseQueue<OperationId>;
	let operations!: CodexWorkhorseOperations;
	let spokenApproval!: CodexSpokenApprovalGate;
	let coordinatorTools!: CoordinatorToolDispatcher;
	let callbacks!: CoordinatorCallbacks;
	let gateway!: CodexWorkbenchGateway;
	try {
		identity = options.factories.identity(created);
		created.identity = identity;
		epoch = options.factories.epoch(created);
		created.epoch = epoch;
		constructionCleanups.push(() => epoch.close());
		transport = options.factories.transport(created);
		created.transport = transport;
		constructionCleanups.push(() => transport.shutdown());
		installDynamicRegistrations(transport);
		session = options.factories.session(created);
		created.session = session;
		constructionCleanups.push(() => session[CODEX_SESSION_CONTROL].dispose());
		threadLink = options.factories.threadLink(created);
		created.threadLink = threadLink;
		workhorse = options.factories.workhorse(created);
		created.workhorse = workhorse;
		semanticPublisher = options.factories.semanticPublisher(created);
		created.semanticPublisher = semanticPublisher;
		constructionCleanups.push(() => semanticPublisher.dispose());
		realtime = options.factories.realtime(created);
		created.realtime = realtime;
		constructionCleanups.push(() => realtime.dispose());
		approvals = options.factories.approvals(created);
		created.approvals = approvals;
		constructionCleanups.push(() => approvals.dispose());
		dynamicTools = options.factories.dynamicTools(created);
		created.dynamicTools = dynamicTools;
		constructionCleanups.push(() => dynamicTools.dispose());
		semanticDelivery = options.factories.semanticDelivery(created);
		created.semanticDelivery = semanticDelivery;
		constructionCleanups.push(() => semanticDelivery.dispose());
		coordinator = options.factories.coordinator(created);
		created.coordinator = coordinator;
		queue = options.factories.queue(created);
		created.queue = queue;
		operations = options.factories.operations(created);
		created.operations = operations;
		spokenApproval = options.factories.spokenApproval(created);
		created.spokenApproval = spokenApproval;
		constructionCleanups.push(() => spokenApproval.dispose());
		coordinatorTools = options.factories.coordinatorTools(created);
		created.coordinatorTools = coordinatorTools;
		constructionCleanups.push(() => coordinatorTools.dispose());
		callbacks = options.factories.callbacks(created);
		created.callbacks = callbacks;
		constructionCleanups.push(() => callbacks.dispose());
		gateway = options.factories.gateway(created);
		created.gateway = gateway;
		constructionCleanups.push(() => gateway.dispose());
	} catch (error) {
		let failure = error instanceof Error ? error : new Error(String(error));
		for (const cleanup of constructionCleanups.toReversed()) {
			try {
				await cleanup();
			} catch (cleanupError) {
				failure = appendFailure(failure, cleanupError, "Codex construction cleanup failed.");
			}
		}
		throw failure;
	}
	const components = Object.freeze({
		identity,
		epoch,
		transport,
		session,
		threadLink,
		workhorse,
		semanticPublisher,
		realtime,
		approvals,
		dynamicTools,
		semanticDelivery,
		coordinator,
		queue,
		operations,
		spokenApproval,
		coordinatorTools,
		callbacks,
		gateway,
	} satisfies CodexWorkbenchComponents);
	const owners = Object.freeze({
		approvals,
		dynamicTools,
		coordinatorTools,
		session,
	});
	const state: CodexWorkbenchGenerationState = {
		components,
		owners,
		current: null,
		registrations: emptyGenerationRegistrations(),
		pendingChildSettlements: new Set(),
		stopped: false,
		stopPromise: null,
		stopComplete: false,
		stopFinished: false,
	};
	const slots = createCodexWorkbenchGenerationSlots(state, options);
	const source = createCodexWorkbenchGenerationFacade(state, slots);

	try {
		state.registrations = installGenerationRegistrations(state, slots);
		state.current = slots;
		await slots.hooks.initializeSession(session, components);
	} catch (error) {
		let failure = error instanceof Error ? error : new Error(String(error));
		try {
			await source.stop("shutdown");
		} catch (cleanupError) {
			failure = appendFailure(failure, cleanupError, "Codex startup cleanup failed.");
		}
		try {
			source.finishStop();
		} catch (cleanupError) {
			failure = appendFailure(failure, cleanupError, "Codex startup final cleanup failed.");
		}
		throw failure;
	}
	return source;
}

export interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly onChildExitStart: () => void;
	readonly onChildExitFinished: (failure: Error | null) => Promise<void>;
}

export interface CodexWorkbenchOwnerOptions {
	readonly createProcess: () => CodexProcess;
	/** Builds the sole production graph and completes app-server initialization. */
	readonly createGeneration: (
		input: CodexWorkbenchGenerationInput,
	) => Promise<CodexWorkbenchGeneration>;
}

export interface InstallProductionCodexWorkbenchOptions {
	readonly process: CodexProcessOptions;
	readonly bindings: (input: CodexWorkbenchGenerationInput) => ProductionCodexWorkbenchBindings;
	readonly hooks: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchGenerationHooks;
}

export type CodexWorkbenchHooksFactory = (
	input: CodexWorkbenchGenerationInput,
) => CodexWorkbenchGenerationHooks;

export interface CodexWorkbenchOwner {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
	readonly reload: (hooks: CodexWorkbenchGenerationHooks) => Promise<CodexWorkbenchSnapshot>;
	readonly snapshot: () => CodexWorkbenchSnapshot;
	readonly gateway: () => CodexWorkbenchGateway;
	readonly shutdown: () => Promise<CodexWorkbenchSnapshot>;
}

export interface CodexWorkbenchRetainedState {
	owner: typeof CODEX_WORKBENCH_OWNER | null;
	generation: number;
	state: CodexWorkbenchState;
	failure: string | null;
	process: CodexProcess | null;
	control: CodexWorkbenchRetainedControl;
}

export interface CodexWorkbenchOwnerSlots {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
	readonly reload: (
		hooks: CodexWorkbenchGenerationHooks | CodexWorkbenchHooksFactory,
	) => Promise<CodexWorkbenchSnapshot>;
	readonly shutdown: () => Promise<CodexWorkbenchSnapshot>;
	readonly snapshot: () => CodexWorkbenchSnapshot;
	readonly gateway: () => CodexWorkbenchGateway;
}

export interface CodexWorkbenchRetainedControl {
	current: CodexWorkbenchOwnerSlots | null;
	/** Reviewed process-lifetime state port. It contains no source lifecycle callable. */
	runtime: CodexWorkbenchOwnerRuntime | null;
	readonly wrappers: CodexWorkbenchOwnerSlots;
}

export interface CodexWorkbenchOwnerRuntime {
	readonly process: CodexProcess;
	generation: CodexWorkbenchGenerationState | null;
	child: CodexProcessChild | null;
	startPromise: Promise<CodexWorkbenchSnapshot> | null;
	shutdownPromise: Promise<CodexWorkbenchSnapshot> | null;
	childRetiring: boolean;
	released: boolean;
}

function emptyCodexWorkbenchRetainedControl(): CodexWorkbenchRetainedControl {
	const control = { current: null, runtime: null } as CodexWorkbenchRetainedControl;
	const current = (): CodexWorkbenchOwnerSlots => {
		if (control.current === null)
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active retained owner.",
			);
		return control.current;
	};
	Object.defineProperty(control, "wrappers", {
		enumerable: true,
		value: Object.freeze({
			start: () => current().start(),
			reload: (hooks) => current().reload(hooks),
			shutdown: () => current().shutdown(),
			snapshot: () => current().snapshot(),
			gateway: () => current().gateway(),
		} satisfies CodexWorkbenchOwnerSlots),
	});
	return control;
}

export function emptyCodexWorkbenchRetainedState(): CodexWorkbenchRetainedState {
	return {
		owner: null,
		generation: 0,
		state: "idle",
		failure: null,
		process: null,
		control: emptyCodexWorkbenchRetainedControl(),
	};
}

const retainedWorkbench = kept<CodexWorkbenchRetainedState>(
	"codex-workbench-owner",
	emptyCodexWorkbenchRetainedState,
);

/** Install the current source generation over the one retained process owner. */
export function installProductionCodexWorkbench(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchOwner {
	return installCodexWorkbenchOwner(retainedWorkbench, {
		createProcess: () => createCodexProcess(options.process),
		createGeneration: (input) =>
			composeCodexWorkbenchGeneration({
				factories: createProductionCodexWorkbenchFactories(options.bindings(input)),
				hooks: options.hooks(input),
				onChildExitStart: input.onChildExitStart,
				onChildExitFinished: input.onChildExitFinished,
			}),
	});
}

/** Replace only source-generation hooks on the one active production graph. */
export function reloadProductionCodexWorkbench(
	hooks: CodexWorkbenchHooksFactory,
): Promise<CodexWorkbenchSnapshot> {
	const runtime = retainedWorkbench.control.runtime;
	if (runtime === null)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active owner to reload.",
			),
		);
	return reloadCodexWorkbenchRuntime(retainedWorkbench, runtime, hooks);
}

/** Stop the active production owner without importing its generation graph elsewhere. */
export function shutdownProductionCodexWorkbench(): Promise<CodexWorkbenchSnapshot> {
	if (retainedWorkbench.control.runtime === null)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active owner to shut down.",
			),
		);
	return retainedWorkbench.control.wrappers.shutdown();
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function appendFailure(current: Error | null, next: unknown, message: string): Error {
	const nextError = next instanceof Error ? next : new Error(String(next));
	return current === null ? nextError : new AggregateError([current, nextError], message);
}

function codexWorkbenchSnapshot(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): CodexWorkbenchSnapshot {
	if (retained.control.runtime === runtime) assertCodexWorkbenchRetainedState(retained);
	return Object.freeze({
		owner: CODEX_WORKBENCH_OWNER,
		state: retained.state,
		generation: retained.generation,
		childPid: runtime.process.currentChild()?.pid ?? null,
		ready:
			retained.state === "ready" &&
			runtime.generation !== null &&
			!runtime.childRetiring &&
			!runtime.released,
		failure: retained.failure,
	});
}

function releaseCodexWorkbenchRegistration(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	state: CodexWorkbenchState,
	failure: string | null,
): void {
	if (runtime.released) return;
	runtime.released = true;
	runtime.child = null;
	runtime.generation = null;
	retained.state = state;
	retained.failure = failure;
	retained.owner = null;
	retained.process = null;
	if (retained.control.runtime === runtime) {
		retained.control.current = null;
		retained.control.runtime = null;
	}
}

function beginCodexWorkbenchChildRetirement(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): void {
	if (runtime.childRetiring || runtime.released) return;
	runtime.childRetiring = true;
	retained.state = "stopping";
}

async function finishCodexWorkbenchChildRetirement(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	priorFailure: Error | null,
): Promise<void> {
	let failure = priorFailure;
	try {
		await runtime.process.stop();
	} catch (error) {
		failure = appendFailure(failure, error, "Codex child-exit process cleanup failed.");
	} finally {
		releaseCodexWorkbenchRegistration(
			retained,
			runtime,
			failure === null ? "idle" : "failed",
			failure === null ? null : failureMessage(failure),
		);
	}
	if (failure !== null) throw failure;
}

function codexWorkbenchGenerationInput(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	generation: number,
	child: CodexProcessChild,
): CodexWorkbenchGenerationInput {
	return Object.freeze({
		generation,
		child,
		process: runtime.process,
		onChildExitStart: () => beginCodexWorkbenchChildRetirement(retained, runtime),
		onChildExitFinished: (failure: Error | null) =>
			finishCodexWorkbenchChildRetirement(retained, runtime, failure),
	});
}

async function terminalStopCodexWorkbench(
	runtime: CodexWorkbenchOwnerRuntime,
	terminalSlots?: CodexWorkbenchGenerationSlots,
): Promise<void> {
	const state = runtime.generation;
	runtime.generation = null;
	runtime.child = null;
	const slots = terminalSlots ?? state?.current ?? null;
	let failure: Error | null = null;
	if (state !== null && slots !== null) {
		try {
			await stopGeneration(state, slots, "shutdown");
		} catch (error) {
			failure = appendFailure(failure, error, "Codex graph shutdown failed.");
		}
	}
	try {
		await runtime.process.stop();
	} catch (error) {
		failure = appendFailure(failure, error, "Codex process shutdown failed.");
	}
	if (state !== null && slots !== null) {
		try {
			finishGenerationStop(state, slots);
		} catch (error) {
			failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
		}
	}
	if (failure !== null) throw failure;
}

function startCodexWorkbenchRuntime(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	createGeneration?: CodexWorkbenchOwnerOptions["createGeneration"],
): Promise<CodexWorkbenchSnapshot> {
	if (retained.state === "ready" && runtime.generation !== null)
		return Promise.resolve(codexWorkbenchSnapshot(retained, runtime));
	if (runtime.released || createGeneration === undefined)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The Codex workbench source generation cannot start this retired runtime.",
			),
		);
	if (runtime.startPromise !== null) return runtime.startPromise;
	if (runtime.shutdownPromise !== null)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The Codex workbench is already shutting down.",
			),
		);
	const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
		retained.state = "starting";
		retained.failure = null;
		retained.generation += 1;
		const generationNumber = retained.generation;
		let resolveChild!: (child: CodexProcessChild) => void;
		let rejectChild!: (error: unknown) => void;
		const childReady = new Promise<CodexProcessChild>((resolve, reject) => {
			resolveChild = resolve;
			rejectChild = reject;
		});
		const unsubscribe = runtime.process.onChild(resolveChild);
		try {
			const processStart = runtime.process.start().catch((error) => {
				rejectChild(error);
				throw error;
			});
			void processStart.catch(() => undefined);
			const child = await childReady;
			runtime.child = child;
			const input = codexWorkbenchGenerationInput(retained, runtime, generationNumber, child);
			const source = await createGeneration(input);
			runtime.generation = source.state;
			await processStart;
			if (runtime.childRetiring)
				throw new CodexWorkbenchCompositionError(
					"startup_failed",
					"The Codex child exited before workbench readiness.",
				);
			retained.state = "ready";
			publishCodexWorkbenchSource(retained, runtime);
			return codexWorkbenchSnapshot(retained, runtime);
		} catch (error) {
			let cause = error;
			try {
				await terminalStopCodexWorkbench(runtime);
			} catch (cleanupError) {
				cause = new AggregateError(
					[error, cleanupError],
					"Codex workbench startup and cleanup both failed.",
				);
			} finally {
				releaseCodexWorkbenchRegistration(retained, runtime, "failed", failureMessage(cause));
			}
			throw new CodexWorkbenchCompositionError(
				"startup_failed",
				"The production Codex workbench did not become ready.",
				cause,
			);
		} finally {
			unsubscribe();
			runtime.startPromise = null;
		}
	})();
	runtime.startPromise = operation;
	return operation;
}

async function reloadCodexWorkbenchRuntime(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	hooks: CodexWorkbenchGenerationHooks | CodexWorkbenchHooksFactory,
): Promise<CodexWorkbenchSnapshot> {
	const state = runtime.generation;
	const child = runtime.child;
	if (state === null || child === null || retained.state !== "ready" || runtime.released)
		throw new CodexWorkbenchCompositionError(
			"not_started",
			"The production Codex workbench is not ready for source-hook replacement.",
		);
	const generationNumber = retained.generation + 1;
	const input = codexWorkbenchGenerationInput(retained, runtime, generationNumber, child);
	const source = {
		hooks: typeof hooks === "function" ? hooks(input) : hooks,
		onChildExitStart: input.onChildExitStart,
		onChildExitFinished: input.onChildExitFinished,
	};
	try {
		await reloadCodexWorkbenchGeneration(state, source);
	} catch (error) {
		if (!(error instanceof CodexWorkbenchGenerationReplacementError) || error.recovered)
			throw error;
		retained.state = "stopping";
		let failure: Error = error;
		try {
			await terminalStopCodexWorkbench(runtime, error.terminalSlots);
		} catch (cleanupError) {
			failure = new AggregateError(
				[error, cleanupError],
				"Codex generation replacement and terminal cleanup both failed.",
			);
		} finally {
			releaseCodexWorkbenchRegistration(retained, runtime, "failed", failureMessage(failure));
		}
		throw new CodexWorkbenchCompositionError(
			"reload_failed",
			"The production Codex workbench could not replace or restore its source generation.",
			failure,
		);
	}
	retained.generation = generationNumber;
	publishCodexWorkbenchSource(retained, runtime);
	assertCodexWorkbenchRetainedState(retained);
	return codexWorkbenchSnapshot(retained, runtime);
}

function shutdownCodexWorkbenchRuntime(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): Promise<CodexWorkbenchSnapshot> {
	if (runtime.released) return Promise.resolve(codexWorkbenchSnapshot(retained, runtime));
	if (runtime.shutdownPromise !== null) return runtime.shutdownPromise;
	const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
		retained.state = "stopping";
		let failure: Error | null = null;
		try {
			await terminalStopCodexWorkbench(runtime);
		} catch (error) {
			failure = appendFailure(failure, error, "Codex terminal shutdown failed.");
		} finally {
			releaseCodexWorkbenchRegistration(
				retained,
				runtime,
				failure === null ? "idle" : "failed",
				failure === null ? null : failureMessage(failure),
			);
		}
		if (failure !== null)
			throw new CodexWorkbenchCompositionError(
				"shutdown_failed",
				"The production Codex workbench did not shut down cleanly.",
				failure,
			);
		return codexWorkbenchSnapshot(retained, runtime);
	})().finally(() => {
		runtime.shutdownPromise = null;
	});
	runtime.shutdownPromise = operation;
	return operation;
}

function publishCodexWorkbenchSource(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	createGeneration?: CodexWorkbenchOwnerOptions["createGeneration"],
): CodexWorkbenchOwnerSlots {
	const slots: CodexWorkbenchOwnerSlots = {
		start: () => startCodexWorkbenchRuntime(retained, runtime, createGeneration),
		reload: (hooks) => reloadCodexWorkbenchRuntime(retained, runtime, hooks),
		shutdown: () => shutdownCodexWorkbenchRuntime(retained, runtime),
		snapshot: () => codexWorkbenchSnapshot(retained, runtime),
		gateway: () => {
			if (runtime.generation === null || retained.state !== "ready" || runtime.released)
				throw new CodexWorkbenchCompositionError(
					"not_started",
					"The production Codex workbench browser gateway is not ready.",
				);
			return runtime.generation.components.gateway;
		},
	};
	retained.control.current = slots;
	return slots;
}

/** Install one process-lifetime state port and publish the current source callables. */
export function installCodexWorkbenchOwner(
	retained: CodexWorkbenchRetainedState,
	options: CodexWorkbenchOwnerOptions,
): CodexWorkbenchOwner {
	assertCodexWorkbenchRetainedState(retained);
	if (retained.owner !== null)
		throw new CodexWorkbenchCompositionError(
			"duplicate_owner",
			`The retained Codex workbench already has active owner ${String(retained.owner)}.`,
		);
	retained.owner = CODEX_WORKBENCH_OWNER;
	let processOwner: CodexProcess;
	try {
		processOwner = options.createProcess();
		retained.process = processOwner;
	} catch (error) {
		retained.owner = null;
		retained.process = null;
		retained.state = "failed";
		retained.failure = failureMessage(error);
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			"The production Codex process owner could not be created.",
			error,
		);
	}
	const runtime: CodexWorkbenchOwnerRuntime = {
		process: processOwner,
		generation: null,
		child: null,
		startPromise: null,
		shutdownPromise: null,
		childRetiring: false,
		released: false,
	};
	retained.control.runtime = runtime;
	const initialSlots = publishCodexWorkbenchSource(retained, runtime, options.createGeneration);
	assertCodexWorkbenchRetainedState(retained);
	return initialSlots;
}
