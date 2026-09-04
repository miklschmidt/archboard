import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayAction,
	BrowserGatewayCommandResult,
	BrowserGatewayDeltaMessage,
	BrowserGatewayErrorCode,
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshotDelta,
} from "../../../shared/codex-browser-gateway/index.js";
import type {
	CodexLoginAccountParams,
	CodexServerResponseByMethod,
} from "../../../shared/codex-app-server-contract/index.js";

export interface BrowserWorkbenchSocket extends EventTarget {
	readonly readyState: number;
	readonly send: (data: string) => void;
}

/**
 * The browser speaks the one authored gateway envelope rather than a local copy
 * of it; the shared module is the only place these shapes are declared.
 */
export type BrowserWorkbenchSnapshotMessage = BrowserGatewaySnapshotMessage;
export type BrowserWorkbenchSnapshotDelta = BrowserSnapshotDelta;
export type BrowserWorkbenchDeltaMessage = BrowserGatewayDeltaMessage;
export type BrowserWorkbenchGatewayMessage = BrowserGatewayMessage;
export type BrowserWorkbenchCommandResult = BrowserGatewayCommandResult;
export type BrowserWorkbenchAccountReadResult = BrowserGatewayAccountReadResult;

export type { BrowserGatewayAction, BrowserGatewayErrorCode };

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

export type BrowserCommandName = BrowserIntentCommand["command"];

export type BrowserCommandDraft = {
	[CommandName in BrowserCommandName]: Omit<
		Extract<BrowserIntentCommand, { readonly command: CommandName }>,
		"kind" | "commandId" | "paneId" | "childId" | "epoch"
	>;
}[BrowserCommandName];

export interface BrowserWorkbenchCommandTarget {
	readonly commandId: BrowserCommandLease["commandId"];
	readonly paneId: BrowserCommandLease["paneId"];
	readonly childId: BrowserCommandLease["childId"];
	readonly epoch: BrowserCommandLease["epoch"];
	readonly capturedThreadLink: BrowserThreadLink;
}

export type BrowserWorkbenchState =
	| {
			readonly kind: "connection";
			readonly state: "stopped";
			readonly connection: "stopped";
			readonly snapshot: null;
			readonly sequence: null;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "reconnecting";
			readonly connection: "reconnecting";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "backoff";
			readonly connection: "reconnecting";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly retryAtMs: number;
			readonly reason: string;
	  }
	| {
			readonly kind: "stream";
			readonly state: "stale_snapshot";
			readonly connection: "connected";
			readonly snapshot: BrowserSnapshot | null;
			readonly sequence: number | null;
			readonly expectedSequence: number;
			readonly receivedSequence: number;
			readonly reason: string;
	  }
	| {
			readonly kind: "connection";
			readonly state: "incompatible_contract";
			readonly connection: "stopped";
			readonly snapshot: null;
			readonly sequence: null;
			readonly reason: string;
	  }
	| {
			readonly kind: "readiness";
			readonly state: BrowserReadiness["state"];
			readonly connection: "connected";
			readonly snapshot: BrowserSnapshot;
			readonly sequence: number;
	  };

export interface BrowserWorkbenchCapabilities {
	readonly connected: boolean;
	readonly readiness: BrowserReadiness["state"] | null;
	readonly canReadAccount: boolean;
	readonly canClaimLease: boolean;
	readonly canRenewLease: boolean;
	readonly canReleaseLease: boolean;
	readonly canCommand: boolean;
	readonly canThreadCommands: boolean;
	readonly canRealtime: boolean;
	readonly supportsCommand: (command: BrowserCommandName) => boolean;
}

export type BrowserWorkbenchTransportErrorCode =
	| BrowserGatewayErrorCode
	| "gateway_error"
	| "socket_unavailable"
	| "response_lost"
	| "replaced"
	| "incompatible_contract";

export class BrowserWorkbenchTransportError extends Error {
	override readonly name = "BrowserWorkbenchTransportError";
	readonly code: BrowserWorkbenchTransportErrorCode;
	readonly outcome: DeliveryOutcome;
	readonly commandId: BrowserCommandLease["commandId"] | null;
	readonly requestId: string | null;
	override readonly cause: unknown;

	constructor(
		code: BrowserWorkbenchTransportErrorCode,
		message: string,
		options: {
			readonly outcome?: DeliveryOutcome;
			readonly commandId?: BrowserCommandLease["commandId"] | null;
			readonly requestId?: string | null;
			readonly cause?: unknown;
		} = {},
	) {
		super(message);
		this.code = code;
		this.outcome = options.outcome ?? "not_delivered";
		this.commandId = options.commandId ?? null;
		this.requestId = options.requestId ?? null;
		this.cause = options.cause;
	}
}

export interface BrowserWorkbenchTransport {
	readonly attach: (socket: BrowserWorkbenchSocket) => Promise<BrowserWorkbenchState>;
	readonly detach: (socket?: BrowserWorkbenchSocket) => Promise<void>;
	readonly close: () => Promise<void>;
	readonly refresh: () => Promise<BrowserWorkbenchSnapshotMessage>;
	readonly setMediaReady: (ready: boolean) => Promise<BrowserWorkbenchSnapshotMessage>;
	readonly claimLease: () => Promise<BrowserCommandLease>;
	readonly renewLease: () => Promise<BrowserCommandLease>;
	readonly releaseLease: () => Promise<BrowserCommandLease | null>;
	readonly accountRead: () => Promise<BrowserWorkbenchAccountReadResult>;
	readonly command: (draft: BrowserCommandDraft) => Promise<BrowserWorkbenchCommandResult>;
	readonly captureCommandTarget: () => BrowserWorkbenchCommandTarget;
	readonly snapshot: () => BrowserSnapshot | null;
	readonly sequence: () => number | null;
	readonly lease: () => BrowserCommandLease | null;
	readonly state: () => BrowserWorkbenchState;
	readonly capabilities: () => BrowserWorkbenchCapabilities;
	readonly subscribe: (listener: () => void) => () => void;
	readonly dispose: () => Promise<void>;
}

export interface BrowserWorkbenchTransportOptions {
	readonly now?: () => number;
	readonly requestId?: () => string;
}
