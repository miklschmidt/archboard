import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "../../../shared/codex-browser-model/index.js";
import type { AnswerSdp } from "../../../shared/codex-realtime-host/index.js";

export interface BrowserWorkbenchSocket extends EventTarget {
	readonly readyState: number;
	readonly send: (data: string) => void;
}

export type BrowserGatewayAction =
	| "connect"
	| "snapshot"
	| "claimLease"
	| "renewLease"
	| "releaseLease"
	| "mediaReady"
	| "accountRead"
	| "command"
	| "subscribe"
	| "close";

export interface BrowserWorkbenchSnapshotMessage {
	readonly kind: "snapshot";
	readonly sequence: number;
	readonly snapshot: BrowserSnapshot;
}

export type BrowserWorkbenchSnapshotDelta = Partial<Omit<BrowserSnapshot, "kind" | "version">>;

export interface BrowserWorkbenchDeltaMessage {
	readonly kind: "delta";
	readonly sequence: number;
	readonly delta: BrowserWorkbenchSnapshotDelta;
}

export type BrowserWorkbenchGatewayMessage =
	| BrowserWorkbenchSnapshotMessage
	| BrowserWorkbenchDeltaMessage;

export type BrowserGatewayErrorCode =
	| "disposed"
	| "invalid_input"
	| "invalid_command"
	| "invalid_projection"
	| "not_ready"
	| "thread_capability_required"
	| "link_required"
	| "link_changed"
	| "lease_required"
	| "lease_expired"
	| "lease_released"
	| "lease_transferred"
	| "child_disconnected"
	| "approval_not_pending"
	| "dynamic_approval_not_pending"
	| "unsupported_command"
	| "command_failed"
	| "outcome_unknown";

export interface BrowserWorkbenchCommandResult {
	readonly kind: "command_result";
	readonly commandId: BrowserCommandLease["commandId"] | null;
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
	readonly realtimeAnswer?: AnswerSdp;
	readonly realtimeSessionHandle?: string;
}

export interface BrowserWorkbenchAccountReadResult {
	readonly kind: "account_read";
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
}

export type BrowserCommandName = BrowserCommand["command"];

export type BrowserCommandDraft = {
	[CommandName in BrowserCommandName]: Omit<
		Extract<BrowserCommand, { readonly command: CommandName }>,
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
