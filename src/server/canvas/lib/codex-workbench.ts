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
	createCodexSession,
	type CodexSessionOptions,
} from "../../../runtime/codex-session/index.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeAdapterOptions,
} from "../../../runtime/codex-realtime/index.js";
import {
	createCodexSpokenApprovalGate,
	type CodexSpokenApprovalGate,
	type CodexSpokenApprovalGateOptions,
} from "../../../runtime/codex-spoken-approval/index.js";
import {
	createCodexThreadContextDelivery,
	type CodexThreadContextDelivery,
	type CodexThreadContextDeliveryOptions,
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
	readonly stop: (reason: "reload" | "shutdown" | "child_exit") => Promise<void>;
	readonly finishStop: () => void;
}

export interface CodexWorkbenchComponents {
	readonly identity: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly transport: CodexTransport;
	readonly session: CodexSession;
	readonly threadLink: CodexThreadLinkPort;
	readonly workhorse: CodexWorkhorseStart;
	readonly realtime: CodexRealtimeAdapter;
	readonly approvals: CodexApprovalBroker;
	readonly dynamicTools: CodexDynamicTools;
	readonly coordinatorTools: CoordinatorToolDispatcher;
	readonly semanticDelivery: CodexThreadContextDelivery;
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
}

type ComponentBuilder<Value> = (created: Readonly<Partial<CodexWorkbenchComponents>>) => Value;

export interface CodexWorkbenchDynamicAdapterFactories {
	readonly approval: ComponentBuilder<DynamicToolApprovalPort>;
	readonly threadAuthority: ComponentBuilder<DynamicThreadAuthorityPort>;
	readonly context: ComponentBuilder<DynamicContextPort>;
	readonly operationId: ComponentBuilder<DynamicOperationIdPort>;
	readonly lifecycle: ComponentBuilder<DynamicToolLifecyclePort>;
}

export interface ProductionCodexWorkbenchBindings {
	readonly epoch: ComponentBuilder<CodexEpochStoreOptions>;
	readonly transport: ComponentBuilder<Omit<CodexTransportOptions, "identity">>;
	readonly session: ComponentBuilder<Omit<CodexSessionOptions, "transport" | "identity">>;
	readonly threadLink: ComponentBuilder<Omit<CodexThreadLinkOptions, "session" | "epoch">>;
	readonly workhorse: ComponentBuilder<
		Omit<CodexWorkhorseStartOptions, "session" | "threadLink" | "epoch" | "identity" | "operation">
	>;
	readonly realtime: ComponentBuilder<Omit<CodexRealtimeAdapterOptions, "session" | "identity">>;
	readonly approvals: ComponentBuilder<Omit<CodexApprovalBrokerOptions, "transport" | "identity">>;
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
		Omit<CodexThreadContextDeliveryOptions, "session" | "threadLink" | "identity" | "epoch">
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
	readonly callbacks: ComponentBuilder<
		Omit<CoordinatorCallbackOptions, "operations" | "session" | "threadLink">
	>;
	readonly gateway: ComponentBuilder<Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink">>;
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
	return value as CodexWorkbenchComponents[Name];
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
			createCodexThreadContextDelivery({
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
		coordinatorTools: (created) =>
			createCodexCoordinatorTools({
				...bindings.coordinatorTools(created),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
				operations: requireComponent(created, "operations"),
				spokenApproval: requireComponent(created, "spokenApproval"),
				transport: requireComponent(created, "transport"),
			}),
		callbacks: (created) =>
			createCodexCoordinatorCallbacks({
				...bindings.callbacks(created),
				operations: requireComponent(created, "operations"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
			}),
		gateway: (created) =>
			createCodexWorkbenchGateway({
				...bindings.gateway(created),
				identity: requireComponent(created, "identity"),
				threadLink: requireComponent(created, "threadLink"),
			}),
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
	const identity = options.factories.identity(created);
	created.identity = identity;
	options.hooks.installIdentityDecoders(identity);
	const epoch = options.factories.epoch(created);
	created.epoch = epoch;
	const transport = options.factories.transport(created);
	created.transport = transport;
	installDynamicRegistrations(transport);
	const session = options.factories.session(created);
	created.session = session;
	const threadLink = options.factories.threadLink(created);
	created.threadLink = threadLink;
	const workhorse = options.factories.workhorse(created);
	created.workhorse = workhorse;
	const realtime = options.factories.realtime(created);
	created.realtime = realtime;
	const approvals = options.factories.approvals(created);
	created.approvals = approvals;
	const dynamicTools = options.factories.dynamicTools(created);
	created.dynamicTools = dynamicTools;
	const semanticDelivery = options.factories.semanticDelivery(created);
	created.semanticDelivery = semanticDelivery;
	const coordinator = options.factories.coordinator(created);
	created.coordinator = coordinator;
	const queue = options.factories.queue(created);
	created.queue = queue;
	const operations = options.factories.operations(created);
	created.operations = operations;
	const spokenApproval = options.factories.spokenApproval(created);
	created.spokenApproval = spokenApproval;
	const coordinatorTools = options.factories.coordinatorTools(created);
	created.coordinatorTools = coordinatorTools;
	const callbacks = options.factories.callbacks(created);
	created.callbacks = callbacks;
	const gateway = options.factories.gateway(created);
	created.gateway = gateway;
	const components = Object.freeze(created as CodexWorkbenchComponents);
	const router = createCodexWorkbenchRequestRouter({
		approvals,
		dynamicTools,
		coordinatorTools,
		session,
	});
	const unsubscribers: Array<() => void> = [];
	const pendingChildExit = new Set<Promise<unknown>>();
	let stopped = false;
	let stopFinished = false;

	const trackChildExit = (promise: Promise<unknown>): void => {
		pendingChildExit.add(promise);
		void promise.then(
			() => pendingChildExit.delete(promise),
			() => pendingChildExit.delete(promise),
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
		await attempt(() => gateway.childExit(child, childEpoch));
		await attempt(() => spokenApproval.onChildExit({ child, epoch: childEpoch }));
		await attempt(() => coordinatorTools.onChildExit({ child, epoch: childEpoch }));
		await attempt(() => approvals.childExit({ child, epoch: childEpoch }));
		await attempt(() => semanticDelivery.dispose());
		await attempt(() => dynamicTools.dispose());
		if (failure !== null) throw failure;
	};

	try {
		unsubscribers.push(transport.onServerRequest(router.route));
		unsubscribers.push(
			transport.onServerNotification((event) => {
				coordinator.onNotification(event);
				operations.onNotification(event);
				realtime.onNotification(event);
				spokenApproval.onNotification(event);
			}),
		);
		unsubscribers.push(
			transport.onExit(({ child, epoch: childEpoch }) => {
				trackChildExit(settleChildExit(child, childEpoch));
			}),
		);
		unsubscribers.push(options.hooks.installLifecycleSignals(components));
		unsubscribers.push(options.hooks.installApprovalProjection(components));
		unsubscribers.push(options.hooks.installBrowserGateway(gateway));
		await options.hooks.initializeSession(session);
	} catch (error) {
		for (const unsubscribe of unsubscribers.splice(0).toReversed()) unsubscribe();
		await Promise.allSettled([gateway.dispose(), transport.shutdown()]);
		throw error;
	}

	const stop = async (reason: "reload" | "shutdown" | "child_exit"): Promise<void> => {
		if (stopped) return;
		stopped = true;
		let failure: Error | null = null;
		const attempt = async (operation: () => Promise<unknown> | void): Promise<void> => {
			try {
				await operation();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
			}
		};
		await attempt(() => options.hooks.stopBrowser(gateway));
		await attempt(() => options.hooks.stopRealtime(realtime));
		await attempt(() => realtime.dispose());
		await attempt(() => options.hooks.stopQueue(queue));
		await attempt(() => options.hooks.cancelDynamicApprovalsAndWaits(components));
		await attempt(() => options.hooks.settleOrdinaryRequests(approvals));
		await attempt(() => callbacks.dispose());
		await attempt(() => spokenApproval.dispose());
		await attempt(() => semanticDelivery.dispose());
		await attempt(() => coordinatorTools.dispose());
		await attempt(() => dynamicTools.dispose());
		if (reason !== "child_exit") await attempt(() => transport.shutdown());
		await attempt(() => Promise.allSettled(Array.from(pendingChildExit)));
		if (failure !== null) throw failure;
	};

	const finishStop = (): void => {
		if (stopFinished) return;
		stopFinished = true;
		let failure: Error | null = null;
		for (const unsubscribe of unsubscribers.splice(0).toReversed()) {
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
	};

	return Object.freeze({ transport, gateway, router, stop, finishStop });
}

export interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly reloading: boolean;
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

export interface CodexWorkbenchOwner {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
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
	stopCurrentGeneration: ((reason: "reload" | "shutdown") => Promise<void>) | null;
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
		stopCurrentGeneration: null,
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
			}),
	});
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function appendFailure(current: Error | null, next: unknown, message: string): Error {
	const nextError = next instanceof Error ? next : new Error(String(next));
	return current === null ? nextError : new AggregateError([current, nextError], message);
}

/**
 * Install one hot generation over a retained process owner.
 *
 * Only the process owner and plain scalar state remain in `retained`. Every
 * generation object stays in this invocation's closure and the next install
 * replaces the three closures that can reach it.
 */
export function installCodexWorkbenchOwner(
	retained: CodexWorkbenchRetainedState,
	options: CodexWorkbenchOwnerOptions,
): CodexWorkbenchOwner {
	if (retained.owner !== null && retained.owner !== CODEX_WORKBENCH_OWNER)
		throw new CodexWorkbenchCompositionError(
			"duplicate_owner",
			`The retained Codex workbench is already owned by ${String(retained.owner)}.`,
		);
	retained.owner = CODEX_WORKBENCH_OWNER;
	retained.process ??= options.createProcess();
	const processOwner = retained.process;
	const previousStop = retained.stopCurrentGeneration;
	let generation: CodexWorkbenchGeneration | null = null;
	let startPromise: Promise<CodexWorkbenchSnapshot> | null = null;
	let shutdownPromise: Promise<CodexWorkbenchSnapshot> | null = null;

	const snapshot = (): CodexWorkbenchSnapshot =>
		Object.freeze({
			owner: CODEX_WORKBENCH_OWNER,
			state: retained.state,
			generation: retained.generation,
			childPid: processOwner.currentChild()?.pid ?? null,
			ready: retained.state === "ready" && generation !== null,
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
			const reloading = previousStop !== null || processOwner.currentChild() !== null;
			if (previousStop !== null) await previousStop("reload");
			retained.generation += 1;
			const generationNumber = retained.generation;
			let resolveChild!: (child: CodexProcessChild) => void;
			const childReady = new Promise<CodexProcessChild>((resolve) => {
				resolveChild = resolve;
			});
			const unsubscribe = processOwner.onChild(resolveChild);
			try {
				const processStart = processOwner.start();
				const child = await childReady;
				generation = await options.createGeneration({
					generation: generationNumber,
					child,
					process: processOwner,
					reloading,
				});
				await processStart;
				retained.state = "ready";
				return snapshot();
			} catch (error) {
				let cause = error;
				try {
					await stopGeneration("shutdown");
				} catch (cleanupError) {
					cause = new AggregateError(
						[error, cleanupError],
						"Codex workbench startup and cleanup both failed.",
					);
				}
				retained.state = "failed";
				retained.failure = failureMessage(cause);
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

	const stopGeneration = async (reason: "reload" | "shutdown"): Promise<void> => {
		if (generation === null) {
			if (reason === "shutdown") await processOwner.stop();
			return;
		}
		const current = generation;
		generation = null;
		let failure: unknown = null;
		try {
			await current.stop(reason);
		} catch (error) {
			failure = error;
		}
		if (reason === "shutdown") {
			try {
				await processOwner.stop();
			} catch (error) {
				failure ??= error;
			}
		}
		try {
			current.finishStop();
		} catch (error) {
			failure ??= error;
		}
		if (failure !== null) throw failure;
	};

	const shutdown = (): Promise<CodexWorkbenchSnapshot> => {
		if (shutdownPromise !== null) return shutdownPromise;
		const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
			retained.state = "stopping";
			try {
				await stopGeneration("shutdown");
				retained.state = "idle";
				retained.failure = null;
				return snapshot();
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
	retained.stopCurrentGeneration = stopGeneration;
	retained.readCurrentSnapshot = snapshot;
	return Object.freeze({ start, snapshot, gateway, shutdown });
}
