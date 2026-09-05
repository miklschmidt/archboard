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
	type CodexProcessOptions,
} from "../../../runtime/codex-process/index.js";
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
	createIdentityLedger,
	type IdentityAuthorities,
	type IdentityLedger,
	type OperationId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexWorkbenchGateway,
	type CodexWorkbenchGateway,
	type CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import { CodexWorkbenchCompositionError } from "./codex-workbench-error.js";
import {
	CODEX_WORKBENCH_OWNER,
	createCodexWorkbenchGenerationLifecycle,
	installCodexWorkbenchOwnerLifecycle,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchStableKernel,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
} from "./codex-workbench-lifecycle.js";

type ComponentName = keyof CodexWorkbenchComponents;

function isCoordinatorToolRequest(
	request: TransportServerRequest,
): request is Parameters<CoordinatorToolDispatcher["dispatch"]>[0] {
	return request.method === "item/tool/call" && request.owner === "codex-coordinator-tools";
}

type CodexWorkbenchComponentFactories = {
	readonly [Name in ComponentName]: (
		created: Readonly<Partial<CodexWorkbenchComponents>>,
	) => CodexWorkbenchComponents[Name];
};

function installDynamicRegistrations(transport: CodexTransport): void {
	transport.registerDynamicDispatcher({
		owner: "codex-dynamic-tools",
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
	for (const registration of COORDINATOR_DYNAMIC_DISPATCHERS) {
		transport.registerDynamicDispatcher(registration);
	}
}

interface ComposeCodexWorkbenchGenerationOptions {
	readonly factories: CodexWorkbenchComponentFactories;
	readonly identityLedger: IdentityLedger;
	readonly ownsTransport?: boolean;
	readonly activate?: boolean;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly assertActivationCurrent?: () => void;
}

type ComponentBuilder<Value> = (created: Readonly<Partial<CodexWorkbenchComponents>>) => Value;

interface CodexWorkbenchDynamicAdapterFactories {
	readonly approval: ComponentBuilder<DynamicToolApprovalPort>;
	readonly threadAuthority: ComponentBuilder<DynamicThreadAuthorityPort>;
	readonly context: ComponentBuilder<DynamicContextPort>;
	readonly operationId: ComponentBuilder<DynamicOperationIdPort>;
	readonly lifecycle: ComponentBuilder<DynamicToolLifecyclePort>;
}

interface CodexWorkbenchCoordinatorCallOwner {
	readonly run: <Value>(
		request: DynamicServerRequest,
		operation: () => Promise<Value>,
	) => Promise<Value>;
}

interface ProductionCodexWorkbenchBindings {
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
	if (value === undefined) {
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			`The Codex workbench tried to create ${name} before its dependency was ready.`,
		);
	}
	return created[name]!;
}

/** Bind the reviewed runtime constructors to one production generation. */
function createProductionCodexWorkbenchFactories(
	bindings: ProductionCodexWorkbenchBindings,
	kernel: CodexWorkbenchStableKernel | null = null,
	adoptedSession: CodexWorkbenchGenerationInput["adoptedSession"] = null,
	identityLedger: IdentityLedger = kernel?.identityLedger ?? createIdentityLedger(),
	initialIdentity: IdentityAuthorities | null = null,
): CodexWorkbenchComponentFactories {
	return Object.freeze({
		identity: () => initialIdentity ?? createIdentityAuthorities(identityLedger),
		epoch: (created) => createCodexEpochStore(bindings.epoch(created)),
		transport: (created) => {
			const identity = requireComponent(created, "identity").identity;
			if (kernel !== null) {
				kernel.transport.replaceIdentity(identity);
				return kernel.transport;
			}
			const transport = createCodexTransport({
				...bindings.transport(created),
				identity,
			});
			installDynamicRegistrations(transport);
			return transport;
		},
		session: (created) =>
			createCodexSession({
				...bindings.session(created),
				transport: requireComponent(created, "transport"),
				identity: requireComponent(created, "identity").identity,
				listenerOwnership: "composition",
				...(adoptedSession === null ? {} : { adoptedReadiness: adoptedSession }),
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
					if (!isCoordinatorToolRequest(request)) {
						return;
					}
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
async function composeCodexWorkbenchGeneration(
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
		if (options.ownsTransport !== false) {
			constructionCleanups.push(() => transport.shutdown());
		}
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
				const next = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
				failure = new AggregateError([failure, next], "Codex construction cleanup failed.");
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
	const source = createCodexWorkbenchGenerationLifecycle({
		components,
		identityLedger: options.identityLedger,
		hooks: options.hooks,
		assertActivationCurrent: options.assertActivationCurrent ?? (() => undefined),
	});
	if (options.activate !== false) {
		await source.activate();
	}
	return source;
}

interface InstallProductionCodexWorkbenchOptions {
	readonly process: CodexProcessOptions;
	readonly bindings: (input: CodexWorkbenchGenerationInput) => ProductionCodexWorkbenchBindings;
	readonly hooks: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchGenerationHooks;
}

function productionGenerationFactory(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchGenerationFactory {
	return async (input) => {
		const identityLedger = input.kernel?.identityLedger ?? createIdentityLedger();
		return composeCodexWorkbenchGeneration({
			factories: createProductionCodexWorkbenchFactories(
				options.bindings(input),
				input.kernel,
				input.adoptedSession,
				identityLedger,
				input.initialIdentity,
			),
			identityLedger,
			ownsTransport: input.kernel === null,
			activate: false,
			hooks: options.hooks(input),
			assertActivationCurrent: input.assertActivationCurrent,
		});
	};
}

function productionKernelFactory(
	options: InstallProductionCodexWorkbenchOptions,
): NonNullable<CodexWorkbenchOwnerOptions["createKernel"]> {
	return (input) => {
		const identityLedger = createIdentityLedger();
		const identity = createIdentityAuthorities(identityLedger);
		const bindings = options.bindings(input);
		const transport = createCodexTransport({
			...bindings.transport({ identity }),
			identity: identity.identity,
		});
		if (transport.inspect().state === "open") {
			installDynamicRegistrations(transport);
		}
		return Object.freeze({
			kernel: Object.freeze({ identityLedger, transport }),
			identity,
		});
	};
}

/** Install the mandatory production owner for one canvas application lifetime. */
function installProductionCodexWorkbench(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchOwner {
	return installCodexWorkbenchOwner({
		createProcess: () => createCodexProcess(options.process),
		createKernel: productionKernelFactory(options),
		createGeneration: productionGenerationFactory(options),
	});
}

function installCodexWorkbenchOwner(options: CodexWorkbenchOwnerOptions): CodexWorkbenchOwner {
	return installCodexWorkbenchOwnerLifecycle(options);
}

export {
	CodexWorkbenchCompositionError,
	CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchStableKernel,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
	type CodexWorkbenchComponentFactories,
	type ComposeCodexWorkbenchGenerationOptions,
	type CodexWorkbenchDynamicAdapterFactories,
	type CodexWorkbenchCoordinatorCallOwner,
	type ProductionCodexWorkbenchBindings,
	createProductionCodexWorkbenchFactories,
	composeCodexWorkbenchGeneration,
	type InstallProductionCodexWorkbenchOptions,
	installProductionCodexWorkbench,
	installCodexWorkbenchOwner,
};
