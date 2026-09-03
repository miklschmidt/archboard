import type { CodexServerResponseByMethod } from "../../../shared/codex-app-server-contract/index.js";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	IdentityAuthority,
	ItemId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	HumanApprovalMethod,
	ReverseResponse,
	TransportServerRequest,
	TransportServerRequestListener,
} from "../../codex-transport/server-requests.js";

type Unsubscribe = () => void;

export type ApprovalFamily =
	| "command_execution"
	| "file_change"
	| "user_input"
	| "elicitation"
	| "permissions"
	| "apply_patch"
	| "exec_command";

export type ApprovalState =
	| "staged"
	| "pending"
	| "settled"
	| "expired"
	| "cancelled"
	| "stale"
	| "outcome_unknown";

export type ApprovalOutcome = "delivered" | "not_delivered" | "outcome_unknown";
export type TerminalApprovalState = Exclude<ApprovalState, "staged" | "pending">;
export type ApprovalDecision = "approved" | "declined" | "cancelled";
export type ApprovalTerminalDelivery = "authored_response" | "after_publish" | null;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type DeepReadonly<Value> = Value extends Primitive
	? Value
	: Value extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: Value extends object
			? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
			: Value;

type ApprovalResponseFor<
	Kind extends ApprovalFamily,
	Method extends HumanApprovalMethod,
> = Readonly<{ approvalKind: Kind }> & CodexServerResponseByMethod[Method];

/** The generated reverse-response values accepted by the approval owner. */
export type ApprovalResponse =
	| ApprovalResponseFor<"command_execution", "item/commandExecution/requestApproval">
	| ApprovalResponseFor<"file_change", "item/fileChange/requestApproval">
	| ApprovalResponseFor<"user_input", "item/tool/requestUserInput">
	| ApprovalResponseFor<"elicitation", "mcpServer/elicitation/request">
	| ApprovalResponseFor<"permissions", "item/permissions/requestApproval">
	| ApprovalResponseFor<"apply_patch", "applyPatchApproval">
	| ApprovalResponseFor<"exec_command", "execCommandApproval">;

export interface ApprovalBinding {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly link: string | null;
	readonly target: string;
	readonly effect: string;
}

/** A caller may omit values that the broker can derive from the request. */
export type ApprovalBindingInput = Readonly<Partial<ApprovalBinding>>;

export interface ItemApprovalIdentity {
	readonly kind: "item";
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId | null;
}

export interface ElicitationApprovalIdentity {
	readonly kind: "elicitation";
	readonly threadId: ThreadId;
	readonly turnId: TurnId | null;
	readonly serverName: string;
	readonly elicitationId: string | null;
}

export interface LegacyApprovalIdentity {
	readonly kind: "legacy";
	readonly conversationId: ThreadId;
	readonly callId: DynamicToolCallId;
	readonly approvalId: ApprovalId | null;
}

export type ApprovalRequestIdentity =
	| ItemApprovalIdentity
	| ElicitationApprovalIdentity
	| LegacyApprovalIdentity;

type HumanRequest<Method extends HumanApprovalMethod> = Extract<
	TransportServerRequest,
	{ readonly owner: "codex-approvals"; readonly method: Method }
>;

type ApprovalRequestBase<
	Family extends ApprovalFamily,
	Method extends HumanApprovalMethod,
	Identity extends ApprovalRequestIdentity,
	Request extends HumanRequest<Method> = HumanRequest<Method>,
> = {
	readonly family: Family;
	readonly method: Method;
	readonly request: Request;
	readonly params: Request["params"];
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
	readonly identity: Identity;
	readonly binding: ApprovalBinding;
	readonly expiresAtMs: number;
};

export type CommandApprovalRequest = ApprovalRequestBase<
	"command_execution",
	"item/commandExecution/requestApproval",
	ItemApprovalIdentity
> & {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId | null;
};

export type FileApprovalRequest = ApprovalRequestBase<
	"file_change",
	"item/fileChange/requestApproval",
	ItemApprovalIdentity
> & {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId | null;
};

export type UserInputApprovalRequest = ApprovalRequestBase<
	"user_input",
	"item/tool/requestUserInput",
	ItemApprovalIdentity
> & {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: null;
};

export type ElicitationApprovalRequest = ApprovalRequestBase<
	"elicitation",
	"mcpServer/elicitation/request",
	ElicitationApprovalIdentity
> & {
	readonly threadId: ThreadId;
	readonly turnId: TurnId | null;
	readonly serverName: string;
	readonly elicitationId: string | null;
	readonly itemId: null;
	readonly approvalId: null;
};

export type PermissionsApprovalRequest = ApprovalRequestBase<
	"permissions",
	"item/permissions/requestApproval",
	ItemApprovalIdentity
> & {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: null;
};

export type ApplyPatchApprovalRequest = ApprovalRequestBase<
	"apply_patch",
	"applyPatchApproval",
	LegacyApprovalIdentity
> & {
	readonly conversationId: ThreadId;
	readonly callId: DynamicToolCallId;
	readonly approvalId: null;
	readonly threadId: ThreadId;
	readonly turnId: null;
	readonly itemId: null;
};

export type ExecCommandApprovalRequest = ApprovalRequestBase<
	"exec_command",
	"execCommandApproval",
	LegacyApprovalIdentity
> & {
	readonly conversationId: ThreadId;
	readonly callId: DynamicToolCallId;
	readonly approvalId: ApprovalId | null;
	readonly threadId: ThreadId;
	readonly turnId: null;
	readonly itemId: null;
};

/** The only request union accepted by the approval broker. */
export type ApprovalRequest =
	| CommandApprovalRequest
	| FileApprovalRequest
	| UserInputApprovalRequest
	| ElicitationApprovalRequest
	| PermissionsApprovalRequest
	| ApplyPatchApprovalRequest
	| ExecCommandApprovalRequest;

export interface ApprovalSnapshot {
	readonly kind: "approval";
	readonly family: ApprovalFamily;
	readonly method: HumanApprovalMethod;
	readonly requestId: JsonRpcRequestId;
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId | null;
	readonly itemId: ItemId | null;
	readonly approvalId: ApprovalId | null;
	readonly identity: ApprovalRequestIdentity;
	readonly binding: ApprovalBinding;
	readonly expiresAtMs: number;
	readonly state: ApprovalState;
	readonly outcome: ApprovalOutcome | null;
	readonly decision: ApprovalDecision | null;
	readonly reason: string | null;
}

/** Normalized request plus owner settlement state, before browser presentation. */
export interface ApprovalOwnerView {
	readonly kind: "approval_owner";
	readonly request: DeepReadonly<ApprovalRequest>;
	readonly snapshot: DeepReadonly<ApprovalSnapshot>;
	readonly spoken: DeepReadonly<SpokenEligibility>;
	readonly terminalDelivery: ApprovalTerminalDelivery;
}

/**
 * The immutable one-line effect disclosure used to bind a spoken prompt to
 * the normalized command approval that produced it.
 */
export type SpokenApprovalEffectPresentation = Pick<
	ApprovalSnapshot,
	"requestId" | "child" | "epoch" | "threadId" | "turnId" | "itemId" | "approvalId" | "binding"
> & {
	readonly family: "command_execution";
	readonly effectSummary: string;
};

export interface ApprovalResolveInput {
	readonly requestId: JsonRpcRequestId;
	readonly approvalId?: ApprovalId | null;
	readonly response: ApprovalResponse;
	/** Evidence captured with the card. A mismatch is a stale ownership result. */
	readonly binding?: ApprovalBindingInput;
}

export interface ApprovalSettlement {
	readonly requestId: JsonRpcRequestId;
	readonly family: ApprovalFamily;
	readonly state: TerminalApprovalState;
	readonly outcome: ApprovalOutcome;
	readonly reason: string;
}

export type SpokenEligibilityReason =
	| "eligible"
	| "not_pending"
	| "stale_ownership"
	| "secret"
	| "multi_question"
	| "form"
	| "url"
	| "permission_scope"
	| "coordinator_blocking"
	| "unsupported_schema"
	| "broader_grant"
	| "not_binary";

export interface SpokenEligibility {
	readonly eligible: boolean;
	readonly reason: SpokenEligibilityReason;
}

export interface SpokenEligibilityFacts {
	readonly secret?: boolean;
	readonly coordinatorBlocking?: boolean;
	readonly unsupportedSchema?: boolean;
	readonly broaderGrant?: boolean;
}

export interface ApprovalResponsePort {
	readonly respond: (
		request: TransportServerRequest,
		owner: "codex-approvals",
		response: ReverseResponse,
	) => Promise<void>;
	readonly onServerRequest?: (listener: TransportServerRequestListener) => Unsubscribe;
	readonly onExit?: (
		listener: (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void,
	) => Unsubscribe;
}

export interface CodexApprovalBrokerOptions {
	readonly transport: ApprovalResponsePort;
	readonly identity: IdentityAuthority;
	readonly now?: () => number;
	readonly getCurrentBinding?: (request: ApprovalRequest) => ApprovalBindingInput;
	readonly getSpokenEligibilityFacts?: (request: ApprovalRequest) => SpokenEligibilityFacts;
	readonly onChange?: (snapshot: ApprovalSnapshot) => void;
	readonly onError?: (error: unknown, request?: TransportServerRequest) => void;
	/** Composition owns the sole request and exit listener cohort. */
	readonly listenerOwnership?: "self" | "composition";
}

export type CodexApprovalErrorCode =
	| "disposed"
	| "invalid_request"
	| "unsupported_request"
	| "duplicate_request"
	| "unknown_request"
	| "invalid_state"
	| "invalid_identity"
	| "invalid_response"
	| "identity_mismatch"
	| "stale_ownership"
	| "unsupported_schema"
	| "unsafe_url";

export class CodexApprovalError extends Error {
	override readonly name = "CodexApprovalError";
	readonly code: CodexApprovalErrorCode;
	readonly requestId?: JsonRpcRequestId;

	constructor(code: CodexApprovalErrorCode, message: string, requestId?: JsonRpcRequestId) {
		super(message);
		this.code = code;
		this.requestId = requestId;
	}
}

export interface CodexApprovalBroker {
	readonly stage: (request: TransportServerRequest) => ApprovalSnapshot;
	readonly receive: (request: TransportServerRequest) => ApprovalSnapshot;
	readonly pending: (requestId: JsonRpcRequestId) => ApprovalSnapshot;
	readonly get: (requestId: JsonRpcRequestId) => ApprovalSnapshot | undefined;
	readonly getRequest: (requestId: JsonRpcRequestId) => ApprovalRequest | undefined;
	readonly inspect: () => readonly ApprovalSnapshot[];
	readonly view: (requestId: JsonRpcRequestId) => ApprovalOwnerView;
	readonly inspectViews: () => readonly ApprovalOwnerView[];
	/** Removes one terminal card after its authored result or spontaneous browser publication. */
	readonly acknowledge: (requestId: JsonRpcRequestId) => void;
	readonly spokenEffectPresentation: (
		requestId: JsonRpcRequestId,
	) => SpokenApprovalEffectPresentation;
	readonly spokenEligibility: (requestId: JsonRpcRequestId) => SpokenEligibility;
	readonly resolve: (input: ApprovalResolveInput) => Promise<ApprovalSettlement>;
	readonly cancel: (requestId: JsonRpcRequestId, reason?: string) => Promise<ApprovalSettlement>;
	readonly expire: (requestId: JsonRpcRequestId) => Promise<ApprovalSettlement>;
	readonly markStale: (requestId: JsonRpcRequestId, reason?: string) => Promise<ApprovalSettlement>;
	readonly childExit: (exit: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
	}) => Promise<readonly ApprovalSettlement[]>;
	readonly dispose: () => void;
}
