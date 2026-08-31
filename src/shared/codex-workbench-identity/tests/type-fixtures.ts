import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	IdentityAuthority,
	IdentityIssuer,
	IdentityValidator,
	ItemId,
	JsonRpcRequestId,
	LogicalToolCallCorrelation,
	LoginId,
	OperationId,
	OperationAuthority,
	OperationIdIssuer,
	OperationIdValidator,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
	TrustedIdentityDecoder,
	TrustedOperationIdDecoder,
	WireRequestCorrelation,
} from "../index.js";

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;
type Assert<T extends true> = T;
type AssertFalse<T extends false> = T;

declare const child: ChildId;
declare const childEpoch: ChildEpoch;
declare const thread: ThreadId;
declare const turn: TurnId;
declare const item: ItemId;
declare const queue: QueuedSubmissionId;
declare const login: LoginId;
declare const request: JsonRpcRequestId;
declare const browserCommand: BrowserCommandId;
declare const toolCall: DynamicToolCallId;
declare const realtime: RealtimeSessionId;
declare const approval: ApprovalId;
declare const operation: OperationId;
declare const validator: IdentityValidator;
declare const issuer: IdentityIssuer;
declare const decoder: TrustedIdentityDecoder;
declare const identityAuthority: IdentityAuthority;
declare const operationValidator: OperationIdValidator;
declare const operationIssuer: OperationIdIssuer;
declare const operationDecoder: TrustedOperationIdDecoder;

// Every directed pair is checked so adding a shared string brand cannot make
// one of the six protocol identities silently interchangeable.
type _NoThreadCrossAssignment = [
	AssertFalse<IsAssignable<ThreadId, TurnId>>,
	AssertFalse<IsAssignable<ThreadId, ItemId>>,
	AssertFalse<IsAssignable<ThreadId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<ThreadId, LoginId>>,
	AssertFalse<IsAssignable<ThreadId, JsonRpcRequestId>>,
	AssertFalse<IsAssignable<TurnId, ThreadId>>,
	AssertFalse<IsAssignable<TurnId, ItemId>>,
	AssertFalse<IsAssignable<TurnId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<TurnId, LoginId>>,
	AssertFalse<IsAssignable<TurnId, JsonRpcRequestId>>,
];

type _NoItemCrossAssignment = [
	AssertFalse<IsAssignable<ItemId, ThreadId>>,
	AssertFalse<IsAssignable<ItemId, TurnId>>,
	AssertFalse<IsAssignable<ItemId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<ItemId, LoginId>>,
	AssertFalse<IsAssignable<ItemId, JsonRpcRequestId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, ThreadId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, TurnId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, ItemId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, LoginId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, JsonRpcRequestId>>,
];

type _NoLoginRequestCrossAssignment = [
	AssertFalse<IsAssignable<LoginId, ThreadId>>,
	AssertFalse<IsAssignable<LoginId, TurnId>>,
	AssertFalse<IsAssignable<LoginId, ItemId>>,
	AssertFalse<IsAssignable<LoginId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<LoginId, JsonRpcRequestId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, ThreadId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, TurnId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, ItemId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, LoginId>>,
];

type _OtherIdentitiesRemainOpaque = [
	AssertFalse<IsAssignable<ChildId, ChildEpoch>>,
	AssertFalse<IsAssignable<BrowserCommandId, DynamicToolCallId>>,
	AssertFalse<IsAssignable<RealtimeSessionId, ApprovalId>>,
];

type _OperationIdRemainsOpaque = [
	AssertFalse<IsAssignable<string, OperationId>>,
	AssertFalse<IsAssignable<OperationId, ChildId>>,
	AssertFalse<IsAssignable<OperationId, ChildEpoch>>,
	AssertFalse<IsAssignable<OperationId, BrowserCommandId>>,
	AssertFalse<IsAssignable<OperationId, ThreadId>>,
	AssertFalse<IsAssignable<OperationId, TurnId>>,
	AssertFalse<IsAssignable<OperationId, ItemId>>,
	AssertFalse<IsAssignable<OperationId, QueuedSubmissionId>>,
	AssertFalse<IsAssignable<OperationId, LoginId>>,
	AssertFalse<IsAssignable<OperationId, JsonRpcRequestId>>,
	AssertFalse<IsAssignable<OperationId, DynamicToolCallId>>,
	AssertFalse<IsAssignable<OperationId, RealtimeSessionId>>,
	AssertFalse<IsAssignable<OperationId, ApprovalId>>,
	AssertFalse<IsAssignable<ChildId, OperationId>>,
	AssertFalse<IsAssignable<ChildEpoch, OperationId>>,
	AssertFalse<IsAssignable<BrowserCommandId, OperationId>>,
	AssertFalse<IsAssignable<ThreadId, OperationId>>,
	AssertFalse<IsAssignable<TurnId, OperationId>>,
	AssertFalse<IsAssignable<ItemId, OperationId>>,
	AssertFalse<IsAssignable<QueuedSubmissionId, OperationId>>,
	AssertFalse<IsAssignable<LoginId, OperationId>>,
	AssertFalse<IsAssignable<JsonRpcRequestId, OperationId>>,
	AssertFalse<IsAssignable<DynamicToolCallId, OperationId>>,
	AssertFalse<IsAssignable<RealtimeSessionId, OperationId>>,
	AssertFalse<IsAssignable<ApprovalId, OperationId>>,
];

type _BroadIdentityCapabilitiesRemainNarrow = [
	AssertFalse<"isCurrentOperationId" extends keyof IdentityValidator ? true : false>,
	AssertFalse<"assertCurrentOperationId" extends keyof IdentityValidator ? true : false>,
	AssertFalse<"validateOperationId" extends keyof IdentityValidator ? true : false>,
	AssertFalse<"mintOperationId" extends keyof IdentityIssuer ? true : false>,
	AssertFalse<"parseOperationId" extends keyof TrustedIdentityDecoder ? true : false>,
	AssertFalse<"serializeOperationId" extends keyof TrustedIdentityDecoder ? true : false>,
	AssertFalse<"operation" extends keyof IdentityAuthority ? true : false>,
	Assert<
		Equal<
			keyof OperationIdValidator,
			"isCurrentOperationId" | "assertCurrentOperationId" | "validateOperationId"
		>
	>,
	Assert<Equal<keyof OperationIdIssuer, "mintOperationId">>,
	Assert<Equal<keyof TrustedOperationIdDecoder, "parseOperationId" | "serializeOperationId">>,
	Assert<Equal<keyof OperationAuthority, "validator" | "issuer" | "decoder">>,
];

type _ExactCorrelationKeys = [
	Assert<Equal<keyof WireRequestCorrelation, "child" | "epoch" | "requestId">>,
	Assert<
		Equal<
			keyof LogicalToolCallCorrelation,
			"child" | "epoch" | "threadId" | "turnId" | "callId" | "namespace" | "tool" | "manifestHash"
		>
	>,
];

// Ordinary consumers receive this capability, never the trusted decoder.
// @ts-expect-error IdentityValidator must not expose brand-producing adoption.
validator.adoptThreadId("thread");
// @ts-expect-error IdentityValidator must not expose a request parser.
validator.parseJsonRpcRequestId("request");
// @ts-expect-error IdentityIssuer must not adopt server-owned identities.
issuer.adoptThreadId("thread");
// @ts-expect-error Broad identity validation must not expose operation IDs.
validator.isCurrentOperationId(operation);
// @ts-expect-error Broad identity issuance must not expose operation IDs.
issuer.mintOperationId();
// @ts-expect-error Broad trusted decoding must not parse operation IDs.
decoder.parseOperationId(operation);
// @ts-expect-error Broad trusted decoding must not serialize operation IDs.
decoder.serializeOperationId(operation);
// @ts-expect-error Unrelated consumers accepting IdentityAuthority cannot reach operations.
void identityAuthority.operation;

// The operation capability is the exact reusable type accepted by the three
// future workbench mutation owners.
operationValidator.assertCurrentOperationId(operation);
operationValidator.validateOperationId(operation);
operationIssuer.mintOperationId();
operationDecoder.parseOperationId(operation);
operationDecoder.serializeOperationId(operation);
// @ts-expect-error OperationId cannot be supplied as a plain string.
operationIssuer.mintOperationId("caller-supplied");
// @ts-expect-error Validation does not mint or adopt operation identities.
operationValidator.adoptOperationId("operation");
// @ts-expect-error Trusted operation decoding has no server-owned adoption.
operationDecoder.adoptOperationId("operation");
// @ts-expect-error OperationId is not a server-owned Codex identity.
decoder.serializeCodexIdentity(operation);

export type IdentityTypeFixture = [
	typeof child,
	typeof childEpoch,
	typeof thread,
	typeof turn,
	typeof item,
	typeof queue,
	typeof login,
	typeof request,
	typeof browserCommand,
	typeof toolCall,
	typeof realtime,
	typeof approval,
	_NoThreadCrossAssignment,
	_NoItemCrossAssignment,
	_NoLoginRequestCrossAssignment,
	_OtherIdentitiesRemainOpaque,
	_OperationIdRemainsOpaque,
	_BroadIdentityCapabilitiesRemainNarrow,
	_ExactCorrelationKeys,
];
