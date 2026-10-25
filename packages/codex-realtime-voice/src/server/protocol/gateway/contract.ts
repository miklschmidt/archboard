import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "#shared/schemas/browser/snapshot.ts";
import type { BrowserDynamicApprovalResponse } from "#shared/schemas/dynamic-approval/approval.ts";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	JsonRpcRequestId,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "#runtime/rules/thread-link/contract.ts";
import type { AnswerSdp } from "#shared/protocol/realtime-contract.ts";
import type { ApprovalOwnerView, ApprovalResponse } from "#runtime/services/approvals/contract.ts";
import type { SupportedLoginAccountParams } from "@archboard/codex-app-server/session";
import type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayCommandResult,
	BrowserGatewayDeltaMessage,
	BrowserGatewayErrorCode,
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshotDelta,
} from "#shared/protocol/gateway-envelope.ts";
import type { BrowserOwnerProjection } from "#server/protocol/projection/projection-contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

export type BrowserConnectionId = string;
/** Exact process-local WebSocket ownership. Reusable browser ids never substitute for it. */
export type BrowserConnectionInstance = object;
export type BrowserUnsubscribe = () => void;

export interface BrowserLeaseRecord {
	readonly lease: BrowserCommandLease;
	readonly binding: BrowserLeaseBinding;
	readonly capturedLink: ThreadLinkBindingSnapshot;
}

/** One tab session's lease: the active record and the bounded history of ended ones. */
export interface BrowserSessionLeaseLedger {
	active: BrowserLeaseRecord | null;
	readonly retired: Map<BrowserCommandId, BrowserLeaseRecord>;
}

/**
 * Process-lifetime lease authority retained while a source generation is replaced: one lease
 * per browser tab session, so two tabs never take the lease from each other.
 */
export interface BrowserLeaseLedger {
	readonly sessions: Map<TabSessionId, BrowserSessionLeaseLedger>;
}

export type BrowserApprovalCommand = Omit<
	Extract<BrowserCommand, { readonly command: "approvalRespond" }>,
	"response"
> & { readonly response: ApprovalResponse };
export type BrowserAccountLoginCommand = Omit<
	Extract<BrowserCommand, { readonly command: "accountLogin" }>,
	"login"
> & { readonly login: SupportedLoginAccountParams };
export type BrowserAccountLoginCancelCommand = Extract<
	BrowserCommand,
	{ readonly command: "accountLoginCancel" }
>;
export type BrowserAccountLogoutCommand = Extract<
	BrowserCommand,
	{ readonly command: "accountLogout" }
>;
export type BrowserThreadLinkCreateCommand = Extract<
	BrowserCommand,
	{ readonly command: "threadLinkCreate" }
>;
export type BrowserTextStartCommand = Extract<BrowserCommand, { readonly command: "start" }>;
export type BrowserTextSteerCommand = Extract<BrowserCommand, { readonly command: "steer" }>;
export type BrowserTextInterruptCommand = Extract<
	BrowserCommand,
	{ readonly command: "interrupt" }
>;
export type BrowserQueueAddCommand = Extract<BrowserCommand, { readonly command: "queueAdd" }>;
export type BrowserQueueUpdateCommand = Extract<
	BrowserCommand,
	{ readonly command: "queueUpdate" }
>;
export type BrowserQueueDeleteCommand = Extract<
	BrowserCommand,
	{ readonly command: "queueDelete" }
>;
export type BrowserQueueReorderCommand = Extract<
	BrowserCommand,
	{ readonly command: "queueReorder" }
>;
export type BrowserQueueStartCommand = Extract<BrowserCommand, { readonly command: "queueStart" }>;
export type BrowserRealtimeStartCommand = Extract<
	BrowserCommand,
	{ readonly command: "realtimeStart" }
>;
export type BrowserRealtimeAppendTextCommand = Extract<
	BrowserCommand,
	{ readonly command: "realtimeAppendText" }
>;
export type BrowserRealtimeStopCommand = Extract<
	BrowserCommand,
	{ readonly command: "realtimeStop" }
>;

export interface BrowserLeaseBinding {
	readonly browserId: BrowserConnectionId;
	readonly connection: BrowserConnectionInstance;
	readonly chatId: string;
	/** The tab the socket belongs to, which every chat of that tab shares. */
	readonly tabSessionId: TabSessionId;
	/** The checkout the chat's tab shows, whose workhorse the command is for. */
	readonly checkout: string;
	readonly commandId: BrowserCommandId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly link: ThreadLinkSnapshot;
	readonly linkRevision: number;
}

export interface BrowserProjectionContext {
	readonly browserId: BrowserConnectionId;
	readonly chatId: string;
	readonly tabSessionId: TabSessionId;
	/** The checkout the chat's tab shows now, whose workhorse the chat shows. */
	readonly checkout: string;
	/** Exact process-local socket identity; never serialized to the browser. */
	readonly connection: BrowserConnectionInstance;
	readonly binding: ThreadLinkBindingSnapshot;
	readonly lease: BrowserCommandLease | null;
	/** The exact socket has installed a usable browser-local media owner. */
	readonly mediaReady: boolean;
}

export interface BrowserProjectionDisconnectContext {
	readonly browserId: BrowserConnectionId;
	readonly chatId: string;
	/** Exact process-local socket identity; reusable browser ids are insufficient. */
	readonly connection: BrowserConnectionInstance;
}

/**
 * A projection is read from the owners that already hold Codex state. The
 * gateway does not retain any of these values as a second domain store.
 */
export interface BrowserProjectionPort {
	readonly read: (context: BrowserProjectionContext) => BrowserOwnerProjection;
	/**
	 * Re-read owner state a snapshot request must not serve from a cache.
	 *
	 * `read` is synchronous because a projection is assembled from owners that
	 * already hold their state. Some of that state is a cache the server filled
	 * from its own command results — the workhorse queue is one — and a browser
	 * asking for a snapshot is asking for state it can trust. The gateway awaits
	 * this before serving a snapshot request so `refresh()` genuinely re-reads.
	 */
	readonly refresh?: (context: BrowserProjectionContext) => Promise<void>;
	/** One owner notification source may fan out all projection changes. */
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
	/** Retire projection state at the gateway's authoritative connection seam. */
	readonly onBrowserDisconnect?: (
		context: BrowserProjectionDisconnectContext,
		reason: BrowserDisconnectReason,
	) => void;
}

export interface BrowserActionContext extends BrowserLeaseBinding {}

export type BrowserDisconnectReason =
	| "browser_disconnected"
	| "child_disconnected"
	| "gateway_shutdown";

/**
 * Browser-only server settlement. Typed Codex request and result values end at
 * their session owner; the gateway never mirrors them into a second result.
 */
export type BrowserActionResult = void | {
	readonly outcome: DeliveryOutcome;
	readonly message?: string;
	readonly turnId?: TurnId;
	/** The browser applies this answer to its local peer and owns remote media attachment. */
	readonly realtimeAnswer?: AnswerSdp;
	/** Stable opaque handle returned by start and echoed by append/stop. */
	readonly realtimeSessionHandle?: string;
};

export interface BrowserAccountActions {
	readonly read: (input: {
		readonly browserId: BrowserConnectionId;
		readonly chatId: string;
		readonly tabSessionId: TabSessionId;
		readonly checkout: string;
	}) => Promise<BrowserActionResult>;
	readonly login: (
		command: BrowserAccountLoginCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly loginCancel: (
		command: BrowserAccountLoginCancelCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly logout: (
		command: BrowserAccountLogoutCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
}

export interface BrowserThreadLinkActions {
	readonly create: (
		command: BrowserThreadLinkCreateCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
}

export interface BrowserTextActions {
	readonly start: (
		command: BrowserTextStartCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly steer: (
		command: BrowserTextSteerCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly interrupt: (
		command: BrowserTextInterruptCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
}

export interface BrowserQueueActions {
	readonly add: (
		command: BrowserQueueAddCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly update: (
		command: BrowserQueueUpdateCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly delete: (
		command: BrowserQueueDeleteCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly reorder: (
		command: BrowserQueueReorderCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly start: (
		command: BrowserQueueStartCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
}

export interface BrowserRealtimeActions {
	readonly start: (
		command: BrowserRealtimeStartCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly appendText: (
		command: BrowserRealtimeAppendTextCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly stop: (
		command: BrowserRealtimeStopCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly onBrowserDisconnect?: (
		context: BrowserActionContext,
		reason: BrowserDisconnectReason,
	) => Promise<void> | void;
}

/** A settled approval no browser has been shown yet, and the chats it is shown to. */
export interface BrowserUnpresentedTerminal {
	readonly requestId: JsonRpcRequestId;
	readonly tabSessionId: TabSessionId | null;
	/**
	 * The checkout whose chats of that tab session are shown it, as a workhorse's approval is,
	 * or null when every chat of the tab session is.
	 */
	readonly checkout: string | null;
}

export interface BrowserOrdinaryApprovalActions {
	readonly pending: (requestId: JsonRpcRequestId) => ApprovalOwnerView | null;
	readonly resolve: (
		command: BrowserApprovalCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly acknowledge: (requestId: JsonRpcRequestId) => void;
	/**
	 * Spontaneous terminals no browser has been shown yet, each with the tab session it is
	 * presented to, or null when no tab session holds its thread.
	 */
	readonly unpresentedTerminals: () => readonly BrowserUnpresentedTerminal[];
	/**
	 * Retires spontaneous terminals only after every live browser of their tab session received the
	 * published snapshot.
	 */
	readonly acknowledgePublished: (requestIds: readonly JsonRpcRequestId[]) => void;
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
}

export interface BrowserDynamicApprovalActions {
	readonly resolve: (
		command: BrowserDynamicApprovalResponse,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
}

export interface BrowserWorkbenchActions {
	readonly account: BrowserAccountActions;
	readonly threadLinks: BrowserThreadLinkActions;
	readonly text: BrowserTextActions;
	readonly queue: BrowserQueueActions;
	readonly realtime: BrowserRealtimeActions;
	readonly ordinaryApprovals: BrowserOrdinaryApprovalActions;
	readonly dynamicApprovals: BrowserDynamicApprovalActions;
}

export interface BrowserLifecyclePort {
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
	/** The child-exit source must await this promise before closing its transport. */
	readonly onChildExit?: (
		listener: (childId: ChildId, epoch: ChildEpoch) => Promise<void>,
	) => BrowserUnsubscribe;
}

export interface CodexWorkbenchGatewayOptions {
	/** The same authorities used by the session and dynamic dispatcher. */
	readonly identity: IdentityAuthorities;
	readonly projection: BrowserProjectionPort;
	readonly threadLink: Pick<CodexThreadLinkPort, "read">;
	/**
	 * The checkout whose conversation a chat's tab shows now. The person can
	 * activate another one at any time, so it is asked each time, never kept.
	 */
	readonly checkoutOf: (browserId: BrowserConnectionId) => string;
	readonly actions: BrowserWorkbenchActions;
	readonly lifecycle?: BrowserLifecyclePort;
	readonly leaseLedger?: BrowserLeaseLedger;
	/** Complete encoded snapshot bound, shared with projection producers that retain bounded data. */
	readonly snapshotMaxBytes?: number;
	readonly now?: () => number;
}

export class CodexWorkbenchGatewayError extends Error {
	override readonly name = "CodexWorkbenchGatewayError";
	readonly code: BrowserGatewayErrorCode;
	readonly outcome: DeliveryOutcome;
	readonly commandId: BrowserCommandId | null;
	override readonly cause: unknown;

	/**
	 * Name a browser gateway failure, carrying what the caller needs to decide
	 * what became of the command it was delivering.
	 * @param code Which failure this is.
	 * @param message What happened.
	 * @param options What is known about the command it happened to.
	 * @param options.outcome What became of the command.
	 * @param options.commandId The command, when the failure names one.
	 * @param options.cause The failure underneath, when there is one.
	 */
	constructor(
		code: BrowserGatewayErrorCode,
		message: string,
		options: {
			readonly outcome?: DeliveryOutcome;
			readonly commandId?: BrowserCommandId | null;
			readonly cause?: unknown;
		} = {},
	) {
		super(message);
		this.code = code;
		this.outcome = options.outcome ?? "not_delivered";
		this.commandId = options.commandId ?? null;
		this.cause = options.cause;
	}
}

/** The exact browser payload whose transport send completed successfully. */
export type BrowserPublishedPayload = BrowserGatewayMessage | BrowserSnapshot;

export interface BrowserWorkbenchConnection {
	readonly browserId: BrowserConnectionId;
	readonly chatId: string;
	readonly tabSessionId: TabSessionId;
	readonly instance: BrowserConnectionInstance;
	readonly snapshot: () => BrowserGatewaySnapshotMessage;
	/** Re-read cached owner state, so the next `snapshot()` is a genuine read. */
	readonly refreshProjection: () => Promise<void>;
	/** Confirm this exact event or snapshot result only after its transport send succeeds. */
	readonly confirmPublished: (payload: BrowserPublishedPayload) => void;
	readonly claimLease: () => BrowserCommandLease;
	readonly renewLease: () => BrowserCommandLease;
	readonly releaseLease: () => BrowserCommandLease | null;
	readonly setMediaReady: (ready: boolean) => BrowserGatewaySnapshotMessage;
	readonly accountRead: () => Promise<BrowserGatewayAccountReadResult>;
	readonly command: (command: unknown) => Promise<BrowserGatewayCommandResult>;
	readonly subscribe: (listener: (message: BrowserGatewayMessage) => void) => BrowserUnsubscribe;
	readonly close: () => Promise<void>;
}

export interface CodexWorkbenchGateway {
	readonly connect: (
		browserId: BrowserConnectionId,
		chatId: string,
		tabSessionId: TabSessionId,
		instance?: BrowserConnectionInstance,
	) => BrowserWorkbenchConnection;
	readonly snapshot: (
		browserId: BrowserConnectionId,
		chatId: string,
	) => BrowserGatewaySnapshotMessage;
	readonly claimLease: (browserId: BrowserConnectionId, chatId: string) => BrowserCommandLease;
	readonly renewLease: (
		browserId: BrowserConnectionId,
		lease: Pick<BrowserCommandLease, "commandId" | "chatId" | "childId" | "epoch">,
	) => BrowserCommandLease;
	readonly releaseLease: (
		browserId: BrowserConnectionId,
		chatId: string,
		commandId?: BrowserCommandId,
	) => BrowserCommandLease | null;
	readonly accountRead: (
		browserId: BrowserConnectionId,
		chatId: string,
	) => Promise<BrowserGatewayAccountReadResult>;
	readonly command: (
		browserId: BrowserConnectionId,
		command: unknown,
	) => Promise<BrowserGatewayCommandResult>;
	readonly subscribe: (
		browserId: BrowserConnectionId,
		chatId: string,
		listener: (message: BrowserGatewayMessage) => void,
	) => BrowserUnsubscribe;
	readonly closeConnection: (
		browserId: BrowserConnectionId,
		chatId: string,
		instance: BrowserConnectionInstance,
	) => Promise<void>;
	readonly childExit: (childId: ChildId, epoch: ChildEpoch) => Promise<void>;
	/** Forget a tab session that ended: its lease and everything kept about it. */
	readonly endSession: (tabSessionId: TabSessionId) => void;
	readonly dispose: () => Promise<void>;
}

export type { BrowserCommandLease, BrowserSnapshot, BrowserThreadLink, ThreadLinkBindingSnapshot };

/**
 * The gateway envelope is authored once in `shared` so the browser transport
 * can import the same declarations; server callers keep importing it from here.
 */
export type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayCommandResult,
	BrowserGatewayDeltaMessage,
	BrowserGatewayErrorCode,
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshotDelta,
};
