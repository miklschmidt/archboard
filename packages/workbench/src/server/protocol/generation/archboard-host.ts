import type {
	CodexWorkbenchHostPolicy,
	PendingOperation,
	WorkbenchOperationAuthority,
	CodexWorkbenchDomainScope,
	BrowserLeaseLedger,
} from "@archboard/codex-realtime-voice/server";
import type { ArchboardContext } from "#runtime/rules/instructions/context.ts";
import type { RealtimePresentationChange } from "#runtime/rules/realtime/presentation-mode.ts";
import type { CoordinatorCallbackCanvas } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CodexProcessGroupIdentity } from "@archboard/process/codex-group";
import type {
	SemanticContextPublisherOptions,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import type { createServerDynamicLifecycleOwner } from "#server/services/generation/operation-lifecycle.ts";

/**
 * Everything the production Codex workbench needs from the Archboard server around it:
 * what it may read (panes, boards, selection, locks), where its canonical
 * context comes from, and how it wires itself into the server's sockets and
 * lifetime. The server provides one of these; the workbench keeps none of it.
 */
export interface ArchboardWorkbenchServer {
	readonly host: CodexWorkbenchHostPolicy;
	/**
	 * The checkout whose source this server runs. The Codex child runs its `bin`, and the
	 * coordinator reads its archboard skill. No thread works in it unless it is that thread's own
	 * checkout (ADR 0050).
	 */
	readonly sourceRoot: string;
	readonly onCodexProcessGroupOwned: (identity: CodexProcessGroupIdentity) => void;
	/**
	 * Where one tab session's voice context is published from: the one change feed, read for that
	 * session's own panes and the workhorse its voice is bound to.
	 */
	readonly semanticPublisherFor: (tabSessionId: TabSessionId) => SemanticContextPublisherOptions;
	/**
	 * Where one workhorse's board news is published from: the changes of the boards of its
	 * checkout that its tab session hears, as that workhorse is told them.
	 */
	readonly workhorsePublisherFor: (
		tabSessionId: TabSessionId,
		checkout: string,
	) => SemanticContextPublisherOptions;
	/**
	 * The checkout whose conversation a browser pane's tab shows, the shown conversation (ADR 0050):
	 * pinned on the first read to the checkout of the tab's focused pane, and changed after that
	 * only by the person's own act in the browser. Every pane of the tab shows that checkout's
	 * workhorse.
	 */
	readonly shownCheckoutOf: (browserId: string) => string;
	/** The checkout whose conversation a tab shows now, or null before any pane of it was read. */
	readonly shownConversationOf: (tabSessionId: TabSessionId) => string | null;
	/** Hear every change of a tab's shown conversation, after which `shownCheckoutOf` names another. */
	readonly onShownChange: (listener: () => void) => () => void;
	/** The repository a checkout is listed under, or null when the navigator lists it nowhere. */
	readonly repositoryOfCheckout: (checkout: string) => string | null;
	/** The canonical context of a settled change, filed under the pane the change presents. */
	readonly contextForEvent: (
		event: SettledSemanticChangeEvent,
		operation?: PendingOperation,
	) => ArchboardContext;
	/**
	 * The context an operation of one workhorse runs under, refused once that workhorse's link has
	 * moved. A browser command names the exact pane that sent it by `clientId`; work nobody's
	 * command started names null, and presents through a pane of the session: the one it presented
	 * through last while that is open, else the focused one, else the first in reading order.
	 */
	readonly contextForOperation: (
		authority: WorkbenchOperationAuthority,
		operation: PendingOperation,
	) => ArchboardContext;
	/**
	 * What a person does by hand to a walkthrough one tab session's voice is narrating (TASK-251):
	 * only that session's own panes are its news.
	 */
	readonly narrationChangesFor: (
		tabSessionId: TabSessionId,
	) => (listener: (change: RealtimePresentationChange) => void) => () => void;
	/**
	 * What a tab session's canvas holds now: the boards its panes show and the one a narration in
	 * them is on (TASK-293).
	 */
	readonly canvasFor: (tabSessionId: TabSessionId) => CoordinatorCallbackCanvas;
	/**
	 * The vault of the pane a tab session presents through, whose boards its voice is told
	 * about, or null while none of its panes is open.
	 */
	readonly presentingVaultFor: (tabSessionId: TabSessionId) => string | null;
	readonly waitForTargets: Parameters<
		typeof createServerDynamicLifecycleOwner
	>[0]["waitForTargets"];
	readonly installLifecycleSignals: (components: CodexWorkbenchDomainScope) => () => void;
	readonly installBrowserGateway: NonNullable<CodexWorkbenchHostPolicy["onBrowserGateway"]>;
	readonly browserLeaseLedger: BrowserLeaseLedger;

	readonly onFatal: (error: unknown) => void;
}
