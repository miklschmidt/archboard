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

export const CODEX_WORKBENCH_OWNER = "archboard-canvas-codex-workbench" as const;

export class CodexWorkbenchCompositionError extends Error {
	override readonly name = "CodexWorkbenchCompositionError";

	constructor(
		readonly code: "duplicate_owner" | "not_started" | "startup_failed" | "shutdown_failed",
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
	}
}

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
	readonly transport: CodexTransport;
	readonly gateway: CodexWorkbenchGateway;
	readonly router: CodexWorkbenchRequestRouter;
	readonly replaceHooks: (hooks: CodexWorkbenchGenerationHooks) => Promise<void>;
	readonly stop: (reason: "shutdown" | "child_exit") => Promise<void>;
	readonly finishStop: () => void;
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
	readonly initializeSession: (session: CodexSession) => Promise<void>;
	readonly stopBrowser: (gateway: CodexWorkbenchGateway) => Promise<void>;
	readonly stopRealtime: (realtime: CodexRealtimeAdapter) => Promise<void>;
	readonly stopQueue: (queue: CodexWorkhorseQueue<OperationId>) => Promise<void> | void;
	readonly cancelDynamicApprovalsAndWaits: (components: CodexWorkbenchComponents) => Promise<void>;
	readonly settleOrdinaryRequests: (approvals: CodexApprovalBroker) => Promise<void>;
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
	readonly onChildExitFinished?: () => Promise<void> | void;
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
	const router = createCodexWorkbenchRequestRouter({
		approvals,
		dynamicTools,
		coordinatorTools,
		session,
	});
	const transportUnsubscribers: Array<() => void> = [];
	let hookUnsubscribers: Array<() => void> = [];
	let approvalProjectionUnsubscribe: (() => void) | null = null;
	const pendingChildSettlements = new Set<Promise<unknown>>();
	let stopped = false;
	let stopPromise: Promise<void> | null = null;
	let stopFinished = false;
	let currentHooks = options.hooks;
	const ownerHooks = options.hooks;

	const installHooks = (hooks: CodexWorkbenchGenerationHooks): void => {
		semanticDelivery.replaceHooks(hooks.threadContext);
		hooks.installIdentityDecoders(identity);
		const installed: Array<() => void> = [];
		try {
			installed.push(hooks.installLifecycleSignals(components));
			installed.push(hooks.installBrowserGateway(gateway));
			hookUnsubscribers = installed;
		} catch (error) {
			for (const unsubscribe of installed.toReversed()) unsubscribe();
			throw error;
		}
	};

	const removeHooks = (): void => {
		for (const unsubscribe of hookUnsubscribers.splice(0).toReversed()) unsubscribe();
	};

	const trackChildSettlement = (promise: Promise<unknown>): void => {
		pendingChildSettlements.add(promise);
		void promise.then(
			() => pendingChildSettlements.delete(promise),
			() => pendingChildSettlements.delete(promise),
		);
	};
	const settleChildExit = async (
		child: Parameters<CodexWorkbenchGateway["childExit"]>[0],
		childEpoch: Parameters<CodexWorkbenchGateway["childExit"]>[1],
	): Promise<void> => {
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
	};

	try {
		transportUnsubscribers.push(transport.onServerRequest(router.route));
		transportUnsubscribers.push(
			transport.onServerNotification((event) => {
				session[CODEX_SESSION_CONTROL].onNotification(event);
				coordinator.onNotification(event);
				operations.onNotification(event);
				realtime.onNotification(event);
				spokenApproval.onNotification(event);
			}),
		);
		transportUnsubscribers.push(
			transport.onExit(({ child, epoch: childEpoch }) => {
				options.onChildExitStart?.();
				const settlement = settleChildExit(child, childEpoch);
				trackChildSettlement(settlement);
				const retirement = (async (): Promise<void> => {
					let failure: Error | null = null;
					const retirementSteps: Array<() => unknown> = [
						() => settlement,
						() => stop("child_exit"),
						() => finishStop(),
						() => options.onChildExitFinished?.(),
					];
					for (const operation of retirementSteps) {
						try {
							await Promise.resolve(operation());
						} catch (error) {
							failure = appendFailure(failure, error, "Codex child retirement failed.");
						}
					}
					if (failure !== null) throw failure;
				})();
				void retirement.catch(() => undefined);
			}),
		);
		installHooks(currentHooks);
		approvalProjectionUnsubscribe = ownerHooks.installApprovalProjection(components);
		await ownerHooks.initializeSession(session);
	} catch (error) {
		let failure = error instanceof Error ? error : new Error(String(error));
		try {
			await stop("shutdown");
		} catch (cleanupError) {
			failure = appendFailure(failure, cleanupError, "Codex startup cleanup failed.");
		}
		try {
			finishStop();
		} catch (cleanupError) {
			failure = appendFailure(failure, cleanupError, "Codex startup final cleanup failed.");
		}
		throw failure;
	}

	async function replaceHooks(hooks: CodexWorkbenchGenerationHooks): Promise<void> {
		if (stopped)
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench cannot reload after terminal teardown.",
			);
		const previous = currentHooks;
		removeHooks();
		try {
			installHooks(hooks);
			currentHooks = hooks;
		} catch (error) {
			try {
				installHooks(previous);
			} catch (rollbackError) {
				throw new Error(
					`Codex source-hook replacement (${failureMessage(error)}) and rollback both failed.`,
					{
						cause: rollbackError,
					},
				);
			}
			throw error;
		}
	}

	function stop(reason: "shutdown" | "child_exit"): Promise<void> {
		if (stopPromise !== null) return stopPromise;
		stopped = true;
		const operation = (async (): Promise<void> => {
			let failure: Error | null = null;
			const attempt = async (cleanup: () => Promise<unknown> | void): Promise<void> => {
				try {
					await cleanup();
				} catch (error) {
					failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
				}
			};
			await attempt(() => ownerHooks.stopBrowser(gateway));
			await attempt(() => ownerHooks.stopRealtime(realtime));
			await attempt(() => realtime.dispose());
			await attempt(() => semanticPublisher.dispose());
			await attempt(() => ownerHooks.stopQueue(queue));
			await attempt(() => ownerHooks.cancelDynamicApprovalsAndWaits(components));
			await attempt(() => ownerHooks.settleOrdinaryRequests(approvals));
			await attempt(() => session[CODEX_SESSION_CONTROL].dispose());
			await attempt(() => callbacks.dispose());
			await attempt(() => spokenApproval.dispose());
			await attempt(() => semanticDelivery.dispose());
			await attempt(() => coordinatorTools.dispose());
			await attempt(() => dynamicTools.dispose());
			if (reason === "shutdown") await attempt(() => transport.shutdown());
			if (reason === "shutdown")
				await attempt(() => Promise.allSettled(Array.from(pendingChildSettlements)));
			if (failure !== null) throw failure;
		})();
		stopPromise = operation;
		return operation;
	}

	function finishStop(): void {
		if (stopFinished) return;
		stopFinished = true;
		let failure: Error | null = null;
		try {
			removeHooks();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex generation-hook cleanup failed.");
		}
		try {
			approvalProjectionUnsubscribe?.();
			approvalProjectionUnsubscribe = null;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex approval-projection cleanup failed.");
		}
		for (const unsubscribe of transportUnsubscribers.splice(0).toReversed()) {
			try {
				unsubscribe();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex listener cleanup failed.");
			}
		}
		for (const dispose of [() => approvals.dispose(), () => epoch.close()]) {
			try {
				dispose();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex final cleanup failed.");
			}
		}
		if (failure !== null) throw failure;
	}

	return Object.freeze({ transport, gateway, router, replaceHooks, stop, finishStop });
}

export interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly onChildExitStart: () => void;
	readonly onChildExitFinished: () => Promise<void>;
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
	startCurrentGeneration: (() => Promise<CodexWorkbenchSnapshot>) | null;
	reloadCurrentGeneration:
		| ((
				hooks: CodexWorkbenchGenerationHooks | CodexWorkbenchHooksFactory,
		  ) => Promise<CodexWorkbenchSnapshot>)
		| null;
	shutdownCurrentGeneration: (() => Promise<CodexWorkbenchSnapshot>) | null;
	readCurrentSnapshot: (() => CodexWorkbenchSnapshot) | null;
}

export function emptyCodexWorkbenchRetainedState(): CodexWorkbenchRetainedState {
	return {
		owner: null,
		generation: 0,
		state: "idle",
		failure: null,
		process: null,
		startCurrentGeneration: null,
		reloadCurrentGeneration: null,
		shutdownCurrentGeneration: null,
		readCurrentSnapshot: null,
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
	const reload = retainedWorkbench.reloadCurrentGeneration;
	if (reload === null)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active owner to reload.",
			),
		);
	return reload(hooks);
}

/** Stop the active production owner without importing its generation graph elsewhere. */
export function shutdownProductionCodexWorkbench(): Promise<CodexWorkbenchSnapshot> {
	const shutdown = retainedWorkbench.shutdownCurrentGeneration;
	if (shutdown === null)
		return Promise.reject(
			new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active owner to shut down.",
			),
		);
	return shutdown();
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function appendFailure(current: Error | null, next: unknown, message: string): Error {
	const nextError = next instanceof Error ? next : new Error(String(next));
	return current === null ? nextError : new AggregateError([current, nextError], message);
}

/**
 * Install the one process-lifetime graph behind replaceable source hooks.
 *
 * Only the process owner and plain scalar state remain in `retained`. Every
 * generation object stays in this invocation's closure and the next install
 * replaces the three closures that can reach it.
 */
export function installCodexWorkbenchOwner(
	retained: CodexWorkbenchRetainedState,
	options: CodexWorkbenchOwnerOptions,
): CodexWorkbenchOwner {
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
	let generation: CodexWorkbenchGeneration | null = null;
	let generationInput: CodexWorkbenchGenerationInput | null = null;
	let startPromise: Promise<CodexWorkbenchSnapshot> | null = null;
	let shutdownPromise: Promise<CodexWorkbenchSnapshot> | null = null;
	let childRetiring = false;
	let released = false;

	const snapshot = (): CodexWorkbenchSnapshot =>
		Object.freeze({
			owner: CODEX_WORKBENCH_OWNER,
			state: retained.state,
			generation: retained.generation,
			childPid: processOwner.currentChild()?.pid ?? null,
			ready: retained.state === "ready" && generation !== null && !childRetiring,
			failure: retained.failure,
		});

	const start = (): Promise<CodexWorkbenchSnapshot> => {
		if (startPromise !== null) return startPromise;
		if (shutdownPromise !== null)
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
			const unsubscribe = processOwner.onChild(resolveChild);
			try {
				const processStart = processOwner.start().catch((error) => {
					rejectChild(error);
					throw error;
				});
				void processStart.catch(() => undefined);
				const child = await childReady;
				const input: CodexWorkbenchGenerationInput = {
					generation: generationNumber,
					child,
					process: processOwner,
					onChildExitStart: beginChildRetirement,
					onChildExitFinished: finishChildRetirement,
				};
				generationInput = input;
				generation = await options.createGeneration(input);
				await processStart;
				if (childRetiring)
					throw new CodexWorkbenchCompositionError(
						"startup_failed",
						"The Codex child exited before workbench readiness.",
					);
				retained.state = "ready";
				return snapshot();
			} catch (error) {
				let cause = error;
				try {
					await terminalStop();
				} catch (cleanupError) {
					cause = new AggregateError(
						[error, cleanupError],
						"Codex workbench startup and cleanup both failed.",
					);
				}
				releaseRegistration("failed", failureMessage(cause));
				throw new CodexWorkbenchCompositionError(
					"startup_failed",
					"The production Codex workbench did not become ready.",
					cause,
				);
			} finally {
				unsubscribe();
			}
		})();
		startPromise = operation;
		return operation;
	};

	const reload = async (
		hooks: CodexWorkbenchGenerationHooks | CodexWorkbenchHooksFactory,
	): Promise<CodexWorkbenchSnapshot> => {
		if (generation === null || generationInput === null || retained.state !== "ready")
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench is not ready for source-hook replacement.",
			);
		await generation.replaceHooks(typeof hooks === "function" ? hooks(generationInput) : hooks);
		retained.generation += 1;
		return snapshot();
	};

	const terminalStop = async (): Promise<void> => {
		const current = generation;
		generation = null;
		generationInput = null;
		let failure: Error | null = null;
		if (current !== null) {
			try {
				await current.stop("shutdown");
			} catch (error) {
				failure = appendFailure(failure, error, "Codex graph shutdown failed.");
			}
		}
		try {
			await processOwner.stop();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex process shutdown failed.");
		}
		if (current !== null) {
			try {
				current.finishStop();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
			}
		}
		if (failure !== null) throw failure;
	};

	function releaseRegistration(state: CodexWorkbenchState, failure: string | null): void {
		if (released) return;
		released = true;
		retained.state = state;
		retained.failure = failure;
		retained.owner = null;
		retained.process = null;
		retained.startCurrentGeneration = null;
		retained.reloadCurrentGeneration = null;
		retained.shutdownCurrentGeneration = null;
		retained.readCurrentSnapshot = null;
	}

	function beginChildRetirement(): void {
		if (childRetiring || released) return;
		childRetiring = true;
		retained.state = "stopping";
	}

	async function finishChildRetirement(): Promise<void> {
		let failure: Error | null = null;
		try {
			await processOwner.stop();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child-exit process cleanup failed.");
		}
		if (failure === null) releaseRegistration("idle", null);
		else {
			retained.state = "failed";
			retained.failure = failureMessage(failure);
			throw failure;
		}
	}

	const shutdown = (): Promise<CodexWorkbenchSnapshot> => {
		if (shutdownPromise !== null) return shutdownPromise;
		const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
			retained.state = "stopping";
			try {
				await terminalStop();
				retained.state = "idle";
				retained.failure = null;
				const stopped = snapshot();
				releaseRegistration("idle", null);
				return stopped;
			} catch (error) {
				retained.state = "failed";
				retained.failure = failureMessage(error);
				throw new CodexWorkbenchCompositionError(
					"shutdown_failed",
					"The production Codex workbench did not shut down cleanly.",
					error,
				);
			}
		})();
		shutdownPromise = operation;
		return operation;
	};

	const gateway = (): CodexWorkbenchGateway => {
		if (generation === null || retained.state !== "ready")
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench browser gateway is not ready.",
			);
		return generation.gateway;
	};

	retained.startCurrentGeneration = start;
	retained.reloadCurrentGeneration = reload;
	retained.shutdownCurrentGeneration = shutdown;
	retained.readCurrentSnapshot = snapshot;
	return Object.freeze({ start, reload, snapshot, gateway, shutdown });
}
