import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime";
import type { CoordinatorCallbackCanvas } from "@/runtime/codex-coordinator-callbacks";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
import type {
	SemanticContextPublisherOptions,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type { BrowserLeaseLedger, TabSessionId } from "@/server/codex-workbench";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
} from "@/server/archboard/lib/codex-workbench";
import type { createServerDynamicLifecycleOwner } from "@/server/archboard/lib/codex-workbench-operation-lifecycle";

/** The operation an effect or command runs under, before its outcome is known. */
type PendingOperation = Omit<
	Extract<ArchboardContext["operation"], { readonly id: string; readonly outcome: null }>,
	"outcome"
>;

/**
 * Everything the production Codex workbench needs from the Archboard server around it:
 * what it may read (panes, boards, selection, locks), where its canonical
 * context comes from, and how it wires itself into the server's sockets and
 * lifetime. The server provides one of these; the workbench keeps none of it.
 */
export interface CodexWorkbenchServer {
	readonly checkoutRoot: string;
	readonly onCodexProcessGroupOwned: (identity: CodexProcessGroupIdentity) => void;
	/**
	 * Where one tab session's semantic context is published from: the one change feed, read for
	 * that session's own panes and link.
	 */
	readonly semanticPublisherFor: (tabSessionId: TabSessionId) => SemanticContextPublisherOptions;
	/** The canonical context of a settled change, filed under the pane the change presents. */
	readonly contextForEvent: (
		event: SettledSemanticChangeEvent,
		operation?: PendingOperation,
	) => ArchboardContext;
	/**
	 * The context an operation of one tab session runs under, refused once that session's link has
	 * moved. A browser command names the exact pane that sent it by `clientId`; work nobody's
	 * command started names null, and presents through a pane of the session: the one it presented
	 * through last while that is open, else the focused one, else the first in reading order.
	 */
	readonly contextForOperation: (
		authority: {
			readonly tabSessionId: TabSessionId;
			readonly clientId: string | null;
			readonly childId: LogicalToolCallCorrelation["child"];
			readonly epoch: LogicalToolCallCorrelation["epoch"];
			readonly threadId: LogicalToolCallCorrelation["threadId"];
			readonly linkRevision?: number;
		},
		operation: PendingOperation,
	) => ArchboardContext;
	/**
	 * What a person does by hand to a walkthrough one tab session's voice is narrating (TASK-251):
	 * only that session's own panes are its news.
	 */
	readonly narrationChangesFor: (
		tabSessionId: TabSessionId,
	) => NonNullable<CodexRealtimeAdapterOptions["presentationChanges"]>["subscribe"];
	/**
	 * What a tab session's canvas holds now: the boards its panes show and the one a narration in
	 * them is on (TASK-293).
	 */
	readonly canvasFor: (tabSessionId: TabSessionId) => CoordinatorCallbackCanvas;
	readonly waitForTargets: Parameters<
		typeof createServerDynamicLifecycleOwner
	>[0]["waitForTargets"];
	readonly installIdentityDecoders: (identity: CodexWorkbenchComponents["identity"]) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installBrowserGateway: (
		components: Pick<CodexWorkbenchComponents, "gateway" | "sessions">,
	) => () => void;
	readonly browserLeaseLedger: BrowserLeaseLedger;
	readonly stopBrowser: CodexWorkbenchGenerationHooks["stopBrowser"];
	readonly onFatal: (error: unknown) => void;
}

/** Where this installation's Codex storage lives on disk. */
export interface CodexWorkbenchStorage {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
	/** What this server alone owns: its owner lock and its epoch ledger. */
	readonly ownerDirectory: string;
	readonly epochRoot: string;
	readonly configPath: string;
}

export type { PendingOperation };
