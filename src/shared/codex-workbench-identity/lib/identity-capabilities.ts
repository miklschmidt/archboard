// The capability interfaces of the identity authority: what each kind of
// owner is allowed to do with identities, kept as separate objects so a
// mutation owner can be handed a validator without an issuer or decoder.

import type {
	LogicalToolCallCorrelation,
	LogicalToolCallCorrelationInput,
	WireRequestCorrelation,
	WireRequestCorrelationInput,
} from "@/shared/codex-workbench-identity/lib/identity-correlations";
import type {
	AdoptedCodexResponseIdentityBatch,
	CodexResponseIdentityBatch,
} from "@/shared/codex-workbench-identity/lib/identity-ledger";
import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	CodexIdentity,
	DynamicToolCallId,
	ItemId,
	JsonRpcRequestId,
	JsonRpcRequestIdWireValue,
	LoginId,
	OperationId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity/lib/identity-values";

interface IdentityValidator {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly isCurrentEpoch: (child: ChildId, epoch: ChildEpoch) => boolean;
	readonly assertCurrentEpoch: (child: ChildId, epoch: ChildEpoch) => void;
}

/** The only capability ordinary mutation owners need to validate an OperationId. */
interface OperationIdValidator {
	readonly isCurrentOperationId: (operationId: OperationId) => boolean;
	readonly assertCurrentOperationId: (operationId: OperationId) => void;
}

/** Host-owned IDs are minted here; server-owned IDs can only enter via the trusted decoder. */
interface IdentityIssuer {
	readonly mintBrowserCommandId: () => BrowserCommandId;
	readonly mintJsonRpcRequestId: () => JsonRpcRequestId;
	readonly mintRealtimeSessionId: () => RealtimeSessionId;
	readonly mintChildEpoch: () => ChildEpoch;
}

/** The only capability that can issue a host-owned OperationId. */
interface OperationIdIssuer {
	readonly mintOperationId: () => OperationId;
}

/**
 * This capability is passed only to protocol decoders. Its adoption methods
 * are deliberately absent from IdentityValidator and IdentityIssuer.
 */
interface TrustedIdentityDecoder {
	readonly parseChildId: (value: unknown) => ChildId;
	readonly parseChildEpoch: (value: unknown) => ChildEpoch;
	readonly parseBrowserCommandId: (value: unknown) => BrowserCommandId;
	readonly parseThreadId: (value: unknown) => ThreadId;
	readonly parseTurnId: (value: unknown) => TurnId;
	readonly parseItemId: (value: unknown) => ItemId;
	readonly parseQueuedSubmissionId: (value: unknown) => QueuedSubmissionId;
	readonly parseLoginId: (value: unknown) => LoginId;
	readonly parseJsonRpcRequestId: (value: unknown) => JsonRpcRequestId;
	readonly parseDynamicToolCallId: (value: unknown) => DynamicToolCallId;
	readonly parseRealtimeSessionId: (value: unknown) => RealtimeSessionId;
	readonly parseApprovalId: (value: unknown) => ApprovalId;
	/** Resolves a raw Codex thread id only when this authority already issued it. */
	readonly resolveThreadId: (raw: unknown) => ThreadId;
	/** Resolves a raw Codex item id only when this authority already issued it. */
	readonly resolveItemId: (raw: unknown) => ItemId;
	readonly adoptThreadId: (raw: unknown) => ThreadId;
	readonly adoptTurnId: (raw: unknown) => TurnId;
	readonly adoptItemId: (raw: unknown) => ItemId;
	readonly adoptQueuedSubmissionId: (raw: unknown) => QueuedSubmissionId;
	readonly adoptLoginId: (raw: unknown) => LoginId;
	readonly adoptJsonRpcRequestId: (raw: unknown) => JsonRpcRequestId;
	readonly adoptDynamicToolCallId: (raw: unknown) => DynamicToolCallId;
	readonly adoptApprovalId: (raw: unknown) => ApprovalId;
	/** Validates a complete decoded response before adopting any identity from it. */
	readonly adoptCodexResponseIdentities: (
		batch: CodexResponseIdentityBatch,
	) => AdoptedCodexResponseIdentityBatch;
	readonly serializeCodexIdentity: (identity: CodexIdentity) => string;
	readonly serializeJsonRpcRequestId: (identity: JsonRpcRequestId) => JsonRpcRequestIdWireValue;
	readonly createWireRequestCorrelation: (
		input: WireRequestCorrelationInput,
	) => WireRequestCorrelation;
	readonly parseWireRequestCorrelation: (value: unknown) => WireRequestCorrelation;
	readonly createLogicalToolCallCorrelation: (
		input: LogicalToolCallCorrelationInput,
	) => LogicalToolCallCorrelation;
	readonly parseLogicalToolCallCorrelation: (value: unknown) => LogicalToolCallCorrelation;
}

/** Trusted protocol code may parse and serialize, but never adopt, OperationIds. */
interface TrustedOperationIdDecoder {
	readonly parseOperationId: (value: unknown) => OperationId;
	readonly serializeOperationId: (identity: OperationId) => string;
}

/** The complete operation capability is composed only at the authority boundary. */
interface OperationAuthority {
	readonly validator: OperationIdValidator;
	readonly issuer: OperationIdIssuer;
	readonly decoder: TrustedOperationIdDecoder;
}

interface IdentityAuthority {
	readonly validator: IdentityValidator;
	readonly issuer: IdentityIssuer;
	readonly decoder: TrustedIdentityDecoder;
}

/** The factory return type composes legacy identity capabilities with operation capabilities. */
interface IdentityAuthorities {
	readonly identity: IdentityAuthority;
	readonly operation: OperationAuthority;
}

export type {
	IdentityValidator,
	OperationIdValidator,
	IdentityIssuer,
	OperationIdIssuer,
	TrustedIdentityDecoder,
	TrustedOperationIdDecoder,
	OperationAuthority,
	IdentityAuthority,
	IdentityAuthorities,
};
