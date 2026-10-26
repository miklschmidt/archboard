import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { LogicalToolCallCorrelation } from "@archboard/codex-app-server/identity";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
	WorkbenchOperation,
} from "#runtime/protocol/host/context.ts";
import type { WorkbenchInstructions } from "#runtime/protocol/host/instructions.ts";
import type {
	WorkbenchContextSource,
	WorkbenchVoicePolicy,
} from "#runtime/protocol/host/context-source.ts";
import type {
	CodexWorkbenchDomainScope,
	CodexWorkbenchDomainTools,
} from "#server/protocol/generation/domain.ts";
import type { VoiceNarrativeAdapter } from "#server/services/voice/narrative.ts";
import type { CodexWorkbenchGateway } from "#server/protocol/gateway/contract.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";

/**
 * The policy the core runs a generation under. The agent builds a default for every member; a
 * host's extension replaces that member whole. The default `contextForOperation` reads the
 * generation that the default `onGeneration` installs, so a host that replaces `onGeneration`
 * replaces it too.
 */
export interface CodexWorkbenchHostPolicy {
	readonly instructions: WorkbenchInstructions;
	/** How an execution context becomes the bytes a thread reads. Default: canonical JSON. */
	readonly contextCodec: WorkbenchContextCodec;
	readonly resolveCheckout: (named: string) => string | null;
	/** What one tab's coordinator is told about the host page. Default: the `context` option. */
	readonly coordinatorContextFor: (id: TabSessionId) => WorkbenchContextSource;
	/** How one tab's voice starts. Default: the `voice` option. */
	readonly voiceFor: (id: TabSessionId) => WorkbenchVoicePolicy;
	/**
	 * The context an operation runs under, captured before it runs. Default: the live workhorse of
	 * the authority's checkout and the host text; throws when that workhorse changed meanwhile.
	 */
	readonly contextForOperation: (
		authority: WorkbenchOperationAuthority,
		operation: PendingOperation,
	) => WorkbenchExecutionContext;
	readonly shownCheckoutOf: (browserId: string) => string;
	readonly shownConversationOf: (id: TabSessionId) => string | null;
	readonly onShownChange: (listener: () => void) => () => void;
	/** The name the workhorse list shows for a checkout. Default: the checkout directory's name. */
	readonly checkoutLabel: (checkout: string) => string;
	/** Checks, prepares, opens and forgets the narrative a browser starts voice to present. */
	readonly narrative?: VoiceNarrativeAdapter;
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
