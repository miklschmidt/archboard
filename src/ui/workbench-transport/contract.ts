// The browser workbench transport's typed surface: the socket it rides, the
// one state it publishes, the capabilities it answers, the command drafts it
// accepts, and the refusal it throws. The wire shapes are the shared gateway
// envelope, never a local copy of it.

import type {
	CodexServerResponseByMethod,
	CodexLoginAccountParams,
} from "@/shared/codex-app-server-contract";
import type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayAction,
	BrowserGatewayCommandResult,
	BrowserGatewayDeltaMessage,
	BrowserGatewayErrorCode,
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshotDelta,
} from "@/shared/codex-browser-gateway";
import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";

/**
 * The pane's socket to the canvas server, as the transport sees it. It is
 * shaped exactly like the canvas module's `PaneSocket` so the canvas can hand
 * its socket over without an adapter; the canvas remains the only owner that
 * opens or closes it.
 */
interface BrowserWorkbenchSocket extends EventTarget {
	readonly readyState: number;
	readonly send: (data: string) => void;
}

type BrowserWorkbenchSnapshotMessage = BrowserGatewaySnapshotMessage;
type BrowserWorkbenchSnapshotDelta = BrowserSnapshotDelta;
type BrowserWorkbenchDeltaMessage = BrowserGatewayDeltaMessage;
type BrowserWorkbenchGatewayMessage = BrowserGatewayMessage;
type BrowserWorkbenchCommandResult = BrowserGatewayCommandResult;
type BrowserWorkbenchAccountReadResult = BrowserGatewayAccountReadResult;

type SupportedLoginVariant = "apiKey" | "chatgpt" | "amazonBedrock" | "amazonBedrockAccessKeys";
type BrowserLoginParams = Extract<
	CodexLoginAccountParams,
	{ readonly type: SupportedLoginVariant }
>;
type BrowserApprovalKind = BrowserSnapshot["approvals"][number]["approvalKind"];
type BrowserApprovalResponseFor<
	Kind extends BrowserApprovalKind,
	Method extends keyof CodexServerResponseByMethod,
> = Readonly<{ approvalKind: Kind }> & CodexServerResponseByMethod[Method];

/** The answer to an ordinary approval, spelled by the app-server method it settles. */
type BrowserApprovalResponse =
	| BrowserApprovalResponseFor<"command_execution", "item/commandExecution/requestApproval">
	| BrowserApprovalResponseFor<"file_change", "item/fileChange/requestApproval">
	| BrowserApprovalResponseFor<"user_input", "item/tool/requestUserInput">
	| BrowserApprovalResponseFor<"elicitation", "mcpServer/elicitation/request">
	| BrowserApprovalResponseFor<"permissions", "item/permissions/requestApproval">
	| BrowserApprovalResponseFor<"apply_patch", "applyPatchApproval">
	| BrowserApprovalResponseFor<"exec_command", "execCommandApproval">;

type BrowserIntentCommand =
	| Exclude<BrowserCommand, { readonly command: "accountLogin" | "approvalRespond" }>
	| (Omit<Extract<BrowserCommand, { readonly command: "accountLogin" }>, "login"> & {
			readonly login: BrowserLoginParams;
	  })
	| (Omit<Extract<BrowserCommand, { readonly command: "approvalRespond" }>, "response"> & {
			readonly response: BrowserApprovalResponse;
	  });

type BrowserCommandName = BrowserIntentCommand["command"];

/** A command as a caller composes it: the wire command without its authority fields. */
type BrowserCommandDraft = {
	[CommandName in BrowserCommandName]: Omit<
		Extract<BrowserIntentCommand, { readonly command: CommandName }>,
		"kind" | "commandId" | "paneId" | "childId" | "epoch"
	>;
}[BrowserCommandName];

/** The authority fields every wire command carries, taken from the active lease. */
type BrowserCommandAuthority = Pick<
	BrowserCommandLease,
	"commandId" | "paneId" | "childId" | "epoch"
>;

/** The lease identity plus the thread link the command was composed against. */
interface BrowserWorkbenchCommandTarget extends BrowserCommandAuthority {
	readonly capturedThreadLink: BrowserThreadLink;
}

/**
 * A displayed action's link, captured without acquiring command authority.
 * Capture and execute through the same transport; copied or invented intents
 * are refused because they cannot prove the socket generation they came from.
 */
interface BrowserWorkbenchCommandIntent {
	readonly capturedThreadLink: BrowserThreadLink;
	/** Exact authority, when present, is retained only for request-bound decisions. */
	readonly authority: BrowserWorkbenchCommandTarget | null;
}

/** The transport while no socket, or no usable socket, is attached. */
interface BrowserWorkbenchStoppedState {
	readonly kind: "connection";
	readonly state: "stopped";
	readonly connection: "stopped";
	readonly snapshot: null;
	readonly sequence: null;
	readonly reason: string;
}

/** The transport between attach and the subscribe baseline. */
interface BrowserWorkbenchReconnectingState {
	readonly kind: "connection";
	readonly state: "reconnecting";
	readonly connection: "reconnecting";
	readonly snapshot: BrowserSnapshot | null;
	readonly sequence: number | null;
	readonly reason: string;
}

/** The transport after its socket closed, waiting for the canvas to reattach. */
interface BrowserWorkbenchBackoffState {
	readonly kind: "connection";
	readonly state: "backoff";
	readonly connection: "reconnecting";
	readonly snapshot: BrowserSnapshot | null;
	readonly sequence: number | null;
	readonly retryAtMs: number;
	readonly reason: string;
}

/** The stream skipped or contradicted itself; a recovery snapshot is on its way. */
interface BrowserWorkbenchStaleState {
	readonly kind: "stream";
	readonly state: "stale_snapshot";
	readonly connection: "connected";
	readonly snapshot: BrowserSnapshot | null;
	readonly sequence: number | null;
	readonly expectedSequence: number;
	readonly receivedSequence: number;
	readonly reason: string;
}

/** The host spoke a contract this browser cannot read; nothing recovers it. */
interface BrowserWorkbenchIncompatibleState {
	readonly kind: "connection";
	readonly state: "incompatible_contract";
	readonly connection: "stopped";
	readonly snapshot: null;
	readonly sequence: null;
	readonly reason: string;
}

/** A published snapshot, named by the host's readiness. */
interface BrowserWorkbenchReadinessState {
	readonly kind: "readiness";
	readonly state: BrowserReadiness["state"];
	readonly connection: "connected";
	readonly snapshot: BrowserSnapshot;
	readonly sequence: number;
}

/** The one state the transport publishes. */
type BrowserWorkbenchState =
	| BrowserWorkbenchStoppedState
	| BrowserWorkbenchReconnectingState
	| BrowserWorkbenchBackoffState
	| BrowserWorkbenchStaleState
	| BrowserWorkbenchIncompatibleState
	| BrowserWorkbenchReadinessState;

/** What the workbench may ask for right now. */
interface BrowserWorkbenchCapabilities {
	readonly connected: boolean;
	readonly readiness: BrowserReadiness["state"] | null;
	readonly canReadAccount: boolean;
	readonly canClaimLease: boolean;
	readonly canRenewLease: boolean;
	readonly canReleaseLease: boolean;
	/** The linked workbench can accept a human action and acquire its authority. */
	readonly canCommand: boolean;
	readonly canThreadCommands: boolean;
	readonly canRealtime: boolean;
	/** Human actions include authority acquisition; realtime start and dynamic responses require an exact lease. */
	readonly supportsCommand: (command: BrowserCommandName) => boolean;
}

/** Every refusal the transport can throw: the gateway's codes and its own. */
type BrowserWorkbenchTransportErrorCode =
	| BrowserGatewayErrorCode
	| "gateway_error"
	| "socket_unavailable"
	| "response_lost"
	| "replaced"
	| "incompatible_contract";

/** How a refusal is qualified. */
interface BrowserWorkbenchTransportErrorOptions {
	readonly outcome?: DeliveryOutcome;
	readonly commandId?: BrowserCommandLease["commandId"] | null;
	readonly requestId?: string | null;
	readonly cause?: unknown;
}

/** A refusal or loss on the workbench wire, with the delivery outcome it implies. */
class BrowserWorkbenchTransportError extends Error {
	override readonly name = "BrowserWorkbenchTransportError";
	readonly code: BrowserWorkbenchTransportErrorCode;
	readonly outcome: DeliveryOutcome;
	readonly commandId: BrowserCommandLease["commandId"] | null;
	readonly requestId: string | null;
	override readonly cause: unknown;

	/**
	 * Build the refusal.
	 * @param code What was refused or lost.
	 * @param message Plain words for it.
	 * @param options The outcome, the command it concerns, the request id and the cause.
	 */
	constructor(
		code: BrowserWorkbenchTransportErrorCode,
		message: string,
		options: BrowserWorkbenchTransportErrorOptions = {},
	) {
		super(message);
		this.code = code;
		this.outcome = options.outcome ?? "not_delivered";
		this.commandId = options.commandId ?? null;
		this.requestId = options.requestId ?? null;
		this.cause = options.cause;
	}
}

/** One transport over one pane socket at a time. */
interface BrowserWorkbenchTransport {
	readonly attach: (socket: BrowserWorkbenchSocket) => Promise<BrowserWorkbenchState>;
	readonly detach: (socket?: BrowserWorkbenchSocket) => Promise<void>;
	readonly close: () => Promise<void>;
	readonly refresh: () => Promise<BrowserWorkbenchSnapshotMessage>;
	readonly setMediaReady: (ready: boolean) => Promise<BrowserWorkbenchSnapshotMessage>;
	readonly claimLease: () => Promise<BrowserCommandLease>;
	readonly renewLease: () => Promise<BrowserCommandLease>;
	readonly releaseLease: () => Promise<BrowserCommandLease | null>;
	readonly accountRead: () => Promise<BrowserWorkbenchAccountReadResult>;
	/**
	 * Pass the target captured when the action was offered — the approval that
	 * was rendered, the queue row that was dragged — and the command is refused
	 * rather than retargeted if the workbench has moved since. `queueAdd`
	 * requires one: it names neither a thread nor a submission.
	 */
	readonly command: (
		draft: BrowserCommandDraft,
		target?: BrowserWorkbenchCommandTarget,
	) => Promise<BrowserWorkbenchCommandResult>;
	/** Human actions acquire fresh authority once, revalidate their intent, then dispatch once. */
	readonly executeCommand: (
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	) => Promise<BrowserWorkbenchCommandResult>;
	readonly captureCommandIntent: () => BrowserWorkbenchCommandIntent;
	readonly captureCommandTarget: () => BrowserWorkbenchCommandTarget;
	readonly snapshot: () => BrowserSnapshot | null;
	readonly sequence: () => number | null;
	readonly lease: () => BrowserCommandLease | null;
	readonly state: () => BrowserWorkbenchState;
	readonly capabilities: () => BrowserWorkbenchCapabilities;
	readonly subscribe: (listener: () => void) => () => void;
	readonly dispose: () => Promise<void>;
}

/** Clock and request-id sources, overridable by tests. */
interface BrowserWorkbenchTransportOptions {
	readonly now?: () => number;
	readonly requestId?: () => string;
}

export {
	BrowserWorkbenchTransportError,
	type BrowserApprovalResponse,
	type BrowserCommandAuthority,
	type BrowserCommandDraft,
	type BrowserCommandName,
	type BrowserGatewayAction,
	type BrowserGatewayErrorCode,
	type BrowserWorkbenchAccountReadResult,
	type BrowserWorkbenchBackoffState,
	type BrowserWorkbenchCapabilities,
	type BrowserWorkbenchCommandIntent,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchCommandTarget,
	type BrowserWorkbenchDeltaMessage,
	type BrowserWorkbenchGatewayMessage,
	type BrowserWorkbenchIncompatibleState,
	type BrowserWorkbenchReadinessState,
	type BrowserWorkbenchReconnectingState,
	type BrowserWorkbenchSnapshotDelta,
	type BrowserWorkbenchSnapshotMessage,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchStaleState,
	type BrowserWorkbenchState,
	type BrowserWorkbenchStoppedState,
	type BrowserWorkbenchTransport,
	type BrowserWorkbenchTransportErrorCode,
	type BrowserWorkbenchTransportErrorOptions,
	type BrowserWorkbenchTransportOptions,
};
