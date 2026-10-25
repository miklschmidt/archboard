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
/**
 * The policy the core runs a generation under. The agent builds a default for every member; a
 * host's extension replaces that member whole. The default context members share the generation
 * that the default `onGeneration` installs, so a host that replaces `onGeneration` replaces them too.
 */
export interface CodexWorkbenchHostPolicy {
	readonly instructions: WorkbenchInstructions;
	/** How an execution context becomes the bytes a thread reads. Default: canonical JSON. */
	readonly contextCodec: WorkbenchContextCodec;
	readonly resolveCheckout: (named: string) => string | null;
	/** What one tab's coordinator is told about the host page. Default: the `context` option. */
	readonly coordinatorContextFor: (id: TabSessionId) => WorkbenchContextSource;
	/** How one tab's voice is presented and recorded. Default: the `voice` option. */
	readonly voiceFor: (id: TabSessionId) => WorkbenchVoicePolicy;
	/**
	 * The context an operation runs under, captured before it runs. Default: the live workhorse of
	 * the authority's checkout and the host text; throws when that workhorse changed meanwhile.
	 */
	readonly contextForOperation: (
		authority: WorkbenchOperationAuthority,
		operation: PendingOperation,
	) => WorkbenchExecutionContext;
	/**
	 * Where a tab session's host context is published, and how its events become coordinator
	 * callbacks. Default: the host text, delivered as quiet context that starts no speech.
	 */
	readonly sessionContextFor: (id: TabSessionId) => CodexWorkbenchSessionContext;
	/** Where one workhorse's host context is published, and the context each event carries. */
	readonly workhorseContextFor: (
		id: TabSessionId,
		checkout: string,
	) => CodexWorkbenchWorkhorseContext;
	readonly shownCheckoutOf: (browserId: string) => string;
	readonly shownConversationOf: (id: TabSessionId) => string | null;
	readonly onShownChange: (listener: () => void) => () => void;
	/** The repository a checkout belongs to, or null. Default: the checkout's real path. */
	readonly repositoryOfCheckout: (checkout: string) => string | null;
	/** Validates and prepares the voice presentation a browser asks for at realtime start. */
	readonly presentation?: WorkbenchVoicePresentationAdapter;
	/** Whether a presentation is being recorded, which the browser shows. Default: never. */
	readonly recording?: (presentation: BrowserVoicePresentation | null) => boolean;
	/** The host's own Codex dynamic tools, installed on each generation. */
	readonly domainTools?: CodexWorkbenchDomainTools;
	/** Install context and authority readers before browser work is accepted. Retirement removes them. */
	readonly onGeneration?: (scope: CodexWorkbenchDomainScope) => () => void;
	/** Install a host's own browser socket routing on each generation's gateway. */
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
