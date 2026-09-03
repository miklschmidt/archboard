import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserDynamicApproval,
	BrowserDynamicApprovalResponse,
	BrowserSnapshot,
	BrowserThreadLink,
	DeliveryOutcome,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	JsonRpcRequestId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "../../../runtime/codex-thread-link/index.js";
import type { AnswerSdp } from "../../../shared/codex-realtime-host/index.js";
import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import type { BrowserOwnerProjection } from "./projection-contract.js";

export type BrowserConnectionId = string;
/** Exact process-local WebSocket ownership. Reusable browser ids never substitute for it. */
export type BrowserConnectionInstance = object;
export type BrowserUnsubscribe = () => void;

export interface BrowserLeaseRecord {
	readonly lease: BrowserCommandLease;
	readonly binding: BrowserLeaseBinding;
	readonly capturedLink: ThreadLinkBindingSnapshot;
}

/** Process-lifetime lease authority retained while a source generation is replaced. */
export interface BrowserLeaseLedger {
	active: BrowserLeaseRecord | null;
	readonly retired: Map<BrowserCommandId, BrowserLeaseRecord>;
}

export type BrowserApprovalCommand = Extract<
	BrowserCommand,
	{ readonly command: "approvalRespond" }
>;
export type BrowserAccountLoginCommand = Extract<
	BrowserCommand,
	{ readonly command: "accountLogin" }
>;
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
export type BrowserThreadLinkTargetCommand = Extract<
	BrowserCommand,
	{ readonly command: "threadLinkAttach" | "threadLinkRelink" }
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
	readonly paneId: string;
	readonly commandId: BrowserCommandId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly link: ThreadLinkSnapshot;
	readonly linkRevision: number;
}

export interface BrowserProjectionContext {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly binding: ThreadLinkBindingSnapshot;
	readonly lease: BrowserCommandLease | null;
	/** The exact socket has installed a usable browser-local media owner. */
	readonly mediaReady: boolean;
}

/**
 * A projection is read from the owners that already hold Codex state. The
 * gateway does not retain any of these values as a second domain store.
 */
export interface BrowserProjectionPort {
	readonly read: (context: BrowserProjectionContext) => BrowserOwnerProjection;
	/** One owner notification source may fan out all projection changes. */
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
}

export interface BrowserActionContext extends BrowserLeaseBinding {}

export type BrowserDisconnectReason =
	| "browser_disconnected"
	| "child_disconnected"
	| "gateway_shutdown";

/**
 * Browser-only host settlement. Typed Codex request and result values end at
 * their session owner; the gateway never mirrors them into a second result.
 */
export type BrowserActionResult = void | {
	readonly outcome: DeliveryOutcome;
	readonly message?: string;
	/** The browser applies this answer to its local peer and owns remote media attachment. */
	readonly realtimeAnswer?: AnswerSdp;
	/** Stable opaque handle returned by start and echoed by append/stop. */
	readonly realtimeSessionHandle?: string;
};

export interface BrowserAccountActions {
	readonly read: (input: {
		readonly browserId: BrowserConnectionId;
		readonly paneId: string;
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
	readonly attach: (
		command: BrowserThreadLinkTargetCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly relink: (
		command: BrowserThreadLinkTargetCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly onBrowserDisconnect?: (
		context: BrowserActionContext,
		reason: BrowserDisconnectReason,
	) => Promise<void> | void;
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

export interface BrowserOrdinaryApprovalActions {
	readonly pending: (requestId: JsonRpcRequestId) => ApprovalOwnerView | null;
	readonly resolve: (
		command: BrowserApprovalCommand,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly acknowledge: (requestId: JsonRpcRequestId) => void;
	/** Retires spontaneous terminals only after every live browser received the published snapshot. */
	readonly acknowledgePublished: (requestIds: readonly JsonRpcRequestId[]) => void;
	readonly onBrowserDisconnect?: (
		context: BrowserActionContext,
		reason: BrowserDisconnectReason,
	) => Promise<void> | void;
	readonly onChange?: (listener: () => void) => BrowserUnsubscribe;
}

export interface BrowserDynamicApprovalActions {
	readonly pending: () => readonly BrowserDynamicApproval[];
	readonly resolve: (
		command: BrowserDynamicApprovalResponse,
		context: BrowserActionContext,
	) => Promise<BrowserActionResult>;
	readonly onBrowserDisconnect?: (
		context: BrowserActionContext,
		reason: BrowserDisconnectReason,
	) => Promise<void> | void;
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
	readonly actions: BrowserWorkbenchActions;
	readonly lifecycle?: BrowserLifecyclePort;
	readonly leaseLedger?: BrowserLeaseLedger;
	readonly now?: () => number;
}

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

export class CodexWorkbenchGatewayError extends Error {
	override readonly name = "CodexWorkbenchGatewayError";
	readonly code: BrowserGatewayErrorCode;
	readonly outcome: DeliveryOutcome;
	readonly commandId: BrowserCommandId | null;
	override readonly cause: unknown;

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

export interface BrowserGatewaySnapshotMessage {
	readonly kind: "snapshot";
	readonly sequence: number;
	readonly snapshot: BrowserSnapshot;
}

export type BrowserSnapshotDelta = Partial<Omit<BrowserSnapshot, "kind" | "version">>;

export interface BrowserGatewayDeltaMessage {
	readonly kind: "delta";
	readonly sequence: number;
	readonly delta: BrowserSnapshotDelta;
}

export type BrowserGatewayMessage = BrowserGatewaySnapshotMessage | BrowserGatewayDeltaMessage;

export interface BrowserGatewayCommandResult {
	readonly kind: "command_result";
	readonly commandId: BrowserCommandId | null;
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
	readonly realtimeAnswer?: AnswerSdp;
	readonly realtimeSessionHandle?: string;
}

export interface BrowserGatewayAccountReadResult {
	readonly kind: "account_read";
	readonly outcome: DeliveryOutcome;
	readonly code: BrowserGatewayErrorCode | null;
	readonly message: string | null;
	readonly snapshot: BrowserSnapshot;
}

export interface BrowserGatewayClientState {
	readonly sequence: number;
	readonly snapshot: BrowserSnapshot;
}

export type BrowserGatewayApplyStatus = "applied" | "duplicate" | "stale" | "gap";

export interface BrowserGatewayApplyResult {
	readonly status: BrowserGatewayApplyStatus;
	readonly state: BrowserGatewayClientState | null;
}

export interface BrowserWorkbenchConnection {
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly instance: BrowserConnectionInstance;
	readonly snapshot: () => BrowserGatewaySnapshotMessage;
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
		paneId: string,
		instance?: BrowserConnectionInstance,
	) => BrowserWorkbenchConnection;
	readonly snapshot: (
		browserId: BrowserConnectionId,
		paneId: string,
	) => BrowserGatewaySnapshotMessage;
	readonly claimLease: (browserId: BrowserConnectionId, paneId: string) => BrowserCommandLease;
	readonly renewLease: (
		browserId: BrowserConnectionId,
		lease: Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">,
	) => BrowserCommandLease;
	readonly releaseLease: (
		browserId: BrowserConnectionId,
		paneId: string,
		commandId?: BrowserCommandId,
	) => BrowserCommandLease | null;
	readonly accountRead: (
		browserId: BrowserConnectionId,
		paneId: string,
	) => Promise<BrowserGatewayAccountReadResult>;
	readonly command: (
		browserId: BrowserConnectionId,
		command: unknown,
	) => Promise<BrowserGatewayCommandResult>;
	readonly subscribe: (
		browserId: BrowserConnectionId,
		paneId: string,
		listener: (message: BrowserGatewayMessage) => void,
	) => BrowserUnsubscribe;
	readonly closeConnection: (
		browserId: BrowserConnectionId,
		paneId: string,
		instance: BrowserConnectionInstance,
	) => Promise<void>;
	readonly childExit: (childId: ChildId, epoch: ChildEpoch) => Promise<void>;
	readonly dispose: () => Promise<void>;
}

export type { BrowserCommandLease, BrowserSnapshot, BrowserThreadLink, ThreadLinkBindingSnapshot };
