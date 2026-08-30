import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	ItemId,
	JsonRpcRequestId,
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../index.js";

declare const childEpoch: ChildEpoch;
declare const child: ChildId;
declare const browserCommand: BrowserCommandId;
declare const thread: ThreadId;
declare const turn: TurnId;
declare const item: ItemId;
declare const queue: QueuedSubmissionId;
declare const login: LoginId;
declare const request: JsonRpcRequestId;
declare const toolCall: DynamicToolCallId;
declare const realtime: RealtimeSessionId;
declare const approval: ApprovalId;

// Each identity domain is intentionally rejected by the compiler when used in
// another domain. These fixtures are part of the strict type-check surface.
// @ts-expect-error ThreadId and TurnId are not interchangeable.
const wrongThread: ThreadId = turn;
// @ts-expect-error ItemId and QueuedSubmissionId are not interchangeable.
const wrongItem: ItemId = queue;
// @ts-expect-error LoginId and JsonRpcRequestId are not interchangeable.
const wrongLogin: LoginId = request;
// @ts-expect-error BrowserCommandId and DynamicToolCallId are not interchangeable.
const wrongCommand: BrowserCommandId = toolCall;
// @ts-expect-error RealtimeSessionId and ApprovalId are not interchangeable.
const wrongRealtime: RealtimeSessionId = approval;
// @ts-expect-error ChildId is not a ChildEpoch.
const wrongEpoch: ChildEpoch = child;

export type IdentityTypeFixture = [
	typeof childEpoch,
	typeof child,
	typeof browserCommand,
	typeof thread,
	typeof turn,
	typeof item,
	typeof queue,
	typeof login,
	typeof request,
	typeof toolCall,
	typeof realtime,
	typeof approval,
	typeof wrongThread,
	typeof wrongItem,
	typeof wrongLogin,
	typeof wrongCommand,
	typeof wrongRealtime,
	typeof wrongEpoch,
];
