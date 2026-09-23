import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
import type {
	SemanticContextPublisherOptions,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type { BrowserLeaseLedger } from "@/server/codex-workbench";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
} from "@/server/archboard/lib/codex-workbench";
import type { createCanvasDynamicLifecycleOwner } from "@/server/archboard/lib/codex-workbench-operation-lifecycle";

/** The operation an effect or command runs under, before its outcome is known. */
type PendingOperation = Omit<
	Extract<ArchboardContext["operation"], { readonly id: string; readonly outcome: null }>,
	"outcome"
>;

/**
 * Everything the production Codex workbench needs from the canvas around it:
 * what it may read (panes, boards, selection, locks), where its canonical
 * context comes from, and how it wires itself into the canvas's sockets and
 * lifetime. The canvas provides one of these; the workbench keeps none of it.
 */
export interface CanvasCodexWorkbenchHost {
	readonly checkoutRoot: string;
	readonly onCodexProcessGroupOwned: (identity: CodexProcessGroupIdentity) => void;
	readonly semanticPublisher: SemanticContextPublisherOptions;
	readonly paneIds: () => readonly string[];
	/**
	 * The open pane work nobody's command started presents through: the named
	 * pane while it is open, else the focused one, else the first in reading
	 * order. Throws only when no pane is open.
	 */
	readonly presentingPaneId: (preferredPaneId: string | null) => string;
	readonly contextForEvent: (
		event: SettledSemanticChangeEvent,
		paneId: string,
		operation?: PendingOperation,
	) => ArchboardContext;
	readonly contextForOperation: (
		authority: {
			readonly paneId: string;
			readonly childId: LogicalToolCallCorrelation["child"];
			readonly epoch: LogicalToolCallCorrelation["epoch"];
			readonly threadId: LogicalToolCallCorrelation["threadId"];
			readonly linkRevision?: number;
		},
		operation: PendingOperation,
	) => ArchboardContext;
	/** What a person does by hand to a walkthrough that is being narrated (TASK-251). */
	readonly narrationChanges: NonNullable<
		CodexRealtimeAdapterOptions["presentationChanges"]
	>["subscribe"];
	readonly waitForTargets: Parameters<
		typeof createCanvasDynamicLifecycleOwner
	>[0]["waitForTargets"];
	readonly installIdentityDecoders: (identity: CodexWorkbenchComponents["identity"]) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installBrowserGateway: (gateway: CodexWorkbenchComponents["gateway"]) => () => void;
	readonly browserLeaseLedger: BrowserLeaseLedger;
	readonly stopBrowser: CodexWorkbenchGenerationHooks["stopBrowser"];
	readonly stopRealtime: (realtime: CodexWorkbenchComponents["realtime"]) => Promise<void>;
	readonly stopQueue: (queue: CodexWorkbenchComponents["queue"]) => Promise<void> | void;
	readonly onFatal: (error: unknown) => void;
}

/** Where this installation's Codex storage lives on disk. */
export interface CodexWorkbenchStorage {
	readonly root: string;
	readonly codexHome: string;
	readonly sqliteHome: string;
	/** What this canvas alone owns: its owner lock and its epoch ledger. */
	readonly ownerDirectory: string;
	readonly epochRoot: string;
	readonly configPath: string;
}

export type { PendingOperation };
