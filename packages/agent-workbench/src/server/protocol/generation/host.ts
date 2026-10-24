import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { LogicalToolCallCorrelation } from "@archboard/codex-app-server/identity";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
	WorkbenchOperation,
} from "#runtime/protocol/host/context.ts";
import type { WorkbenchInstructions } from "#runtime/protocol/host/instructions.ts";
import type {
	WorkbenchContextPublisher,
	WorkbenchContextSource,
	WorkbenchVoicePolicy,
	WorkbenchContextEvent,
} from "#runtime/protocol/host/context-source.ts";
import type { CoordinatorCallbackHostPolicy } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type {
	CodexWorkbenchDomainScope,
	CodexWorkbenchDomainTools,
} from "#server/protocol/generation/domain.ts";
import type { BrowserVoicePresentation } from "#shared/schemas/browser/snapshot.ts";
import type { WorkbenchVoicePresentationAdapter } from "#server/services/voice/presentation.ts";
import type { CodexWorkbenchGateway } from "#server/protocol/gateway/contract.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";

/** Domain context is data. It never replaces the core execution and approval gates. */
export interface CodexWorkbenchSessionContext {
	readonly publisher: WorkbenchContextPublisher;
	readonly callbacks: CoordinatorCallbackHostPolicy;
}
export interface CodexWorkbenchWorkhorseContext {
	readonly publisher: WorkbenchContextPublisher;
	readonly feedId: string;
	readonly contextForEvent: (event: WorkbenchContextEvent) => WorkbenchExecutionContext;
	readonly matchesHostContext?: (
		event: WorkbenchContextEvent,
		context: WorkbenchExecutionContext,
	) => boolean;
}
export interface CodexWorkbenchHostPolicy {
	readonly instructions: WorkbenchInstructions;
	readonly contextCodec: WorkbenchContextCodec;
	readonly resolveCheckout: (named: string) => string | null;
	readonly coordinatorContextFor: (id: TabSessionId) => WorkbenchContextSource;
	readonly voiceFor: (id: TabSessionId) => WorkbenchVoicePolicy;
	readonly contextForOperation: (
		authority: WorkbenchOperationAuthority,
		operation: PendingOperation,
	) => WorkbenchExecutionContext;
	readonly sessionContextFor: (id: TabSessionId) => CodexWorkbenchSessionContext;
	readonly workhorseContextFor: (
		id: TabSessionId,
		checkout: string,
	) => CodexWorkbenchWorkhorseContext;
	readonly shownCheckoutOf: (browserId: string) => string;
	readonly shownConversationOf: (id: TabSessionId) => string | null;
	readonly onShownChange: (listener: () => void) => () => void;
	readonly repositoryOfCheckout: (checkout: string) => string | null;
	readonly presentation?: WorkbenchVoicePresentationAdapter;
	readonly recording?: (presentation: BrowserVoicePresentation | null) => boolean;
	readonly domainTools?: CodexWorkbenchDomainTools;
	/** Install context and authority readers before browser work is accepted. Retirement removes them. */
	readonly onGeneration?: (scope: CodexWorkbenchDomainScope) => () => void;
	readonly onBrowserGateway?: (scope: {
		readonly gateway: CodexWorkbenchGateway;
		readonly sessions: Pick<CodexWorkbenchSessions, "open" | "end">;
	}) => () => void;
	readonly onFatal: (error: unknown) => void;
}
export type PendingOperation = Omit<Exclude<WorkbenchOperation, { readonly id: null }>, "outcome">;
export interface WorkbenchOperationAuthority {
	readonly tabSessionId: TabSessionId;
	readonly checkout: string;
	readonly clientId: string | null;
	readonly childId: LogicalToolCallCorrelation["child"];
	readonly epoch: LogicalToolCallCorrelation["epoch"];
	readonly threadId: LogicalToolCallCorrelation["threadId"];
	readonly linkRevision?: number;
}
export interface CodexWorkbenchServer {
	readonly host: CodexWorkbenchHostPolicy;
}
export interface CodexWorkbenchStorage {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
	readonly ownerDirectory: string;
	readonly coordinatorDirectory: string;
	readonly epochRoot: string;
	readonly configPath: string;
}
