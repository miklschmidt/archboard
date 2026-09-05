import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexSession,
	ExactSessionRequestIdentityTuple,
	SessionAgentMessageItem,
	SessionCollabAgentItem,
	SessionParams,
	SessionQueuedSubmission,
	SessionRequestIdentityField,
	SessionSubAgentActivityItem,
	SessionThread,
	SessionThreadItem,
	SessionThreadSpawnSource,
	SessionTurn,
} from "../index.js";

declare const session: CodexSession;
declare const threadId: ThreadId;

const turns = { threadId } satisfies SessionParams<"thread/turns/list">;
const items = { threadId } satisfies SessionParams<"thread/items/list">;
const queue = { threadId } satisfies SessionParams<"thread/queue/list">;
const timeline = { threadId } satisfies SessionParams<"thread/timeline/list">;

void session.threadTurnsListPage(turns);
void session.threadItemsListPage(items);
void session.queueListPage(queue);
void session.timelineListPage(timeline);

// @ts-expect-error The generated thread/turns/list request requires threadId.
void session.threadTurnsListPage();
// @ts-expect-error The generated thread/items/list request requires threadId.
void session.threadItemsListPage();
// @ts-expect-error The generated thread/queue/list request requires threadId.
void session.queueListPage();
// @ts-expect-error The generated thread/timeline/list request requires threadId.
void session.timelineListPage();

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;
type Result<Method extends keyof CodexSession> = Awaited<ReturnType<CodexSession[Method]>>;

type HostedLogin = Extract<Result<"accountLogin">, { readonly type: "chatgpt" }>;
type ThreadStart = Result<"threadStart">;
type ThreadItems = Result<"threadItemsListPage">;
type QueueAdd = Result<"queueAdd">;
type Timeline = Result<"timelineListPage">;
type RawThread = ResponsePayloads["thread/read"]["thread"];
type RawTurn = ResponsePayloads["turn/start"]["turn"];
type RawThreadItem = RawTurn["items"][number];
type RawAgentMessage = Extract<RawThreadItem, { readonly type: "agentMessage" }>;
type RawCollabAgent = Extract<RawThreadItem, { readonly type: "collabAgentToolCall" }>;
type RawImageGenerationItem = Extract<RawThreadItem, { readonly type: "imageGeneration" }>;
type RawQueuedSubmission = ResponsePayloads["thread/queue/add"]["queuedSubmission"];
type SessionImageGenerationItem = Extract<SessionThreadItem, { readonly type: "imageGeneration" }>;
type SessionMcpToolCallItem = Extract<SessionThreadItem, { readonly type: "mcpToolCall" }>;
type SessionMcpArgumentsObject = Extract<
	SessionMcpToolCallItem["arguments"],
	Readonly<Record<string, unknown>>
>;
type SessionMcpNestedArray = Extract<SessionMcpArgumentsObject[string], readonly unknown[]>;

declare const brandedTurn: SessionTurn;
declare const brandedItem: SessionThreadItem;
declare const itemId: ItemId;
declare const rawTurn: RawTurn;
declare const rawItem: RawThreadItem;
declare const rawThreadId: string;
declare const threadResult: ThreadStart;
declare const turnResult: SessionTurn;
declare const threadPage: Result<"threadListPage">;
declare const citation: NonNullable<SessionAgentMessageItem["memoryCitation"]>;
declare const collabItem: SessionCollabAgentItem;
declare const mcpArgumentsObject: SessionMcpArgumentsObject;
declare const mcpNestedArray: SessionMcpNestedArray;

declare function acceptSessionTurns(value: SessionThread["turns"]): void;
declare function acceptSessionItems(value: SessionTurn["items"]): void;
declare function acceptSessionThreadIds(value: typeof citation.threadIds): void;
declare function acceptSessionImageGeneration(value: SessionImageGenerationItem): void;

const rawImageGenerationWithoutOptional = {
	type: "imageGeneration",
	id: "raw-image-item",
	status: "completed",
	revisedPrompt: null,
	result: "/tmp/generated.png",
	failure: null,
} satisfies RawImageGenerationItem;
const imageGenerationWithoutOptional = {
	...rawImageGenerationWithoutOptional,
	id: itemId,
} satisfies SessionImageGenerationItem;

acceptSessionTurns([brandedTurn]);
acceptSessionItems([brandedItem]);
acceptSessionThreadIds([threadId]);
acceptSessionImageGeneration(imageGenerationWithoutOptional);
void collabItem.agentsStates[threadId];
// @ts-expect-error A raw turn has no branded TurnId or ItemIds.
acceptSessionTurns([rawTurn]);
// @ts-expect-error A raw item has no branded ItemId.
acceptSessionItems([rawItem]);
// @ts-expect-error Session thread identity arrays reject raw strings.
acceptSessionThreadIds([rawThreadId]);
// @ts-expect-error Session thread turns are readonly.
threadResult.thread.turns.push(brandedTurn);
// @ts-expect-error Session turn items are readonly.
turnResult.items.push(brandedItem);
// @ts-expect-error Session page data is readonly.
threadPage.data.push(threadResult.thread);
// @ts-expect-error Session citation threadIds are readonly.
citation.threadIds.push(threadId);
if (threadResult.thread.status.type === "active") {
	// @ts-expect-error Session thread active flags are readonly.
	threadResult.thread.status.activeFlags[0] = "waitingOnApproval";
}
// @ts-expect-error Session MCP argument object keys are readonly.
mcpArgumentsObject["nested"] = [];
// @ts-expect-error Arrays nested in Session MCP argument objects are readonly.
mcpNestedArray[0] = null;
const collabState = collabItem.agentsStates[threadId];
if (collabState !== undefined) {
	// @ts-expect-error Session collab state values are recursively readonly.
	collabState.message = "changed";
}
// @ts-expect-error Agent state maps require a branded ThreadId key.
void collabItem.agentsStates[rawThreadId];
// @ts-expect-error imageGeneration requires its result field even when optional fields are omitted.
acceptSessionImageGeneration({
	type: "imageGeneration",
	id: itemId,
	status: "completed",
	revisedPrompt: null,
	failure: null,
});

declare function acceptExactRequestIdentities<
	Method extends ResponseMethod,
	Value extends readonly SessionRequestIdentityField[],
>(method: Method, value: Value & ExactSessionRequestIdentityTuple<Method, Value>): void;

acceptExactRequestIdentities("thread/read", ["threadId"] as const);
// @ts-expect-error thread/read must name its branded threadId.
acceptExactRequestIdentities("thread/read", [] as const);
// @ts-expect-error turnId is not an identity-bearing thread/read request property.
acceptExactRequestIdentities("thread/read", ["threadId", "turnId"] as const);
// @ts-expect-error each identity-bearing request property must appear exactly once.
acceptExactRequestIdentities("thread/read", ["threadId", "threadId"] as const);

type SessionResponseIdentityFixture = [
	Assert<Equal<HostedLogin["loginId"], LoginId>>,
	Assert<Equal<ThreadStart["thread"]["id"], ThreadId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["id"], TurnId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["items"][number]["id"], ItemId>>,
	Assert<Equal<ThreadItems["data"][number]["turnId"], TurnId>>,
	Assert<Equal<QueueAdd["queuedSubmission"]["id"], QueuedSubmissionId>>,
	Assert<Equal<SessionThreadSpawnSource["thread_spawn"]["parent_thread_id"], ThreadId>>,
	Assert<
		Equal<NonNullable<SessionAgentMessageItem["memoryCitation"]>["threadIds"][number], ThreadId>
	>,
	Assert<Equal<SessionCollabAgentItem["senderThreadId"], ThreadId>>,
	Assert<Equal<SessionCollabAgentItem["receiverThreadIds"][number], ThreadId>>,
	Assert<
		Equal<SessionCollabAgentItem["agentsStates"][ThreadId], RawCollabAgent["agentsStates"][string]>
	>,
	Assert<Equal<SessionSubAgentActivityItem["agentThreadId"], ThreadId>>,
	Assert<Equal<Extract<Timeline["data"][number], { type: "turnStarted" }>["turnId"], string>>,
];

type SessionResponseShapeFixture = [
	Assert<Equal<SessionThread["preview"], RawThread["preview"]>>,
	Assert<Equal<SessionTurn["status"], RawTurn["status"]>>,
	Assert<Equal<SessionAgentMessageItem["text"], RawAgentMessage["text"]>>,
	Assert<
		Equal<
			SessionQueuedSubmission["clientUserMessageId"],
			RawQueuedSubmission["clientUserMessageId"]
		>
	>,
];

type SessionPageParameterFixture = [typeof turns, typeof items, typeof queue, typeof timeline];

export {
	type SessionResponseIdentityFixture,
	type SessionResponseShapeFixture,
	type SessionPageParameterFixture,
};
