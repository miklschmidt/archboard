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

/** App policy supplies meaning and admission. Core identity and mutation authority remain separate. */
export interface CodexWorkbenchHostPolicy {
	readonly instructions: WorkbenchInstructions;
	readonly contextCodec: WorkbenchContextCodec;
	readonly resolveCheckout: (named: string) => string | null;
	readonly coordinatorContextFor: (tabSessionId: TabSessionId) => WorkbenchContextSource;
	readonly voiceFor: (tabSessionId: TabSessionId) => WorkbenchVoicePolicy;
	readonly contextForOperation: (
		authority: WorkbenchOperationAuthority,
		operation: PendingOperation,
	) => WorkbenchExecutionContext;
}

/** The operation an effect or command runs under, before its outcome is known. */
type PendingOperation = Omit<Exclude<WorkbenchOperation, { readonly id: null }>, "outcome">;

interface WorkbenchOperationAuthority {
	readonly tabSessionId: TabSessionId;
	readonly checkout: string;
	readonly clientId: string | null;
	readonly childId: LogicalToolCallCorrelation["child"];
	readonly epoch: LogicalToolCallCorrelation["epoch"];
	readonly threadId: LogicalToolCallCorrelation["threadId"];
	readonly linkRevision?: number;
}

/** The small host policy used by the reusable generation graph. */
export interface CodexWorkbenchServer {
	readonly host: CodexWorkbenchHostPolicy;
}

/** Where this installation's Codex storage lives on disk. */
export interface CodexWorkbenchStorage {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
	/** What this server alone owns: its owner lock, its epoch ledger and its coordinators' directory. */
	readonly ownerDirectory: string;
	/**
	 * The directory of its own every coordinator of this server, and the app-server child, work in.
	 * It holds no vault and is in no checkout, so a command run there without `-C` is refused. It
	 * holds the archboard skill under `.agents/skills`, where Codex finds a skill outside git.
	 */
	readonly coordinatorDirectory: string;
	readonly epochRoot: string;
	readonly configPath: string;
}

export type { PendingOperation, WorkbenchOperationAuthority };
