import type { CodexApprovalBrokerOptions } from "@archboard/workbench/approvals";
import type {
	CoordinatorCallbackOptions,
	CodexCoordinatorToolsOptions,
	CodexCoordinatorOptions,
	CodexSpokenApprovalGateOptions,
} from "@archboard/workbench/coordinator";
import type {
	CodexDynamicToolsOptions,
	DynamicContextPort,
	DynamicOperationIdPort,
	DynamicThreadAuthorityPort,
	DynamicToolApprovalPort,
	DynamicToolLifecyclePort,
} from "@archboard/workbench/dynamic-tools";
import type { CodexEpochStoreOptions } from "@archboard/workbench/epoch";
import type { CodexProcessOptions } from "@archboard/codex-app-server/process";
import type { CodexSessionOptions } from "@archboard/codex-app-server/session";
import type { CodexRealtimeAdapterOptions } from "@archboard/workbench/realtime";
import type { SemanticContextPublisherOptions } from "@archboard/codex-app-server/semantic-context";
import type { CodexThreadContextControllerOptions } from "@archboard/workbench/thread-tools";
import type { CodexThreadLinkOptions } from "@archboard/workbench/thread-link";
import type {
	CodexTransportOptions,
	DynamicServerRequest,
} from "@archboard/codex-app-server/transport";
import type {
	WorkhorseOperationOptions,
	CodexWorkhorseStartOptions,
} from "@archboard/workbench/workhorses";
import type { WorkhorseQueueOptions } from "@archboard/workbench/workhorse-queue";
import type { IdentityLedger, OperationId } from "@archboard/codex-app-server/identity";
import type { CodexWorkbenchGatewayOptions } from "@/server/codex-workbench";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
} from "@/server/archboard/lib/codex-workbench-lifecycle";
import type { CodexWorkbenchSharedComponents } from "@/server/archboard/lib/codex-workbench-generation-lifecycle";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
	CreateCodexWorkbenchSessionsOptions,
} from "@/server/archboard/lib/codex-workbench-sessions";

/** One component of the graph, by the name the graph knows it under. */
type ComponentName = keyof CodexWorkbenchComponents;

type CodexWorkbenchComponentFactories = {
	readonly [Name in ComponentName]: (
		created: Readonly<Partial<CodexWorkbenchComponents>>,
	) => CodexWorkbenchComponents[Name];
};

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

/** One tab session component, by the name its session knows it under. */
type SessionComponentName = keyof CodexWorkbenchSessionComponents;

/** One workhorse component, by the name its workhorse knows it under. */
type WorkhorseComponentName = keyof CodexWorkbenchWorkhorseComponents;

/** Builds one tab session component's options from the session components built before it. */
type SessionComponentBuilder<Value> = (
	created: Readonly<Partial<CodexWorkbenchSessionComponents>>,
) => Value;

/** Builds one workhorse component's options from the workhorse components built before it. */
type WorkhorseComponentBuilder<Value> = (
	created: Readonly<Partial<CodexWorkbenchWorkhorseComponents>>,
) => Value;

/** What each owner of one workhorse is configured with. */
interface CodexWorkbenchWorkhorseBindings {
	readonly workhorse: WorkhorseComponentBuilder<
		Omit<CodexWorkhorseStartOptions, "session" | "threadLink" | "epoch" | "identity" | "operation">
	>;
	readonly semanticPublisher: WorkhorseComponentBuilder<SemanticContextPublisherOptions>;
	readonly semanticDelivery: WorkhorseComponentBuilder<
		Omit<CodexThreadContextControllerOptions, "session" | "threadLink" | "identity" | "epoch">
	>;
	readonly queue: WorkhorseComponentBuilder<
		Omit<WorkhorseQueueOptions<OperationId>, "session" | "identity" | "operationIds">
	>;
	readonly operations: WorkhorseComponentBuilder<
		Omit<
			WorkhorseOperationOptions,
			"session" | "threadLink" | "queue" | "epoch" | "identity" | "operation"
		>
	>;
}

/** What each of one tab session's own components is configured with. */
interface CodexWorkbenchSessionBindings {
	readonly semanticPublisher: SessionComponentBuilder<SemanticContextPublisherOptions>;
	readonly realtime: SessionComponentBuilder<
		Omit<CodexRealtimeAdapterOptions, "session" | "identity">
	>;
	readonly coordinator: SessionComponentBuilder<
		Omit<CodexCoordinatorOptions, "session" | "threadLink" | "epoch" | "identity">
	>;
	readonly spokenApproval: SessionComponentBuilder<
		Omit<
			CodexSpokenApprovalGateOptions,
			"approvalBroker" | "coordinator" | "realtime" | "session" | "identity"
		>
	>;
	readonly coordinatorTools: SessionComponentBuilder<
		Omit<CodexCoordinatorToolsOptions, "identity" | "operation" | "spokenApproval" | "transport">
	>;
	readonly coordinatorCall: CodexWorkbenchCoordinatorCallOwner;
	readonly callbacks: SessionComponentBuilder<
		Omit<CoordinatorCallbackOptions, "identity" | "threadLink" | "transport">
	>;
}

interface ProductionCodexWorkbenchBindings {
	readonly epoch: ComponentBuilder<CodexEpochStoreOptions>;
	readonly transport: ComponentBuilder<Omit<CodexTransportOptions, "identity">>;
	readonly session: ComponentBuilder<
		Omit<CodexSessionOptions, "transport" | "identity" | "listenerOwnership">
	>;
	readonly threadLink: ComponentBuilder<Omit<CodexThreadLinkOptions, "session" | "epoch">>;
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
	/** How the generation's tab sessions settle what an ended session was asked. */
	readonly sessions: ComponentBuilder<
		Pick<CreateCodexWorkbenchSessionsOptions, "endApprovals" | "shownConversationOf">
	>;
	/** What each component of one tab session is configured with. */
	readonly tabSession: (
		scope: CodexWorkbenchTabSessionScope,
		shared: CodexWorkbenchSharedComponents,
	) => CodexWorkbenchSessionBindings;
	/** What each component of one workhorse of a tab session is configured with. */
	readonly workhorse: (
		scope: CodexWorkbenchWorkhorseScope,
		shared: CodexWorkbenchSharedComponents,
	) => CodexWorkbenchWorkhorseBindings;
	readonly gateway: (
		created: Readonly<Omit<CodexWorkbenchComponents, "gateway">>,
	) => Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink">;
}

/** What installing the one production workbench for a server lifetime needs. */
interface InstallProductionCodexWorkbenchOptions {
	readonly process: CodexProcessOptions;
	readonly bindings: (input: CodexWorkbenchGenerationInput) => ProductionCodexWorkbenchBindings;
	readonly hooks: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchGenerationHooks;
}

export type {
	CodexWorkbenchComponentFactories,
	CodexWorkbenchCoordinatorCallOwner,
	CodexWorkbenchDynamicAdapterFactories,
	CodexWorkbenchSessionBindings,
	CodexWorkbenchWorkhorseBindings,
	ComponentBuilder,
	ComponentName,
	ComposeCodexWorkbenchGenerationOptions,
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
	SessionComponentBuilder,
	SessionComponentName,
	WorkhorseComponentBuilder,
	WorkhorseComponentName,
};
