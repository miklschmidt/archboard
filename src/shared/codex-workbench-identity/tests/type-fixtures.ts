import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	IdentityIssuer,
	IdentityValidator,
	ItemId,
	JsonRpcRequestId,
	LogicalToolCallCorrelation,
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
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
declare const validator: IdentityValidator;
declare const issuer: IdentityIssuer;

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
	_ExactCorrelationKeys,
];
