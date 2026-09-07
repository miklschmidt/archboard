import type { CodexApprovalBrokerOptions } from "@/runtime/codex-approvals";
import type { CoordinatorCallbackOptions } from "@/runtime/codex-coordinator-callbacks";
import type { CodexCoordinatorToolsOptions } from "@/runtime/codex-coordinator-tools";
import type { CodexCoordinatorOptions } from "@/runtime/codex-coordinator";
import type {
	CodexDynamicToolsOptions,
	DynamicContextPort,
	DynamicOperationIdPort,
	DynamicThreadAuthorityPort,
	DynamicToolApprovalPort,
	DynamicToolLifecyclePort,
} from "@/runtime/codex-dynamic-tools";
import type { CodexEpochStoreOptions } from "@/runtime/codex-epoch";
import type { CodexProcessOptions } from "@/runtime/codex-process";
import type { CodexSessionOptions } from "@/runtime/codex-session";
import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime";
import type { SemanticContextPublisherOptions } from "@/runtime/codex-semantic-context";
import type { CodexSpokenApprovalGateOptions } from "@/runtime/codex-spoken-approval";
import type { CodexThreadContextControllerOptions } from "@/runtime/codex-thread-context";
import type { CodexThreadLinkOptions } from "@/runtime/codex-thread-link";
import type { CodexTransportOptions } from "@/runtime/codex-transport";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { WorkhorseOperationOptions } from "@/runtime/codex-workhorse-operations";
import type { WorkhorseQueueOptions } from "@/runtime/codex-workhorse-queue";
import type { CodexWorkhorseStartOptions } from "@/runtime/codex-workhorse-start";
import type { IdentityLedger, OperationId } from "@/shared/codex-workbench-identity";
import type { CodexWorkbenchGatewayOptions } from "@/server/codex-workbench";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
} from "@/server/canvas/lib/codex-workbench-lifecycle";

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

/** What installing the one production workbench for a canvas lifetime needs. */
interface InstallProductionCodexWorkbenchOptions {
	readonly process: CodexProcessOptions;
	readonly bindings: (input: CodexWorkbenchGenerationInput) => ProductionCodexWorkbenchBindings;
	readonly hooks: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchGenerationHooks;
}

export type {
	CodexWorkbenchComponentFactories,
	CodexWorkbenchCoordinatorCallOwner,
	CodexWorkbenchDynamicAdapterFactories,
	ComponentBuilder,
	ComponentName,
	ComposeCodexWorkbenchGenerationOptions,
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
};
