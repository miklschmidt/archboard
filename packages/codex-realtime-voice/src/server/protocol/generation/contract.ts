import type { CodexApprovalBrokerOptions } from "#runtime/services/approvals/contract.ts";
import type { CoordinatorCallbackOptions } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CodexCoordinatorToolsOptions } from "#runtime/protocol/coordinator-tools/contract.ts";
import type { CodexCoordinatorOptions } from "#runtime/protocol/coordinator/contract.ts";
import type { CodexSpokenApprovalGateOptions } from "#runtime/protocol/spoken-approval/contract.ts";
import type { CodexEpochStoreOptions } from "#runtime/store/epoch/contract.ts";
import type { CodexProcessOptions } from "@archboard/codex-app-server/process";
import type { CodexSessionOptions } from "@archboard/codex-app-server/session";
import type { CodexRealtimeAdapterOptions } from "#runtime/services/realtime/contract.ts";
import type { WorkbenchContextPublisher } from "#runtime/protocol/host/context-source.ts";
import type { CodexWorkbenchDomain } from "#server/protocol/generation/domain.ts";
import type { CodexThreadContextControllerOptions } from "#runtime/services/thread-context/contract.ts";
import type { CodexThreadLinkOptions } from "#runtime/rules/thread-link/thread-link.ts";
import type {
	CodexTransportOptions,
	DynamicServerRequest,
} from "@archboard/codex-app-server/transport";
import type { WorkhorseOperationOptions } from "#runtime/protocol/workhorse-operations/contract.ts";
import type { CodexWorkhorseStartOptions } from "#runtime/protocol/workhorse-start/contract.ts";
import type { WorkhorseQueueOptions } from "#runtime/services/workhorse-queue/contract.ts";
import type { IdentityLedger, OperationId } from "@archboard/codex-app-server/identity";
import type { CodexWorkbenchGatewayOptions } from "#server/protocol/gateway/contract.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
} from "#server/services/owner/lifecycle.ts";
import type { CodexWorkbenchSharedComponents } from "#server/services/generation/lifecycle.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
	CreateCodexWorkbenchSessionsOptions,
} from "#server/services/sessions/sessions.ts";

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
	readonly semanticPublisher: WorkhorseComponentBuilder<WorkbenchContextPublisher>;
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
	readonly presentation?: import("#server/services/voice/presentation.ts").WorkbenchVoicePresentationAdapter;
	readonly semanticPublisher: SessionComponentBuilder<WorkbenchContextPublisher>;
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
	readonly dynamicRegistrations?: readonly {
		readonly namespace: string;
		readonly manifestHash: string;
	}[];
	readonly epoch: ComponentBuilder<CodexEpochStoreOptions>;
	readonly transport: ComponentBuilder<Omit<CodexTransportOptions, "identity">>;
	readonly session: ComponentBuilder<
		Omit<CodexSessionOptions, "transport" | "identity" | "listenerOwnership">
	>;
	readonly threadLink: ComponentBuilder<Omit<CodexThreadLinkOptions, "session" | "epoch">>;
	readonly approvals: ComponentBuilder<
		Omit<CodexApprovalBrokerOptions, "transport" | "identity" | "listenerOwnership">
	>;
	readonly dynamicTools: ComponentBuilder<CodexWorkbenchDomain | null>;
	/** How the generation's tab sessions settle what an ended session was asked. */
	readonly sessions: ComponentBuilder<
		Pick<
			CreateCodexWorkbenchSessionsOptions,
			"endApprovals" | "shownConversationOf" | "resolveCheckout"
		>
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
